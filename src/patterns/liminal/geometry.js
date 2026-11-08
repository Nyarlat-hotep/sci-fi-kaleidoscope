import {
  CELL, CHUNK, WALL_H, WALL_T, DOOR_W, DOOR_H, PILLAR, SINK, STEPS, ATRIUM_H,
} from './constants'
import {
  getLayout, lightAt, LIGHT_NONE, EDGE_OPEN, EDGE_WALL, EDGE_DOOR, EDGE_RAIL,
  KIND_NORMAL, KIND_SUNK, KIND_STAIR,
} from './layout'

// Turns a chunk layout into world-space boxes, grouped by material. A box is
// [x0, x1, y0, y1, z0, z1]. `solid` (walls + trim) doubles as collision.

const N = CHUNK
const SLAB = 0.12          // floor / ceiling tile thickness
const RAIL_H = 1.0
const LEDGE_DEPTH = 0.8

const floorY = (kind) => (kind === KIND_NORMAL ? 0 : -SINK)   // stairs bottom out at −SINK

// Thin segment along a line: fixed coordinate `at` on the other axis.
function span(out, alongZ, at, s0, s1, y0, y1, half) {
  if (alongZ) out.push([at - half, at + half, y0, y1, s0, s1])
  else        out.push([s0, s1, y0, y1, at - half, at + half])
}

function railing(out, alongZ, at, s0, s1, base) {
  span(out, alongZ, at, s0, s1, base + RAIL_H - 0.06, base + RAIL_H, 0.03)
  span(out, alongZ, at, s0, s1, base + RAIL_H * 0.5 - 0.02, base + RAIL_H * 0.5, 0.02)
  const posts = Math.max(2, Math.ceil((s1 - s0) / 1.0) + 1)
  for (let p = 0; p < posts; p++) {
    const s = s0 + ((s1 - s0) * p) / (posts - 1)
    span(out, alongZ, at, s - 0.03, s + 0.03, base, base + RAIL_H, 0.03)
  }
}

// One cell edge: `at` is the line coordinate, [s0, s1] its extent, `a`/`b`
// the cell kinds and tall flags on the low/high side of the line.
function edgeGeometry(g, type, alongZ, at, s0, s1, a, b, tallA, tallB) {
  const t = WALL_T / 2
  const bottom = Math.min(floorY(a), floorY(b))
  const top = tallA && tallB ? ATRIUM_H : WALL_H
  const e0 = s0 - t
  const e1 = s1 + t

  if (type === EDGE_WALL) span(g.walls, alongZ, at, e0, e1, bottom, top, t)
  else if (type === EDGE_DOOR) {
    const c = (s0 + s1) / 2
    const hw = DOOR_W / 2
    const level = Math.max(floorY(a), floorY(b))
    span(g.walls, alongZ, at, e0, c - hw, bottom, top, t)
    span(g.walls, alongZ, at, c + hw, e1, bottom, top, t)
    span(g.walls, alongZ, at, c - hw, c + hw, level + DOOR_H, top, t)
  } else if (type === EDGE_RAIL) {
    span(g.trim, alongZ, at, e0, e1, -SINK, 0, t)       // drop face
    railing(g.trim, alongZ, at, s0, s1, 0)
  }

  // Atrium shaft: wall up to the high ceiling where tall meets normal, with
  // balcony ledges (and railings) stepping out into the void.
  if (tallA !== tallB) {
    span(g.walls, alongZ, at, e0, e1, WALL_H, ATRIUM_H, t)
    const dir = tallB ? 1 : -1                          // toward the tall side
    const inner = at + dir * (t + LEDGE_DEPTH)
    for (let floor = 1; floor <= 2; floor++) {
      const y = WALL_H * floor
      const lo = Math.min(at, inner)
      const hi = Math.max(at, inner)
      if (alongZ) g.trim.push([lo, hi, y - 0.18, y, e0, e1])
      else        g.trim.push([e0, e1, y - 0.18, y, lo, hi])
      railing(g.trim, alongZ, inner, s0, s1, y)
    }
  }
}

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
  const g = { walls: [], floors: [], ceilings: [], trim: [], panels: [], solid: null }
  const ox = cx * N
  const oz = cz * N
  // Kind / tall of a cell, treating cells outside this chunk as plain floor
  // (borders never touch features, see layout.js).
  const kindAt = (i, j) => (i >= 0 && j >= 0 ? L.kind[i * N + j] : KIND_NORMAL)
  const tallAt = (i, j) => (i >= 0 && j >= 0 ? L.tall[i * N + j] : 0)

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const c = i * N + j
      const x0 = (ox + i) * CELL
      const z0 = (oz + j) * CELL
      const k = L.kind[c]

      // Floor (or stair), ceiling and light panel for the cell.
      if (k >= KIND_STAIR) stairSteps(g.floors, x0, z0, k - KIND_STAIR)
      else {
        const y = k === KIND_SUNK ? -SINK : 0
        g.floors.push([x0, x0 + CELL, y - SLAB, y, z0, z0 + CELL])
      }
      const ceil = L.tall[c] ? ATRIUM_H : WALL_H
      g.ceilings.push([x0, x0 + CELL, ceil, ceil + SLAB, z0, z0 + CELL])
      if ((lightAt(ox + i, oz + j) & 3) !== LIGHT_NONE) g.panels.push(x0 + CELL / 2, ceil - 0.01, z0 + CELL / 2)

      // Owned edges: west line of this cell and south line of this cell.
      const vt = L.v[c]
      if (vt !== EDGE_OPEN || L.tall[c] !== tallAt(i - 1, j)) {
        edgeGeometry(g, vt, true, x0, z0, z0 + CELL, kindAt(i - 1, j), k, tallAt(i - 1, j), L.tall[c])
      }
      const ht = L.h[c]
      if (ht !== EDGE_OPEN || L.tall[c] !== tallAt(i, j - 1)) {
        edgeGeometry(g, ht, false, z0, x0, x0 + CELL, kindAt(i, j - 1), k, tallAt(i, j - 1), L.tall[c])
      }
    }
  }

  // Pillars, from the lowest floor touching the vertex up to the ceiling.
  const p = PILLAR / 2
  for (let n = 0; n < L.pillars.length; n += 3) {
    const i = L.pillars[n]
    const j = L.pillars[n + 1]
    const x = (ox + i) * CELL
    const z = (oz + j) * CELL
    const bottom = Math.min(
      floorY(kindAt(i - 1, j - 1)), floorY(kindAt(i, j - 1)), floorY(kindAt(i - 1, j)), floorY(kindAt(i, j)),
    )
    g.walls.push([x - p, x + p, bottom, L.pillars[n + 2] ? ATRIUM_H : WALL_H, z - p, z + p])
  }

  g.solid = g.walls.concat(g.trim)
  L.geometry = g
  return g
}

