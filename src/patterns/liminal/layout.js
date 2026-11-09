import { CELL, CHUNK, SINK, POOL_D, MALL_H1, WALL_H, LOW_H, ATRIUM_H, MALL_ROOF, SKY_Y, STEP_UP } from './constants'
import { hash3, hash01, mulberry32 } from './rng'

// Procedural floor plan. The world is a grid of CELL-sized cells grouped into
// CHUNK×CHUNK chunks; walls live on cell edges. Each chunk is generated purely
// from its coordinates (plus a few neighbour lookups that are themselves pure),
// so layouts are stable and can be regenerated at will.
//
// Edge arrays (index = i * CHUNK + j):
//   v[i][j] — edge on the vertical line x = i, in row j (between cells (i-1, j) and (i, j))
//   h[i][j] — edge on the horizontal line z = j, in column i (between cells (i, j-1) and (i, j))
// A chunk owns its west (i = 0) and south (j = 0) borders; the east and north
// borders belong to the neighbouring chunks, so both sides always agree.
//
// Backrooms features (pits, atriums, pools, stamps) stay at least one cell
// away from the chunk border, so border cells there are always plain floor.
// Mall wings span whole chunks; their border cells follow a fixed
// cross-section (see mallBaseKind), which keeps cross-chunk edges pure too.

export const EDGE_OPEN = 0
export const EDGE_WALL = 1
export const EDGE_DOOR = 2
export const EDGE_RAIL = 3      // level change: drop face + railing, impassable
export const EDGE_LOW = 4       // half-height partition, impassable
export const EDGE_SHOP = 5      // mall: ground-floor storefront under a gallery railing
export const EDGE_SHOP_UP = 6   // mall: gallery-level storefront

const blocking = (e) => e === EDGE_WALL || e === EDGE_LOW || e === EDGE_RAIL || e === EDGE_SHOP || e === EDGE_SHOP_UP
export const passableEdge = (e) => e === EDGE_OPEN || e === EDGE_DOOR

export const ZONE_CLASSIC = 0
export const ZONE_HALL = 1
export const ZONE_ATRIUM = 2
export const ZONE_SUNKEN = 3
export const ZONE_MALL = 4

export const THEME_YELLOW = 0
export const THEME_GREEN = 1
export const THEME_OFFICE = 2
export const THEME_WOOD = 3
export const THEME_POOL = 4
export const THEME_MALL = 5
export const THEME_COUNT = 6

// Cell kinds. Stairs and escalators carry the direction of their top end.
export const KIND_NORMAL = 0
export const KIND_SUNK = 1
export const KIND_STAIR = 2      // 2..5
export const KIND_POOL = 6
export const KIND_RAISED = 7     // mall gallery / escalator landing
export const KIND_VOID = 8       // inside a closed shop: not walkable, not drawn
export const KIND_ESC_A = 9      // 9..12: lower half of an escalator
export const KIND_ESC_B = 13     // 13..16: upper half

export const isStair = (k) => k >= KIND_STAIR && k < KIND_STAIR + 4
export const isEsc = (k) => k >= KIND_ESC_A && k < KIND_ESC_B + 4
export const escUp = (k) => (k - KIND_ESC_A) & 3
export const escUpper = (k) => k >= KIND_ESC_B

// Ceiling classes and their heights.
export const CEIL_NORMAL = 0
export const CEIL_LOW = 1
export const CEIL_ATRIUM = 2
export const CEIL_ROOF = 3
export const CEIL_SKY = 4
export const CEIL_Y = [WALL_H, LOW_H, ATRIUM_H, MALL_ROOF, SKY_Y]

// Directions: 0 = −x, 1 = +x, 2 = −z, 3 = +z (opposite = d ^ 1).
export const DX = [-1, 1, 0, 0]
export const DZ = [0, 0, -1, 1]

const N = CHUNK
const CORRIDOR_SPAN = 6   // corridors are laid out in blocks of this many chunks
const MALL_MACRO = 5      // at most one mall wing per MALL_MACRO² chunks

// How often features appear. Roughly a third of backrooms chunks hold a hall,
// atrium or sunken room, most others get one or two room "stamps", and areas
// change materials every couple of chunks.
const CORRIDOR_RATE = 0.15   // per row / column of corridor blocks
const HALL_RATE = 0.1
const ATRIUM_RATE = 0.1
const SUNKEN_RATE = 0.12
const DARK_RATE = 0.08
const MALL_RATE = 0.8        // per macro cell

// ── Heights ──────────────────────────────────────────────────────────────

// Floor height where a cell of kind k meets its neighbour in direction d, or
// null if it can't be entered from that side.
export function edgeHeight(k, d) {
  if (k === KIND_NORMAL) return 0
  if (k === KIND_SUNK) return -SINK
  if (k === KIND_POOL) return -POOL_D
  if (k === KIND_RAISED) return MALL_H1
  if (isStair(k)) {
    const up = k - KIND_STAIR
    return d === up ? 0 : d === (up ^ 1) ? -SINK : null
  }
  if (isEsc(k)) {
    const up = escUp(k)
    const lo = escUpper(k) ? MALL_H1 / 2 : 0
    return d === up ? lo + MALL_H1 / 2 : d === (up ^ 1) ? lo : null
  }
  return null   // void
}

// Lowest and highest floor height inside a cell.
export function floorRange(k) {
  if (isStair(k)) return [-SINK, 0]
  if (isEsc(k)) return escUpper(k) ? [MALL_H1 / 2, MALL_H1] : [0, MALL_H1 / 2]
  if (k === KIND_VOID) return [0, 0]
  const y = edgeHeight(k, 0)
  return [y, y]
}

// Can you walk from a cell of kind `a` to its neighbour of kind `b` in
// direction `d` (ignoring walls)?
export function connects(a, b, d) {
  const ha = edgeHeight(a, d)
  const hb = edgeHeight(b, d ^ 1)
  return ha !== null && hb !== null && Math.abs(ha - hb) <= STEP_UP
}

// ── Global, coordinate-only decisions ────────────────────────────────────

// Mall wing through this chunk, or null. Each MALL_MACRO² block of chunks
// may hold one straight wing, 2–3 chunks long and one chunk wide, kept a
// chunk away from the block's edges so wings never touch each other.
export function mallAt(cx, cz) {
  const mx = Math.floor(cx / MALL_MACRO)
  const mz = Math.floor(cz / MALL_MACRO)
  if (hash01(mx, mz, 70) >= MALL_RATE) return null
  const alongX = (hash3(mx, mz, 71) & 1) === 1
  const len = 2 + (hash3(mx, mz, 72) % 2)
  const start = 1 + (hash3(mx, mz, 73) % (MALL_MACRO - 1 - len))
  const across = 1 + (hash3(mx, mz, 74) % (MALL_MACRO - 2))
  const lx = cx - mx * MALL_MACRO
  const lz = cz - mz * MALL_MACRO
  const u = alongX ? lx : lz
  const a = alongX ? lz : lx
  if (a !== across || u < start || u >= start + len) return null
  return { alongX, index: u - start, len }
}

// Mall cross-section, by cell index across the wing:
//   0, 7  shops (void)   1, 6  galleries   2–5  concourse under the skylight
const mallBaseKind = (a) => (a === 0 || a === 7 ? KIND_VOID : a === 1 || a === 6 ? KIND_RAISED : KIND_NORMAL)

// Row (cell z index) of an east-west corridor through this chunk, or −1.
export function corridorX(cx, cz) {
  const seg = Math.floor(cx / CORRIDOR_SPAN)
  if (hash01(seg, cz, 50) >= CORRIDOR_RATE || mallAt(cx, cz)) return -1
  const start = hash3(seg, cz, 51) % 3
  const len = 3 + (hash3(seg, cz, 52) % (4 - start))
  const local = cx - seg * CORRIDOR_SPAN
  return local >= start && local < start + len ? 1 + (hash3(seg, cz, 53) % (N - 2)) : -1
}

// Column (cell x index) of a north-south corridor through this chunk, or −1.
export function corridorZ(cx, cz) {
  const seg = Math.floor(cz / CORRIDOR_SPAN)
  if (hash01(cx, seg, 60) >= CORRIDOR_RATE || mallAt(cx, cz)) return -1
  const start = hash3(cx, seg, 61) % 3
  const len = 3 + (hash3(cx, seg, 62) % (4 - start))
  const local = cz - seg * CORRIDOR_SPAN
  return local >= start && local < start + len ? 1 + (hash3(cx, seg, 63) % (N - 2)) : -1
}

export function zoneOf(cx, cz) {
  if (mallAt(cx, cz)) return ZONE_MALL
  if (corridorX(cx, cz) >= 0 || corridorZ(cx, cz) >= 0) return ZONE_CLASSIC
  const r = hash01(cx, cz, 30)
  if (r < HALL_RATE) return ZONE_HALL
  if (r < HALL_RATE + ATRIUM_RATE) return ZONE_ATRIUM
  if (r < HALL_RATE + ATRIUM_RATE + SUNKEN_RATE) return ZONE_SUNKEN
  return ZONE_CLASSIC
}

// Materials change by 2×2-chunk area, so a theme reads as a place.
export function themeOf(cx, cz) {
  if (mallAt(cx, cz)) return THEME_MALL
  const r = hash01(Math.floor(cx / 2), Math.floor(cz / 2), 80)
  return r < 0.46 ? THEME_YELLOW : r < 0.6 ? THEME_GREEN : r < 0.74 ? THEME_OFFICE : r < 0.87 ? THEME_WOOD : THEME_POOL
}

export const isDark = (cx, cz) => !mallAt(cx, cz) && hash01(cx, cz, 40) < DARK_RATE

// ── Generation helpers ───────────────────────────────────────────────────

const edgeIndex = (i, j) => i * N + j

// Edge between cell (i, j) and its neighbour in direction d (both in-chunk).
function edgeOf(v, h, i, j, d) {
  if (d === 0) return [v, edgeIndex(i, j)]
  if (d === 1) return [v, edgeIndex(i + 1, j)]
  if (d === 2) return [h, edgeIndex(i, j)]
  return [h, edgeIndex(i, j + 1)]
}

function spanningTree(v, h, rnd) {
  const seen = new Uint8Array(N * N)
  const start = ((rnd() * N) | 0) * N + ((rnd() * N) | 0)
  const stack = [start]
  seen[start] = 1
  const opts = []
  while (stack.length) {
    const c = stack[stack.length - 1]
    const i = (c / N) | 0
    const j = c % N
    opts.length = 0
    for (let d = 0; d < 4; d++) {
      const ni = i + DX[d]
      const nj = j + DZ[d]
      if (ni >= 0 && ni < N && nj >= 0 && nj < N && !seen[ni * N + nj]) opts.push(d)
    }
    if (!opts.length) { stack.pop(); continue }
    const d = opts[(rnd() * opts.length) | 0]
    const [arr, k] = edgeOf(v, h, i, j, d)
    arr[k] = EDGE_OPEN
    const next = (i + DX[d]) * N + (j + DZ[d])
    seen[next] = 1
    stack.push(next)
  }
}

// Knock out extra walls so it reads as rooms and loops rather than a maze.
function loosen(v, h, rnd) {
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const k = edgeIndex(i, j)
      if (i > 0 && v[k] === EDGE_WALL) v[k] = rnd() < 0.38 ? EDGE_OPEN : rnd() < 0.14 ? EDGE_DOOR : EDGE_WALL
      if (j > 0 && h[k] === EDGE_WALL) h[k] = rnd() < 0.38 ? EDGE_OPEN : rnd() < 0.14 ? EDGE_DOOR : EDGE_WALL
    }
  }
}

// Sets every edge strictly inside the rect to `type`.
function fillRect(v, h, x0, z0, w, d, type = EDGE_OPEN) {
  for (let i = x0 + 1; i < x0 + w; i++) for (let j = z0; j < z0 + d; j++) v[edgeIndex(i, j)] = type
  for (let i = x0; i < x0 + w; i++) for (let j = z0 + 1; j < z0 + d; j++) h[edgeIndex(i, j)] = type
}

// A random w×d rect (each side in [lo, hi]) kept one cell inside the chunk.
// Feature callers open the ring of cells around it too, so the feature is
// visible from the surrounding rooms rather than hidden behind maze walls.
function innerRect(rnd, lo, hi) {
  const w = lo + ((rnd() * (hi - lo + 1)) | 0)
  const d = lo + ((rnd() * (hi - lo + 1)) | 0)
  const x0 = 1 + ((rnd() * (N - 1 - w)) | 0)
  const z0 = 1 + ((rnd() * (N - 1 - d)) | 0)
  return [x0, z0, w, d]
}

const setKinds = (kind, x0, z0, w, d, k) => {
  for (let i = x0; i < x0 + w; i++) for (let j = z0; j < z0 + d; j++) kind[i * N + j] = k
}

// Lowers a rect and cuts up to `stairs` stair runs into its sides.
function sinkRect(kind, v, h, rnd, x0, z0, w, d, stairs) {
  setKinds(kind, x0, z0, w, d, KIND_SUNK)
  const sides = [0, 1, 2, 3]
  for (let s = 3; s > 0; s--) {   // Fisher–Yates: deterministic for a given rnd
    const r = (rnd() * (s + 1)) | 0
    ;[sides[s], sides[r]] = [sides[r], sides[s]]
  }
  let placed = 0
  for (const up of sides) {
    if (placed === stairs) break
    // The stair cell sits on the rect's `up` side; its top opens outward.
    const i = up === 0 ? x0 : up === 1 ? x0 + w - 1 : x0 + ((rnd() * w) | 0)
    const j = up === 2 ? z0 : up === 3 ? z0 + d - 1 : z0 + ((rnd() * d) | 0)
    const di = i - DX[up]
    const dj = j - DZ[up]
    // Its bottom must land on plain sunken floor, and it must not be the
    // landing of a stair already placed.
    if (kind[i * N + j] !== KIND_SUNK || kind[di * N + dj] !== KIND_SUNK) continue
    let blocksOther = false
    for (let s = 0; s < N * N; s++) {
      const k = kind[s]
      if (!isStair(k)) continue
      const o = k - KIND_STAIR
      if (((s / N) | 0) - DX[o] === i && (s % N) - DZ[o] === j) blocksOther = true
    }
    if (blocksOther) continue
    kind[i * N + j] = KIND_STAIR + up
    // Stair sides are railed, so two stairs could wall off a corner of the
    // pit; keep the stair only if the remaining sunken floor is one piece.
    if (!sunkenConnected(kind, x0, z0, w, d)) {
      kind[i * N + j] = KIND_SUNK
      continue
    }
    const [arr, e] = edgeOf(v, h, i, j, up)
    arr[e] = EDGE_OPEN
    placed++
  }
}

function sunkenConnected(kind, x0, z0, w, d) {
  let start = -1
  let count = 0
  for (let i = x0; i < x0 + w; i++) {
    for (let j = z0; j < z0 + d; j++) {
      if (kind[i * N + j] === KIND_SUNK) { count++; if (start < 0) start = i * N + j }
    }
  }
  const seen = new Set([start])
  const stack = [start]
  while (stack.length) {
    const c = stack.pop()
    const i = (c / N) | 0
    const j = c % N
    for (let dir = 0; dir < 4; dir++) {
      const ni = i + DX[dir]
      const nj = j + DZ[dir]
      const n = ni * N + nj
      if (ni < x0 || ni >= x0 + w || nj < z0 || nj >= z0 + d) continue
      if (kind[n] === KIND_SUNK && !seen.has(n)) { seen.add(n); stack.push(n) }
    }
  }
  return seen.size === count
}

function corridorAlongX(v, h, rnd, row) {
  for (let i = 1; i < N; i++) v[edgeIndex(i, row)] = EDGE_OPEN
  for (const line of [row, row + 1]) {
    let doors = 0
    for (let i = 0; i < N; i++) {
      const door = rnd() < 0.22
      h[edgeIndex(i, line)] = door ? EDGE_DOOR : EDGE_WALL
      doors += door
    }
    if (!doors) h[edgeIndex((rnd() * N) | 0, line)] = EDGE_DOOR
  }
}

function corridorAlongZ(v, h, rnd, col) {
  for (let j = 1; j < N; j++) h[edgeIndex(col, j)] = EDGE_OPEN
  for (const line of [col, col + 1]) {
    let doors = 0
    for (let j = 0; j < N; j++) {
      const door = rnd() < 0.22
      v[edgeIndex(line, j)] = door ? EDGE_DOOR : EDGE_WALL
      doors += door
    }
    if (!doors) v[edgeIndex(line, (rnd() * N) | 0)] = EDGE_DOOR
  }
}

// ── Room stamps: small layout variations dropped into ordinary chunks ─────

const STAMP_WEIGHTS = {
  [THEME_YELLOW]: { lroom: 1, narrow: 1, low: 1, pillars: 1, cubicles: 0.5 },
  [THEME_GREEN]:  { lroom: 1, narrow: 1.4, low: 1, pillars: 1, cubicles: 0.3 },
  [THEME_OFFICE]: { lroom: 0.6, narrow: 0.6, low: 0.6, pillars: 0.6, cubicles: 3 },
  [THEME_WOOD]:   { lroom: 1, narrow: 1, low: 1.6, pillars: 0.6, cubicles: 0.3 },
  [THEME_POOL]:   { lroom: 0.8, narrow: 0.6, low: 0.3, pillars: 1, pool: 2.4 },
}

function pickStamp(rnd, theme) {
  const weights = STAMP_WEIGHTS[theme]
  let total = 0
  for (const w of Object.values(weights)) total += w
  let r = rnd() * total
  for (const [name, w] of Object.entries(weights)) if ((r -= w) < 0) return name
  return 'lroom'
}

function applyStamp(L, rnd, name) {
  const { v, h, kind, ceil, pillars } = L
  if (name === 'lroom') {
    // An L: two overlapping strips sharing a corner.
    const [x0, z0, w, d] = innerRect(rnd, 3, 5)
    fillRect(v, h, x0, z0, w, 2)
    fillRect(v, h, x0, z0, 2, d)
  } else if (name === 'narrow') {
    // A long, one-cell-wide room with a door on each side.
    const len = 4 + ((rnd() * 3) | 0)
    const along = (rnd() * (N - 1 - len)) | 0
    const line = 1 + ((rnd() * (N - 2)) | 0)
    const alongX = rnd() < 0.5
    const x0 = alongX ? 1 + along : line
    const z0 = alongX ? line : 1 + along
    fillRect(v, h, x0, z0, alongX ? len : 1, alongX ? 1 : len)
    for (let s = 0; s < len; s++) {
      if (alongX) {
        h[edgeIndex(x0 + s, z0)] = EDGE_WALL
        h[edgeIndex(x0 + s, z0 + 1)] = EDGE_WALL
      } else {
        v[edgeIndex(x0, z0 + s)] = EDGE_WALL
        v[edgeIndex(x0 + 1, z0 + s)] = EDGE_WALL
      }
    }
    for (const side of [0, 1]) {
      const s = (rnd() * len) | 0
      if (alongX) h[edgeIndex(x0 + s, z0 + side)] = EDGE_DOOR
      else v[edgeIndex(x0 + side, z0 + s)] = EDGE_DOOR
    }
  } else if (name === 'low') {
    // Crawlspace: a room with the ceiling pressed down.
    const [x0, z0, w, d] = innerRect(rnd, 2, 4)
    fillRect(v, h, x0, z0, w, d)
    for (let i = x0; i < x0 + w; i++) {
      for (let j = z0; j < z0 + d; j++) if (ceil[i * N + j] === CEIL_NORMAL) ceil[i * N + j] = CEIL_LOW
    }
  } else if (name === 'pillars') {
    // An open room with an irregular forest of columns.
    const [x0, z0, w, d] = innerRect(rnd, 3, 5)
    fillRect(v, h, x0, z0, w, d)
    const sizes = [0.3, 0.55, 0.9]
    for (let i = x0 + 1; i < x0 + w; i++) {
      for (let j = z0 + 1; j < z0 + d; j++) if (rnd() < 0.6) pillars.push(i, j, sizes[(rnd() * 3) | 0])
    }
  } else if (name === 'cubicles') {
    // Open-plan floor cut up by half-height partitions.
    const [x0, z0, w, d] = innerRect(rnd, 4, 6)
    fillRect(v, h, x0, z0, w, d)
    for (let i = x0 + 1; i < x0 + w; i++) for (let j = z0; j < z0 + d; j++) if (rnd() < 0.45) v[edgeIndex(i, j)] = EDGE_LOW
    for (let i = x0; i < x0 + w; i++) for (let j = z0 + 1; j < z0 + d; j++) if (rnd() < 0.3) h[edgeIndex(i, j)] = EDGE_LOW
  } else if (name === 'pool') {
    const [x0, z0, w, d] = innerRect(rnd, 2, 4)
    fillRect(v, h, x0 - 1, z0 - 1, w + 2, d + 2)
    for (let i = x0; i < x0 + w; i++) {
      for (let j = z0; j < z0 + d; j++) if (kind[i * N + j] === KIND_NORMAL) kind[i * N + j] = KIND_POOL
    }
  }
}

// Owned borders between two backrooms chunks: mostly wall with at least two
// passable openings per side, or mostly open between two huge halls.
// Borders touching a mall wing follow the mall's shell instead.
function borders(v, h, rnd, cx, cz, zone) {
  const sides = [
    { arr: v, at: (t) => t, ncx: cx - 1, ncz: cz, xLine: true },
    { arr: h, at: (t) => t * N, ncx: cx, ncz: cz - 1, xLine: false },
  ]
  for (const { arr, at, ncx, ncz, xLine } of sides) {
    const own = mallAt(cx, cz)
    const other = mallAt(ncx, ncz)
    if (own || other) {
      for (let t = 0; t < N; t++) arr[at(t)] = mallShellEdge(own || other, xLine, t, !!own && !!other)
      continue
    }
    const merge = zone === ZONE_HALL && zoneOf(ncx, ncz) === ZONE_HALL
    for (let t = 0; t < N; t++) {
      const r = rnd()
      arr[at(t)] = merge
        ? (r < 0.85 ? EDGE_OPEN : EDGE_WALL)
        : (r < 0.35 ? EDGE_OPEN : r < 0.5 ? EDGE_DOOR : EDGE_WALL)
    }
    const a = (rnd() * N) | 0
    const b = (a + 2 + ((rnd() * (N - 3)) | 0)) % N
    arr[at(a)] = EDGE_OPEN
    if (arr[at(b)] === EDGE_WALL) arr[at(b)] = EDGE_DOOR
  }
}

// A chunk-border edge at position t along the line, where at least one side
// is part of `mall`. `xLine` is true for lines of constant x.
function mallShellEdge(mall, xLine, t, bothMall) {
  if (bothMall) return EDGE_OPEN                    // the wing continues
  if (xLine !== mall.alongX) return EDGE_WALL       // long side: behind the shops
  return t === 3 || t === 4 ? EDGE_OPEN : EDGE_WALL // wing end: entrance to the concourse
}

// Makes every cell in the chunk reachable, opening walls and partitions
// between unreached regions and the reached area where levels allow it.
function repair(v, h, kind, rnd) {
  const reached = new Uint8Array(N * N)
  const queue = [0]
  reached[0] = 1
  const step = (i, j, d) => {
    const ni = i + DX[d]
    const nj = j + DZ[d]
    if (ni < 0 || ni >= N || nj < 0 || nj >= N) return -1
    const [arr, e] = edgeOf(v, h, i, j, d)
    const n = ni * N + nj
    if (!connects(kind[i * N + j], kind[n], d)) return -1
    return arr[e] === EDGE_WALL || arr[e] === EDGE_LOW ? -2 - n : n   // −2−n marks "only a wall in the way"
  }
  for (;;) {
    while (queue.length) {
      const c = queue.pop()
      const i = (c / N) | 0
      const j = c % N
      for (let d = 0; d < 4; d++) {
        const n = step(i, j, d)
        if (n >= 0 && !reached[n]) { reached[n] = 1; queue.push(n) }
      }
    }
    const candidates = []
    for (let c = 0; c < N * N; c++) {
      if (!reached[c]) continue
      const i = (c / N) | 0
      const j = c % N
      for (let d = 0; d < 4; d++) {
        const n = step(i, j, d)
        if (n <= -2 && !reached[-2 - n]) candidates.push([i, j, d])
      }
    }
    if (!candidates.length) return
    const [i, j, d] = candidates[(rnd() * candidates.length) | 0]
    const [arr, e] = edgeOf(v, h, i, j, d)
    arr[e] = arr[e] === EDGE_LOW || rnd() < 0.5 ? EDGE_OPEN : EDGE_DOOR
    const n = (i + DX[d]) * N + (j + DZ[d])
    reached[n] = 1
    queue.push(n)
  }
}

// Turn passable edges across a level change into railings, and make stair
// and escalator entries plain openings.
function finalizeEdges(v, h, kind) {
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i > 0) settle(v, edgeIndex(i, j), kind[(i - 1) * N + j], kind[i * N + j], 1)
      if (j > 0) settle(h, edgeIndex(i, j), kind[i * N + j - 1], kind[i * N + j], 3)
    }
  }
}

function settle(arr, e, a, b, d) {
  if (blocking(arr[e])) return
  if (a === KIND_VOID || b === KIND_VOID) arr[e] = EDGE_OPEN
  else if (!connects(a, b, d)) arr[e] = EDGE_RAIL
  else if (isStair(a) || isStair(b) || isEsc(a) || isEsc(b)) arr[e] = EDGE_OPEN
}

// ── Props ────────────────────────────────────────────────────────────────
// { type, x, z, yaw, seed } in world space; geometry.js builds and collides them.

function backroomProps(L, rnd) {
  const { v, h, kind, ceil, theme, rowX, colZ } = L
  const ox = L.cx * N
  const oz = L.cz * N
  const props = L.props
  // Exit signs over the odd doorway.
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const lowCeil = ceil[i * N + j] === CEIL_LOW
      if (v[edgeIndex(i, j)] === EDGE_DOOR && !lowCeil && rnd() < 0.12) {
        props.push({ type: 'exit', x: (ox + i) * CELL, z: (oz + j + 0.5) * CELL, yaw: Math.PI / 2 })
      }
      if (h[edgeIndex(i, j)] === EDGE_DOOR && !lowCeil && rnd() < 0.12) {
        props.push({ type: 'exit', x: (ox + i + 0.5) * CELL, z: (oz + j) * CELL, yaw: 0 })
      }
    }
  }
  if (theme === THEME_POOL) return
  const used = new Set()
  const types = theme === THEME_OFFICE
    ? ['chair', 'chair', 'chair', 'boxes', 'vending', 'tv']
    : ['chair', 'boxes', 'boxes', 'vending', 'tv', 'tv']
  let count = (rnd() < 0.55 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0) + (theme === THEME_OFFICE && rnd() < 0.5 ? 2 : 0)
  for (let tries = 0; count > 0 && tries < 20; tries++) {
    const i = 1 + ((rnd() * (N - 2)) | 0)
    const j = 1 + ((rnd() * (N - 2)) | 0)
    const c = i * N + j
    if (used.has(c) || kind[c] !== KIND_NORMAL || j === rowX || i === colZ) continue
    const type = types[(rnd() * types.length) | 0]
    const cxw = (ox + i + 0.5) * CELL
    const czw = (oz + j + 0.5) * CELL
    if (type === 'chair') {
      props.push({ type, x: cxw + (rnd() - 0.5) * 1.4, z: czw + (rnd() - 0.5) * 1.4, yaw: rnd() * Math.PI * 2, seed: rnd() })
    } else {
      // Against a solid wall of the cell, facing into the room.
      const d = (rnd() * 4) | 0
      const [arr, e] = edgeOf(v, h, i, j, d)
      if (arr[e] !== EDGE_WALL) continue
      const back = CELL / 2 - 0.5
      props.push({
        type, x: cxw + DX[d] * back, z: czw + DZ[d] * back,
        yaw: Math.atan2(-DX[d], -DZ[d]), seed: rnd(),
      })
    }
    used.add(c)
    count--
  }
}

// ── Chunk generation ─────────────────────────────────────────────────────

function emptyLayout(cx, cz) {
  return {
    cx, cz,
    zone: zoneOf(cx, cz), theme: themeOf(cx, cz), dark: isDark(cx, cz),
    rowX: corridorX(cx, cz), colZ: corridorZ(cx, cz), mall: mallAt(cx, cz),
    v: new Uint8Array(N * N).fill(EDGE_WALL),
    h: new Uint8Array(N * N).fill(EDGE_WALL),
    kind: new Uint8Array(N * N),
    ceil: new Uint8Array(N * N),
    ride: new Int8Array(N * N),   // escalator belt: 1 carries you up, −1 down
    pillars: [],                  // [i, j, size] per vertex
    props: [],
    geometry: null,
  }
}

function generateBackrooms(cx, cz) {
  const L = emptyLayout(cx, cz)
  const rnd = mulberry32(hash3(cx, cz, 1))
  const { v, h, kind, ceil, pillars, zone, theme, rowX, colZ } = L
  const pool = theme === THEME_POOL

  spanningTree(v, h, rnd)
  loosen(v, h, rnd)

  if (zone === ZONE_HALL) {
    fillRect(v, h, 0, 0, N, N)
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) pillars.push(i, j, 0.55)
  } else if (zone === ZONE_ATRIUM) {
    const [x0, z0, w, d] = innerRect(rnd, 4, 5)
    fillRect(v, h, x0 - 1, z0 - 1, w + 2, d + 2)
    for (let i = x0; i < x0 + w; i++) for (let j = z0; j < z0 + d; j++) ceil[i * N + j] = CEIL_ATRIUM
    for (let i = x0 + 1; i < x0 + w; i++) {
      for (let j = z0 + 1; j < z0 + d; j++) {
        const onPitEdge = i === x0 + 1 || i === x0 + w - 1 || j === z0 + 1 || j === z0 + d - 1
        if (onPitEdge && rnd() < 0.5) pillars.push(i, j, 0.55)
      }
    }
    if (pool) setKinds(kind, x0 + 1, z0 + 1, w - 2, d - 2, KIND_POOL)
    else sinkRect(kind, v, h, rnd, x0 + 1, z0 + 1, w - 2, d - 2, 1)
  } else if (zone === ZONE_SUNKEN) {
    const [x0, z0, w, d] = innerRect(rnd, 3, 5)
    fillRect(v, h, x0 - 1, z0 - 1, w + 2, d + 2)
    if (pool) setKinds(kind, x0, z0, w, d, KIND_POOL)
    else sinkRect(kind, v, h, rnd, x0, z0, w, d, 2)
  } else {
    const stamps = rnd() < 0.85 ? (rnd() < 0.45 ? 2 : 1) : 0
    for (let s = 0; s < stamps; s++) applyStamp(L, rnd, pickStamp(rnd, theme))
  }

  if (rowX >= 0) corridorAlongX(v, h, rnd, rowX)
  if (colZ >= 0) corridorAlongZ(v, h, rnd, colZ)
  if (rowX >= 0 && colZ >= 0) {
    v[edgeIndex(colZ, rowX)] = EDGE_OPEN
    v[edgeIndex(colZ + 1, rowX)] = EDGE_OPEN
    h[edgeIndex(colZ, rowX)] = EDGE_OPEN
    h[edgeIndex(colZ, rowX + 1)] = EDGE_OPEN
  }

  borders(v, h, rnd, cx, cz, zone)
  // Corridors continue straight through chunk borders.
  if (rowX >= 0 && corridorX(cx - 1, cz) === rowX) v[edgeIndex(0, rowX)] = EDGE_OPEN
  if (colZ >= 0 && corridorZ(cx, cz - 1) === colZ) h[edgeIndex(colZ, 0)] = EDGE_OPEN

  repair(v, h, kind, rnd)
  finalizeEdges(v, h, kind)
  backroomProps(L, mulberry32(hash3(cx, cz, 90)))
  return L
}

// A slice of mall wing: shops on both sides at two levels, galleries one
// story up, a skylit concourse between, and maybe escalators or a fountain.
function generateMall(cx, cz) {
  const L = emptyLayout(cx, cz)
  const m = L.mall
  const rnd = mulberry32(hash3(cx, cz, 2))
  const { v, h, kind, ceil, ride, props } = L
  const cell = (u, a) => (m.alongX ? u * N + a : a * N + u)
  const aOf = (i, j) => (m.alongX ? j : i)
  const world = (u, a) => (m.alongX ? [(cx * N + u) * CELL, (cz * N + a) * CELL] : [(cx * N + a) * CELL, (cz * N + u) * CELL])
  const upDir = m.alongX ? 1 : 3   // direction of increasing u

  for (let u = 0; u < N; u++) {
    for (let a = 0; a < N; a++) {
      kind[cell(u, a)] = mallBaseKind(a)
      ceil[cell(u, a)] = a >= 2 && a <= 5 ? CEIL_SKY : CEIL_ROOF
    }
  }

  // Escalators up to each gallery: always in a wing's first slice so both
  // galleries are reachable, sometimes elsewhere. Each is two ramp cells and
  // a landing bridge onto the gallery.
  const escalator = (a, up) => {
    const u0 = 1 + ((rnd() * 4) | 0)
    const [lo, mid, top] = up === upDir ? [u0, u0 + 1, u0 + 2] : [u0 + 2, u0 + 1, u0]
    const belt = rnd() < 0.3 ? 0 : rnd() < 0.6 ? 1 : -1
    kind[cell(lo, a)] = KIND_ESC_A + up
    kind[cell(mid, a)] = KIND_ESC_B + up
    kind[cell(top, a)] = KIND_RAISED
    ride[cell(lo, a)] = ride[cell(mid, a)] = belt
  }
  const escNear = m.index === 0 || rnd() < 0.35
  const escFar = m.index === 0 || rnd() < 0.35
  if (escNear) escalator(2, upDir)
  if (escFar) escalator(5, upDir ^ 1)

  // Interior edges follow from the cross-section.
  const edgeFor = (p, q, ap, aq) => {
    const kp = kind[p]
    const kq = kind[q]
    if (kp === KIND_VOID && kq === KIND_VOID) return EDGE_OPEN
    if (kp === KIND_VOID || kq === KIND_VOID) return EDGE_SHOP_UP
    const lo = Math.min(ap, aq)
    if (ap !== aq && (lo === 1 || lo === 5)) {
      const ground = (k) => k === KIND_NORMAL || isEsc(k)
      if ((kp === KIND_RAISED && ground(kq)) || (kq === KIND_RAISED && ground(kp))) return EDGE_SHOP
    }
    return EDGE_OPEN
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i > 0) v[edgeIndex(i, j)] = edgeFor((i - 1) * N + j, i * N + j, aOf(i - 1, j), aOf(i, j))
      if (j > 0) h[edgeIndex(i, j)] = edgeFor(i * N + j - 1, i * N + j, aOf(i, j - 1), aOf(i, j))
    }
  }
  borders(v, h, rnd, cx, cz, ZONE_MALL)
  finalizeEdges(v, h, kind)

  // Fountain in the middle of the concourse; with at most one escalator
  // beside it, the far side of the concourse stays open to walk around.
  let fountainU = -1
  if (!(escNear && escFar) && rnd() < 0.75) {
    fountainU = 2 + ((rnd() * 5) | 0)
    const [x, z] = world(fountainU, 4)
    props.push({ type: 'fountain', x, z, yaw: 0, seed: rnd() })
  }
  // Palms in planters along the shopfronts, benches down the middle.
  for (let u = 0; u < N; u++) {
    for (const [a, side] of [[2, -1], [5, 1]]) {
      const prev = u > 0 ? kind[cell(u - 1, a)] : KIND_NORMAL
      const next = u < N - 1 ? kind[cell(u + 1, a)] : KIND_NORMAL
      if (kind[cell(u, a)] !== KIND_NORMAL || isEsc(prev) || isEsc(next) || rnd() > 0.35) continue
      const [x, z] = world(u + 0.5, a + 0.5 + side * 0.55)
      props.push({ type: 'palm', x, z, yaw: rnd() * Math.PI * 2, seed: rnd() })
    }
    for (const a of [3, 4]) {
      if (fountainU >= 0 && (u === fountainU || u === fountainU - 1)) continue
      if (rnd() > 0.1) continue
      const [x, z] = world(u + 0.5, a + 0.5)
      props.push({ type: 'bench', x, z, yaw: m.alongX ? Math.PI / 2 : 0, seed: rnd() })
    }
  }
  return L
}

function generateLayout(cx, cz) {
  return mallAt(cx, cz) ? generateMall(cx, cz) : generateBackrooms(cx, cz)
}

// Small LRU of generated layouts (collision, lighting and rendering read them).
const cache = new Map()
const CACHE_MAX = 160

export function getLayout(cx, cz) {
  const key = `${cx},${cz}`
  let layout = cache.get(key)
  if (layout) {
    cache.delete(key)
    cache.set(key, layout)
    return layout
  }
  layout = generateLayout(cx, cz)
  cache.set(key, layout)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  return layout
}

// ── Point queries in global cell / world coordinates ─────────────────────

function locate(gx, gz) {
  const cx = Math.floor(gx / N)
  const cz = Math.floor(gz / N)
  return [getLayout(cx, cz), (gx - cx * N) * N + (gz - cz * N)]
}

export function cellKind(gx, gz) {
  const [L, c] = locate(gx, gz)
  return L.kind[c]
}

// Layout of the chunk containing world position (x, z).
export function chunkAt(x, z) {
  return getLayout(Math.floor(x / (CELL * N)), Math.floor(z / (CELL * N)))
}

// Final edge type in global coordinates (axis 'v' or 'h', same indexing as above).
export function edgeAt(axis, gx, gz) {
  const [L, c] = locate(gx, gz)
  return (axis === 'v' ? L.v : L.h)[c]
}

// Floor class per cell for the shader (contact shadows at wall bases).
export const FLOOR_NORMAL = 0
export const FLOOR_SUNK = 1
export const FLOOR_POOL = 2
export const FLOOR_RAISED = 3

// Light-map B / A bytes: ceiling class | floor class << 3, and dark flag.
export function cellInfo(gx, gz) {
  const [L, c] = locate(gx, gz)
  const k = L.kind[c]
  const floor = k === KIND_SUNK || isStair(k) ? FLOOR_SUNK
    : k === KIND_POOL ? FLOOR_POOL : k === KIND_RAISED ? FLOOR_RAISED : FLOOR_NORMAL
  return [L.ceil[c] | (floor << 3), L.dark ? 1 : 0]
}

// Walkable floor height at a world position (stairs and escalators are ramps).
export function floorAt(x, z) {
  const gx = Math.floor(x / CELL)
  const gz = Math.floor(z / CELL)
  const k = cellKind(gx, gz)
  if (!isStair(k) && !isEsc(k)) return k === KIND_VOID ? 0 : edgeHeight(k, 0)
  const up = isStair(k) ? k - KIND_STAIR : escUp(k)
  const fx = x / CELL - gx
  const fz = z / CELL - gz
  const u = up === 0 ? 1 - fx : up === 1 ? fx : up === 2 ? 1 - fz : fz
  if (isStair(k)) return -SINK * (1 - u)
  return (escUpper(k) ? MALL_H1 / 2 : 0) + (MALL_H1 / 2) * u
}

// Unit belt direction of a moving escalator under (x, z), or null.
export function beltAt(x, z) {
  const [L, c] = locate(Math.floor(x / CELL), Math.floor(z / CELL))
  const k = L.kind[c]
  if (!isEsc(k) || !L.ride[c]) return null
  const up = escUp(k)
  return [DX[up] * L.ride[c], DZ[up] * L.ride[c]]
}

// Direction (0..3) with the longest unobstructed straight run of same-level
// cells from (gx, gz), so the player can start facing open space.
export function openestDirection(gx, gz, maxRun = 12) {
  let best = 0
  let bestRun = -1
  for (let d = 0; d < 4; d++) {
    let x = gx
    let z = gz
    let run = 0
    while (run < maxRun) {
      const e = d === 0 ? edgeAt('v', x, z) : d === 1 ? edgeAt('v', x + 1, z)
        : d === 2 ? edgeAt('h', x, z) : edgeAt('h', x, z + 1)
      if (e !== EDGE_OPEN || cellKind(x + DX[d], z + DZ[d]) !== cellKind(x, z)) break
      x += DX[d]
      z += DZ[d]
      run++
    }
    if (run > bestRun) { best = d; bestRun = run }
  }
  return best
}

// ── Ceiling lights ───────────────────────────────────────────────────────
// A regular panel every other cell (and along corridors) plus a few strays;
// each is on, flickering or dead — mostly dead in dark zones. Mall skylights
// count as always-on lights. Packed as `state | seed << 2` (seed 0..255).

export const LIGHT_NONE = 0
export const LIGHT_ON = 1
export const LIGHT_FLICKER = 2
export const LIGHT_DEAD = 3

export function lightAt(gx, gz) {
  const cx = Math.floor(gx / N)
  const cz = Math.floor(gz / N)
  const L = getLayout(cx, cz)
  const i = gx - cx * N
  const j = gz - cz * N
  const c = i * N + j
  const seed = (hash3(gx, gz, 9) & 255) << 2
  const s = hash01(gx, gz, 8)
  if (L.kind[c] === KIND_VOID) return LIGHT_NONE
  if (L.theme === THEME_MALL) {
    if (L.ceil[c] === CEIL_SKY) return LIGHT_ON | seed
    if (((L.mall.alongX ? gx : gz) & 1) !== 0) return LIGHT_NONE
    return (s < 0.06 ? LIGHT_FLICKER : LIGHT_ON) | seed
  }
  let present = (gx & 1) === 0 && (gz & 1) === 0
  if (L.rowX === j) present = (gx & 1) === 0
  if (L.colZ === i) present = (gz & 1) === 0
  if (!present && hash01(gx, gz, 7) > 0.08) return LIGHT_NONE
  let state
  if (L.dark) state = s < 0.88 ? LIGHT_DEAD : s < 0.97 ? LIGHT_FLICKER : LIGHT_ON
  else if (L.theme === THEME_POOL || L.theme === THEME_OFFICE) state = s < 0.03 ? LIGHT_DEAD : s < 0.08 ? LIGHT_FLICKER : LIGHT_ON
  else state = s < 0.1 ? LIGHT_DEAD : s < 0.2 ? LIGHT_FLICKER : LIGHT_ON
  return state | seed
}

// Flicker curve shared with the shader (materials.js) so the audio buzz and
// the visible light stay in sync: mostly on, with irregular drop-outs.
export function flicker(t, seed01) {
  const n = Math.sin(t * 7.3 + seed01 * 31) + 0.5 * Math.sin(t * 13.1 + seed01 * 17) + Math.sin(t * 2.1 + seed01 * 5)
  return n > 1.25 ? 0.12 : 1
}
