import {
  CELL, CHUNK, WALL_T, DOOR_W, DOOR_H, SINK, STEPS, WALL_H, LOW_WALL,
  MALL_H1, MALL_ROOF, SKY_Y, WATER_Y,
} from './constants'
import {
  getLayout, lightAt, floorRange, isStair, isEsc, escUp, escUpper, DX, DZ, CEIL_Y,
  LIGHT_NONE, EDGE_OPEN, EDGE_WALL, EDGE_DOOR, EDGE_RAIL, EDGE_LOW, EDGE_SHOP, EDGE_SHOP_UP,
  KIND_STAIR, KIND_POOL, KIND_RAISED, KIND_VOID, CEIL_ATRIUM, CEIL_SKY, THEME_MALL,
} from './layout'

// Turns a chunk layout into renderable pieces:
//   walls / floors / ceilings / trim — axis-aligned boxes [x0, x1, y0, y1, z0, z1]
//     drawn with the chunk theme's materials
//   items — centred unit shapes { mat, shape, x, y, z, sx, sy, sz, yaw, pitch }
//     for fixtures and props (escalators, storefronts, palms, chairs…)
//   panels — ceiling light positions [x, y, z, …]
//   solid — collision boxes: walls, trim and invisible colliders
//
// Walls on a chunk border are built as two half-thickness slabs, one by each
// chunk, so each face gets its own area's materials.

const N = CHUNK
const SLAB = 0.12          // floor / ceiling tile thickness
const RAIL_H = 1.0
const LEDGE_DEPTH = 0.8
const T = WALL_T / 2

// Every (material, shape) pair the builders below emit. World creates one
// pooled draw for each up front, so keep this in sync when adding items.
export const ITEM_KINDS = [
  ['glass', 'box'], ['brass', 'box'], ['brass', 'cyl'], ['brass', 'tube'], ['marble', 'box'], ['marble', 'cyl'],
  ['storefront', 'vplane'], ['sign', 'vplane'], ['escUp', 'box'], ['escDown', 'box'], ['escStill', 'box'],
  ['escBody', 'box'], ['handrail', 'box'], ['water', 'up'], ['sky', 'down'], ['basin', 'tube'],
  ['fountainWater', 'cyl'], ['fall', 'tube'], ['fall', 'cyl'], ['planter', 'cyl'], ['soil', 'cyl'],
  ['trunk', 'cone'], ['frond', 'frond'], ['benchWood', 'box'], ['chair', 'box'], ['steel', 'cyl'],
  ['steel', 'box'], ['cardboard', 'box'], ['vendingBody', 'box'], ['vending', 'vplane'], ['wood', 'box'],
  ['tvBody', 'box'], ['tv', 'vplane'], ['exit', 'box'],
]

// ── Edges ────────────────────────────────────────────────────────────────

// One cell edge. `at` is the line coordinate, [s0, s1] its extent; a / b are
// the [kind, ceiling class] of the cells on the low / high side. `side` is 0
// for an interior edge, or −1 / +1 to build only the low / high half.
function edgeGeometry(g, type, alongZ, at, s0, s1, a, b, side, mall) {
  const [ka, ca] = a
  const [kb, cb] = b
  if (ka === KIND_VOID && kb === KIND_VOID) return
  const [fa0, fa1] = floorRange(ka)
  const [fb0, fb1] = floorRange(kb)
  const bottom = Math.min(fa0, fb0)
  const level = Math.max(fa1, fb1)
  const ceilA = CEIL_Y[ca]
  const ceilB = CEIL_Y[cb]
  const top = Math.max(ceilA, ceilB)
  const P = side === 0 ? [at - T, at + T] : side < 0 ? [at - T, at] : [at, at + T]
  const box = (list, e0, e1, y0, y1, p = P) => {
    if (alongZ) list.push([p[0], p[1], y0, y1, e0, e1])
    else list.push([e0, e1, y0, y1, p[0], p[1]])
  }
  const e0 = s0 - T
  const e1 = s1 + T
  const header = () => {
    if (ceilA !== ceilB && ka !== KIND_VOID && kb !== KIND_VOID) box(g.walls, e0, e1, Math.min(ceilA, ceilB), top)
  }

  if (type === EDGE_WALL) {
    box(g.walls, e0, e1, bottom, top)
  } else if (type === EDGE_DOOR) {
    const c = (s0 + s1) / 2
    const hw = DOOR_W / 2
    box(g.walls, e0, c - hw, bottom, top)
    box(g.walls, c + hw, e1, bottom, top)
    box(g.walls, c - hw, c + hw, level + DOOR_H, top)
  } else if (type === EDGE_LOW) {
    box(g.walls, e0, e1, bottom, level + LOW_WALL)
    box(g.trim, e0, e1, level + LOW_WALL, level + LOW_WALL + 0.04, [at - T - 0.02, at + T + 0.02])
    header()
  } else if (type === EDGE_RAIL) {
    if (isEsc(ka) || isEsc(kb)) {
      // Escalator side: the balustrade is part of the escalator; just block.
      box(g.colliders, e0, e1, bottom, MALL_H1 + RAIL_H, [at - 0.05, at + 0.05])
    } else {
      box(mall ? g.walls : g.trim, e0, e1, bottom, level)         // drop face
      railing(g, mall, alongZ, at, s0, s1, level)
    }
    header()
  } else if (type === EDGE_SHOP) {
    // Ground-floor storefront facing the concourse, gallery railing above.
    const dir = ka === KIND_RAISED ? 1 : -1
    box(g.walls, e0, e1, 0, MALL_H1)
    storefront(g, alongZ, at, s0, s1, dir, 0)
    railing(g, true, alongZ, at, s0, s1, MALL_H1)
    trimBand(g, alongZ, at, s0, s1, dir, MALL_H1 - 0.28, 0.28)
    header()
    column(g, alongZ, at, s0, 0, MALL_ROOF)
  } else if (type === EDGE_SHOP_UP) {
    const dir = ka === KIND_VOID ? 1 : -1
    box(g.walls, e0, e1, 0, MALL_ROOF)
    storefront(g, alongZ, at, s0, s1, dir, MALL_H1)
    column(g, alongZ, at, s0, MALL_H1, MALL_ROOF)
  } else {
    header()
  }
  // A walkable step between floor levels (pool edge): fill the gap.
  const plain = (k) => k !== KIND_VOID && !isStair(k) && !isEsc(k)
  if ((type === EDGE_OPEN || type === EDGE_DOOR) && fa1 !== fb1 && plain(ka) && plain(kb)) {
    box(g.floors, s0, s1, Math.min(fa1, fb1) - SLAB, Math.max(fa1, fb1))
  }

  // Atrium shaft: balcony ledges (and railings) stepping out into the void.
  if (side === 0 && (ca === CEIL_ATRIUM) !== (cb === CEIL_ATRIUM)) {
    const dir = cb === CEIL_ATRIUM ? 1 : -1                // toward the tall side
    const inner = at + dir * (T + LEDGE_DEPTH)
    for (let floor = 1; floor <= 2; floor++) {
      const y = WALL_H * floor
      box(g.trim, e0, e1, y - 0.18, y, [Math.min(at, inner), Math.max(at, inner)])
      railing(g, false, alongZ, inner, s0, s1, y)
    }
  }
}

// Thin bar along a line: `at` on the other axis, half thickness `half`.
function bar(list, alongZ, at, s0, s1, y0, y1, half) {
  if (alongZ) list.push([at - half, at + half, y0, y1, s0, s1])
  else list.push([s0, s1, y0, y1, at - half, at + half])
}

function railing(g, mall, alongZ, at, s0, s1, base) {
  if (mall) {
    // Glass panels in a brass frame (glass is an item, so add a collider).
    const mid = (s0 + s1) / 2
    const len = s1 - s0
    const pos = (y) => (alongZ ? [at, y, mid] : [mid, y, at])
    const yaw = alongZ ? Math.PI / 2 : 0
    item(g, 'glass', 'box', ...pos(base + 0.5), len, 0.86, 0.03, yaw)
    item(g, 'brass', 'box', ...pos(base + RAIL_H - 0.03), len, 0.07, 0.09, yaw)
    item(g, 'brass', 'box', ...pos(base + 0.05), len, 0.1, 0.07, yaw)
    bar(g.colliders, alongZ, at, s0, s1, base, base + RAIL_H, 0.05)
    return
  }
  bar(g.trim, alongZ, at, s0, s1, base + RAIL_H - 0.06, base + RAIL_H, 0.03)
  bar(g.trim, alongZ, at, s0, s1, base + RAIL_H * 0.5 - 0.02, base + RAIL_H * 0.5, 0.02)
  const posts = Math.max(2, Math.ceil(s1 - s0) + 1)
  for (let p = 0; p < posts; p++) {
    const s = s0 + ((s1 - s0) * p) / (posts - 1)
    bar(g.trim, alongZ, at, s - 0.03, s + 0.03, base, base + RAIL_H, 0.03)
  }
}

// ── Mall fixtures ────────────────────────────────────────────────────────

function item(g, mat, shape, x, y, z, sx, sy, sz, yaw = 0, pitch = 0) {
  g.items.push({ mat, shape, x, y, z, sx, sy, sz, yaw, pitch })
}

// Point `off` in front of the line, at position s along it.
const onLine = (alongZ, at, s, off) => (alongZ ? [at + off, s] : [s, at + off])
const facingYaw = (alongZ, dir) => (alongZ ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI)

// Shop window or roll-down grate with a neon sign above, facing `dir`.
function storefront(g, alongZ, at, s0, s1, dir, base) {
  const mid = (s0 + s1) / 2
  const yaw = facingYaw(alongZ, dir)
  const [wx, wz] = onLine(alongZ, at, mid, dir * (T + 0.012))
  item(g, 'storefront', 'vplane', wx, base + 1.42, wz, s1 - s0 - 0.5, 2.3, 1, yaw)
  const [kx, kz] = onLine(alongZ, at, mid, dir * (T + 0.05))
  item(g, 'marble', 'box', kx, base + 0.14, kz, s1 - s0, 0.28, 0.1, yaw)
  const [sx, sz] = onLine(alongZ, at, mid, dir * (T + 0.03))
  item(g, 'sign', 'vplane', sx, base + 3.0, sz, 2.3, 0.52, 1, yaw)
}

function trimBand(g, alongZ, at, s0, s1, dir, y, h) {
  const [x, z] = onLine(alongZ, at, (s0 + s1) / 2, dir * (T + 0.06))
  item(g, 'brass', 'box', x, y + h / 2, z, s1 - s0 + 0.1, h, 0.12, facingYaw(alongZ, dir))
}

// Art deco pilaster at the start vertex of a shop edge.
function column(g, alongZ, at, s, y0, y1) {
  const [x, z] = onLine(alongZ, at, s, 0)
  item(g, 'marble', 'box', x, (y0 + y1) / 2, z, 0.46, y1 - y0, 0.46)
  for (const y of [y0 + 0.5, y1 - 0.35]) item(g, 'brass', 'box', x, y, z, 0.52, 0.1, 0.52)
}

// Two-cell escalator starting at the ESC_A cell (x0, z0).
function escalator(g, x0, z0, up, belt) {
  const dx = DX[up]
  const dz = DZ[up]
  const run = CELL * 2
  const len = Math.hypot(run, MALL_H1)
  const pitch = -Math.atan2(MALL_H1, run)
  const yaw = Math.atan2(dx, dz)
  // Middle of the run: the shared edge of the two ramp cells.
  const cx = x0 + CELL / 2 + dx * CELL / 2
  const cz = z0 + CELL / 2 + dz * CELL / 2
  const cy = MALL_H1 / 2
  const mat = belt > 0 ? 'escUp' : belt < 0 ? 'escDown' : 'escStill'
  item(g, mat, 'box', cx, cy - 0.04, cz, 2.2, 0.08, len, yaw, pitch)
  item(g, 'escBody', 'box', cx, cy - 0.5, cz, 2.5, 0.8, len, yaw, pitch)
  const lx = Math.cos(yaw)   // local +x in world
  const lz = -Math.sin(yaw)
  for (const s of [-1.17, 1.17]) {
    item(g, 'glass', 'box', cx + lx * s, cy + 0.48, cz + lz * s, 0.05, 0.9, len, yaw, pitch)
    item(g, 'handrail', 'box', cx + lx * s, cy + 0.95, cz + lz * s, 0.1, 0.08, len, yaw, pitch)
  }
}

// ── Props ────────────────────────────────────────────────────────────────

function buildProp(g, p) {
  const sin = Math.sin(p.yaw)
  const cos = Math.cos(p.yaw)
  // Local (x, y, z) → item at world position, sharing the prop's yaw.
  const put = (mat, shape, lx, y, lz, sx, sy, sz, yawOff = 0, pitch = 0) =>
    item(g, mat, shape, p.x + lx * cos + lz * sin, y, p.z - lx * sin + lz * cos, sx, sy, sz, p.yaw + yawOff, pitch)
  const collide = (ex, ez, y1) => {
    const hx = Math.abs(cos) * ex + Math.abs(sin) * ez
    const hz = Math.abs(sin) * ex + Math.abs(cos) * ez
    g.colliders.push([p.x - hx, p.x + hx, 0, y1, p.z - hz, p.z + hz])
  }
  const seed = p.seed ?? 0.5

  switch (p.type) {
    case 'chair':
      put('chair', 'box', 0, 0.46, 0, 0.5, 0.08, 0.48)
      put('chair', 'box', 0, 0.8, -0.22, 0.46, 0.5, 0.06)
      put('steel', 'cyl', 0, 0.24, 0, 0.06, 0.42, 0.06)
      put('steel', 'box', 0, 0.04, 0, 0.62, 0.04, 0.07)
      put('steel', 'box', 0, 0.04, 0, 0.62, 0.04, 0.07, Math.PI / 2)
      g.colliders.push([p.x - 0.3, p.x + 0.3, 0, 1, p.z - 0.3, p.z + 0.3])
      break
    case 'boxes': {
      const n = 1 + Math.floor(seed * 3)
      for (let k = 0; k < n; k++) {
        const s = 0.42 + ((seed * 7 + k * 0.37) % 1) * 0.2
        const lx = k === 2 ? -0.05 : k * 0.55 - 0.25
        const y = k === 2 ? 0.55 + s / 2 : s / 2
        put('cardboard', 'box', lx, y, 0, s, s, s, (k - 1) * 0.15)
      }
      collide(0.6, 0.35, 1.2)
      break
    }
    case 'vending':
      put('vendingBody', 'box', 0, 0.95, 0, 0.95, 1.9, 0.8)
      put('vending', 'vplane', -0.1, 1.15, 0.405, 0.6, 1.3, 1)
      put('steel', 'box', 0.32, 0.9, 0.41, 0.18, 0.5, 0.02)
      collide(0.5, 0.42, 1.9)
      break
    case 'tv':
      put('wood', 'box', 0, 0.35, 0, 0.8, 0.7, 0.55)
      put('tvBody', 'box', 0, 0.97, 0, 0.62, 0.54, 0.52)
      put('tv', 'vplane', 0, 0.99, 0.262, 0.46, 0.36, 1)
      collide(0.42, 0.3, 1.25)
      break
    case 'exit':
      put('exit', 'box', 0, 2.33, 0, 0.36, 0.14, 0.22)
      break
    case 'bench':
      put('benchWood', 'box', 0, 0.44, 0, 0.5, 0.08, 1.8)
      put('benchWood', 'box', 0, 0.7, -0.22, 0.06, 0.4, 1.8)
      for (const lz of [-0.7, 0.7]) put('brass', 'box', 0, 0.2, lz, 0.44, 0.4, 0.08)
      collide(0.28, 0.92, 0.9)
      break
    case 'palm': {
      put('planter', 'cyl', 0, 0.33, 0, 1.1, 0.66, 1.1)
      put('brass', 'cyl', 0, 0.68, 0, 1.18, 0.06, 1.18)
      put('soil', 'cyl', 0, 0.67, 0, 1.0, 0.02, 1.0)
      const height = 3.4 + seed * 1.6
      const segs = 6
      const leanX = Math.sin(seed * 40) * 0.5
      const leanZ = Math.cos(seed * 40) * 0.5
      let topX = 0
      let topZ = 0
      for (let k = 0; k < segs; k++) {
        const f0 = k / segs
        const f1 = (k + 1) / segs
        const ax = leanX * f0 * f0
        const az = leanZ * f0 * f0
        const bx = leanX * f1 * f1
        const bz = leanZ * f1 * f1
        const segH = (height - 0.66) / segs
        const tilt = Math.atan2(Math.hypot(bx - ax, bz - az), segH)
        put('trunk', 'cone', (ax + bx) / 2, 0.66 + segH * (k + 0.5), (az + bz) / 2,
          0.52 - k * 0.04, segH * 1.04, 0.52 - k * 0.04, Math.atan2(bx - ax, bz - az), tilt)
        topX = bx
        topZ = bz
      }
      const fronds = 9
      for (let k = 0; k < fronds; k++) {
        const len = 1.7 + ((seed * 13 + k * 0.29) % 1) * 0.7
        put('frond', 'frond', topX, height, topZ, len, len, len, (k / fronds) * Math.PI * 2, -0.25 + ((k * 0.37) % 1) * 0.3)
      }
      collide(0.58, 0.58, 1)
      break
    }
    case 'fountain':
      item(g, 'basin', 'tube', p.x, 0.3, p.z, 4.6, 0.6, 4.6)
      item(g, 'marble', 'cyl', p.x, 0.2, p.z, 4.5, 0.4, 4.5)
      item(g, 'fountainWater', 'cyl', p.x, 0.44, p.z, 4.52, 0.02, 4.52)
      item(g, 'brass', 'tube', p.x, 0.6, p.z, 4.68, 0.06, 4.68)
      item(g, 'marble', 'cyl', p.x, 1.0, p.z, 0.7, 1.5, 0.7)
      item(g, 'marble', 'cyl', p.x, 1.75, p.z, 2.0, 0.22, 2.0)
      item(g, 'fountainWater', 'cyl', p.x, 1.87, p.z, 1.84, 0.02, 1.84)
      item(g, 'fall', 'tube', p.x, 1.16, p.z, 1.94, 1.3, 1.94)
      item(g, 'brass', 'cyl', p.x, 2.15, p.z, 0.18, 0.6, 0.18)
      item(g, 'fall', 'cyl', p.x, 2.7, p.z, 0.08, 0.6, 0.08)
      g.colliders.push([p.x - 2.15, p.x + 2.15, 0, 1, p.z - 2.15, p.z + 2.15])
      break
  }
}

// ── Cells ────────────────────────────────────────────────────────────────

function stairSteps(out, x0, z0, up) {
  const x1 = x0 + CELL
  const z1 = z0 + CELL
  for (let k = 0; k < STEPS; k++) {
    const a = k / STEPS
    const b = (k + 1) / STEPS
    const top = -SINK + (SINK * (k + 1)) / STEPS
    const y0 = -SINK - SLAB
    if (up === 0)      out.push([x1 - b * CELL, x1 - a * CELL, y0, top, z0, z1])
    else if (up === 1) out.push([x0 + a * CELL, x0 + b * CELL, y0, top, z0, z1])
    else if (up === 2) out.push([x0, x1, y0, top, z1 - b * CELL, z1 - a * CELL])
    else               out.push([x0, x1, y0, top, z0 + a * CELL, z0 + b * CELL])
  }
}

export function chunkGeometry(cx, cz) {
  const L = getLayout(cx, cz)
  if (L.geometry) return L.geometry
  const g = { walls: [], floors: [], ceilings: [], trim: [], items: [], panels: [], colliders: [], solid: null }
  const ox = cx * N
  const oz = cz * N
  const mall = L.theme === THEME_MALL
  const east = getLayout(cx + 1, cz)
  const north = getLayout(cx, cz + 1)
  const west = getLayout(cx - 1, cz)
  const south = getLayout(cx, cz - 1)
  // [kind, ceiling class] of a cell, looking into neighbouring chunks at the border.
  const cellAt = (i, j) => {
    const C = i < 0 ? west : i >= N ? east : j < 0 ? south : j >= N ? north : L
    const c = ((i + N) % N) * N + ((j + N) % N)
    return [C.kind[c], C.ceil[c]]
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const c = i * N + j
      const x0 = (ox + i) * CELL
      const z0 = (oz + j) * CELL
      const k = L.kind[c]
      const cl = L.ceil[c]

      if (k !== KIND_VOID) {
        if (isStair(k)) stairSteps(g.floors, x0, z0, k - KIND_STAIR)
        else if (!isEsc(k)) {
          const y = floorRange(k)[0]
          g.floors.push([x0, x0 + CELL, y - (k === KIND_RAISED ? 0.35 : SLAB), y, z0, z0 + CELL])
          if (k === KIND_POOL) item(g, 'water', 'up', x0 + CELL / 2, WATER_Y, z0 + CELL / 2, CELL, 1, CELL)
        }
        if (cl === CEIL_SKY) item(g, 'sky', 'down', x0 + CELL / 2, SKY_Y, z0 + CELL / 2, CELL, 1, CELL)
        else {
          const y = CEIL_Y[cl]
          g.ceilings.push([x0, x0 + CELL, y, y + SLAB, z0, z0 + CELL])
          if ((lightAt(ox + i, oz + j) & 3) !== LIGHT_NONE) g.panels.push(x0 + CELL / 2, y - 0.01, z0 + CELL / 2)
        }
      }
      if (isEsc(k) && !escUpper(k)) escalator(g, x0, z0, escUp(k), L.ride[c])

      // West and south lines of every cell (own border → our half only),
      // plus our half of the east and north borders owned by neighbours.
      const self = [k, cl]
      edgeGeometry(g, L.v[c], true, x0, z0, z0 + CELL, cellAt(i - 1, j), self, i === 0 ? 1 : 0, mall)
      edgeGeometry(g, L.h[c], false, z0, x0, x0 + CELL, cellAt(i, j - 1), self, j === 0 ? 1 : 0, mall)
      if (i === N - 1) edgeGeometry(g, east.v[j], true, x0 + CELL, z0, z0 + CELL, self, cellAt(N, j), -1, mall)
      if (j === N - 1) edgeGeometry(g, north.h[i * N], false, z0 + CELL, x0, x0 + CELL, self, cellAt(i, N), -1, mall)
    }
  }

  // Pillars, from the lowest floor touching the vertex up to the highest ceiling.
  for (let n = 0; n < L.pillars.length; n += 3) {
    const i = L.pillars[n]
    const j = L.pillars[n + 1]
    const p = L.pillars[n + 2] / 2
    const x = (ox + i) * CELL
    const z = (oz + j) * CELL
    const around = [cellAt(i - 1, j - 1), cellAt(i, j - 1), cellAt(i - 1, j), cellAt(i, j)]
    const bottom = Math.min(...around.map(([k]) => floorRange(k)[0]))
    const top = Math.max(...around.map(([, cl]) => CEIL_Y[cl]))
    g.walls.push([x - p, x + p, bottom, top, z - p, z + p])
  }

  for (const prop of L.props) buildProp(g, prop)

  g.solid = g.walls.concat(g.trim, g.colliders)
  L.geometry = g
  return g
}
