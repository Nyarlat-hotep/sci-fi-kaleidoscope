import { CELL, CHUNK, SINK } from './constants'
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
// Every special feature stays at least one cell away from the chunk border,
// so cells on a border are always at normal floor and ceiling height and
// cross-chunk edges never need to know about levels.

export const EDGE_OPEN = 0
export const EDGE_WALL = 1
export const EDGE_DOOR = 2
export const EDGE_RAIL = 3   // level change: drop face + railing, impassable

export const ZONE_CLASSIC = 0
export const ZONE_HALL = 1
export const ZONE_ATRIUM = 2
export const ZONE_SUNKEN = 3

// Cell kinds. Stairs are KIND_STAIR + the direction of their top end.
export const KIND_NORMAL = 0
export const KIND_SUNK = 1
export const KIND_STAIR = 2

// Directions: 0 = −x, 1 = +x, 2 = −z, 3 = +z (opposite = d ^ 1).
const DX = [-1, 1, 0, 0]
const DZ = [0, 0, -1, 1]

const N = CHUNK
const CORRIDOR_SPAN = 6   // corridors are laid out in blocks of this many chunks

// ── Global, coordinate-only decisions ────────────────────────────────────

// Row (cell z index) of an east-west corridor through this chunk, or −1.
export function corridorX(cx, cz) {
  const seg = Math.floor(cx / CORRIDOR_SPAN)
  if (hash01(seg, cz, 50) >= 0.09) return -1
  const start = hash3(seg, cz, 51) % 3
  const len = 3 + (hash3(seg, cz, 52) % (4 - start))
  const local = cx - seg * CORRIDOR_SPAN
  return local >= start && local < start + len ? 1 + (hash3(seg, cz, 53) % (N - 2)) : -1
}

// Column (cell x index) of a north-south corridor through this chunk, or −1.
export function corridorZ(cx, cz) {
  const seg = Math.floor(cz / CORRIDOR_SPAN)
  if (hash01(cx, seg, 60) >= 0.09) return -1
  const start = hash3(cx, seg, 61) % 3
  const len = 3 + (hash3(cx, seg, 62) % (4 - start))
  const local = cz - seg * CORRIDOR_SPAN
  return local >= start && local < start + len ? 1 + (hash3(cx, seg, 63) % (N - 2)) : -1
}

export function zoneOf(cx, cz) {
  if (corridorX(cx, cz) >= 0 || corridorZ(cx, cz) >= 0) return ZONE_CLASSIC
  const r = hash01(cx, cz, 30)
  return r < 0.06 ? ZONE_HALL : r < 0.11 ? ZONE_ATRIUM : r < 0.16 ? ZONE_SUNKEN : ZONE_CLASSIC
}

export const isDark = (cx, cz) => hash01(cx, cz, 40) < 0.06

// ── Level connectivity ───────────────────────────────────────────────────

// Can you walk from a cell of kind `a` to its neighbour of kind `b` in
// direction `d` (ignoring walls)?
export function connects(a, b, d) {
  if (a >= KIND_STAIR && b >= KIND_STAIR) return false
  if (a >= KIND_STAIR) return stairJoins(a - KIND_STAIR, b, d)
  if (b >= KIND_STAIR) return stairJoins(b - KIND_STAIR, a, d ^ 1)
  return a === b
}

function stairJoins(up, other, d) {
  if (d === up) return other === KIND_NORMAL
  if (d === (up ^ 1)) return other === KIND_SUNK
  return false
}

// ── Generation ───────────────────────────────────────────────────────────

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

function openRect(v, h, x0, z0, w, d) {
  for (let i = x0 + 1; i < x0 + w; i++) for (let j = z0; j < z0 + d; j++) v[edgeIndex(i, j)] = EDGE_OPEN
  for (let i = x0; i < x0 + w; i++) for (let j = z0 + 1; j < z0 + d; j++) h[edgeIndex(i, j)] = EDGE_OPEN
}

// A random w×d rect (each side in [lo, hi]) kept one cell inside the chunk.
function innerRect(rnd, lo, hi) {
  const w = lo + ((rnd() * (hi - lo + 1)) | 0)
  const d = lo + ((rnd() * (hi - lo + 1)) | 0)
  const x0 = 1 + ((rnd() * (N - 1 - w)) | 0)
  const z0 = 1 + ((rnd() * (N - 1 - d)) | 0)
  return [x0, z0, w, d]
}

// Lowers a rect and cuts up to `stairs` stair runs into its sides.
function sinkRect(kind, v, h, rnd, x0, z0, w, d, stairs) {
  for (let i = x0; i < x0 + w; i++) for (let j = z0; j < z0 + d; j++) kind[i * N + j] = KIND_SUNK
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
      if (k < KIND_STAIR) continue
      const o = k - KIND_STAIR
      const si = (s / N) | 0
      const sj = s % N
      if (si - DX[o] === i && sj - DZ[o] === j) blocksOther = true
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

// Owned borders: mostly wall with at least two passable openings per side,
// or mostly open between two huge halls so they merge.
function borders(v, h, rnd, cx, cz, zone) {
  const sides = [
    { arr: v, at: (t) => t, merge: zone === ZONE_HALL && zoneOf(cx - 1, cz) === ZONE_HALL },
    { arr: h, at: (t) => t * N, merge: zone === ZONE_HALL && zoneOf(cx, cz - 1) === ZONE_HALL },
  ]
  for (const { arr, at, merge } of sides) {
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

// Makes every cell in the chunk reachable, opening walls between unreached
// regions and the reached area where levels allow it.
function repair(v, h, kind, rnd) {
  const reached = new Uint8Array(N * N)
  const queue = [0]
  reached[0] = 1
  const passable = (i, j, d) => {
    const ni = i + DX[d]
    const nj = j + DZ[d]
    if (ni < 0 || ni >= N || nj < 0 || nj >= N) return -1
    const [arr, e] = edgeOf(v, h, i, j, d)
    const n = ni * N + nj
    if (!connects(kind[i * N + j], kind[n], d)) return -1
    return arr[e] === EDGE_WALL ? -2 - n : n   // −2−n marks "only a wall in the way"
  }
  for (;;) {
    while (queue.length) {
      const c = queue.pop()
      const i = (c / N) | 0
      const j = c % N
      for (let d = 0; d < 4; d++) {
        const n = passable(i, j, d)
        if (n >= 0 && !reached[n]) { reached[n] = 1; queue.push(n) }
      }
    }
    // Collect walls separating reached cells from unreached ones.
    const candidates = []
    for (let c = 0; c < N * N; c++) {
      if (!reached[c]) continue
      const i = (c / N) | 0
      const j = c % N
      for (let d = 0; d < 4; d++) {
        const n = passable(i, j, d)
        if (n <= -2 && !reached[-2 - n]) candidates.push([i, j, d])
      }
    }
    if (!candidates.length) return
    const [i, j, d] = candidates[(rnd() * candidates.length) | 0]
    const [arr, e] = edgeOf(v, h, i, j, d)
    arr[e] = rnd() < 0.5 ? EDGE_DOOR : EDGE_OPEN
    const n = (i + DX[d]) * N + (j + DZ[d])
    reached[n] = 1
    queue.push(n)
  }
}

// Turn passable edges across a level change into railings, and make stair
// entries plain openings.
function finalizeEdges(v, h, kind) {
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      // v edge (i, j): cells (i−1, j) → (i, j), direction +x
      if (i > 0) settle(v, edgeIndex(i, j), kind[(i - 1) * N + j], kind[i * N + j], 1)
      if (j > 0) settle(h, edgeIndex(i, j), kind[i * N + j - 1], kind[i * N + j], 3)
    }
  }
}

function settle(arr, e, a, b, d) {
  if (arr[e] === EDGE_WALL) return
  if (!connects(a, b, d)) arr[e] = EDGE_RAIL
  else if (a >= KIND_STAIR || b >= KIND_STAIR) arr[e] = EDGE_OPEN
}

function generateLayout(cx, cz) {
  const rnd = mulberry32(hash3(cx, cz, 1))
  const v = new Uint8Array(N * N).fill(EDGE_WALL)
  const h = new Uint8Array(N * N).fill(EDGE_WALL)
  const kind = new Uint8Array(N * N)
  const tall = new Uint8Array(N * N)
  const pillars = []   // [i, j, tall] per vertex
  const zone = zoneOf(cx, cz)
  const rowX = corridorX(cx, cz)
  const colZ = corridorZ(cx, cz)

  spanningTree(v, h, rnd)
  loosen(v, h, rnd)

  if (zone === ZONE_HALL) {
    openRect(v, h, 0, 0, N, N)
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) pillars.push(i, j, 0)
  } else if (zone === ZONE_ATRIUM) {
    const [x0, z0, w, d] = innerRect(rnd, 4, 5)
    openRect(v, h, x0, z0, w, d)
    for (let i = x0; i < x0 + w; i++) for (let j = z0; j < z0 + d; j++) tall[i * N + j] = 1
    for (let i = x0 + 1; i < x0 + w; i++) {
      for (let j = z0 + 1; j < z0 + d; j++) {
        const onPitEdge = i === x0 + 1 || i === x0 + w - 1 || j === z0 + 1 || j === z0 + d - 1
        if (onPitEdge && rnd() < 0.5) pillars.push(i, j, 1)
      }
    }
    sinkRect(kind, v, h, rnd, x0 + 1, z0 + 1, w - 2, d - 2, 1)
  } else if (zone === ZONE_SUNKEN) {
    const [x0, z0, w, d] = innerRect(rnd, 3, 5)
    openRect(v, h, x0, z0, w, d)
    sinkRect(kind, v, h, rnd, x0, z0, w, d, 2)
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

  return {
    cx, cz, zone, dark: isDark(cx, cz), rowX, colZ,
    v, h, kind, tall, pillars, geometry: null,
  }
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

// Light-map flag byte: 1 sunken, 2 stair, 4 tall ceiling, 8 dark zone.
export function cellFlags(gx, gz) {
  const [L, c] = locate(gx, gz)
  const k = L.kind[c]
  return (k === KIND_SUNK ? 1 : 0) | (k >= KIND_STAIR ? 2 : 0) | (L.tall[c] ? 4 : 0) | (L.dark ? 8 : 0)
}

// Final edge type in global coordinates (axis 'v' or 'h', same indexing as above).
export function edgeAt(axis, gx, gz) {
  const [L, c] = locate(gx, gz)
  return (axis === 'v' ? L.v : L.h)[c]
}

// Walkable floor height at a world position (stairs are smooth ramps).
export function floorAt(x, z) {
  const gx = Math.floor(x / CELL)
  const gz = Math.floor(z / CELL)
  const k = cellKind(gx, gz)
  if (k === KIND_NORMAL) return 0
  if (k === KIND_SUNK) return -SINK
  const up = k - KIND_STAIR
  const fx = x / CELL - gx
  const fz = z / CELL - gz
  const u = up === 0 ? 1 - fx : up === 1 ? fx : up === 2 ? 1 - fz : fz
  return -SINK * (1 - u)
}

// ── Ceiling lights ───────────────────────────────────────────────────────
// A regular panel every other cell (and along corridors) plus a few strays;
// each is on, flickering or dead — mostly dead in dark zones. Packed as
// `state | seed << 2` (seed 0..255) to avoid allocations.

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
  let present = (gx & 1) === 0 && (gz & 1) === 0
  if (L.rowX === j) present = (gx & 1) === 0
  if (L.colZ === i) present = (gz & 1) === 0
  if (!present && hash01(gx, gz, 7) > 0.08) return LIGHT_NONE
  const s = hash01(gx, gz, 8)
  const state = L.dark
    ? (s < 0.88 ? LIGHT_DEAD : s < 0.97 ? LIGHT_FLICKER : LIGHT_ON)
    : (s < 0.1 ? LIGHT_DEAD : s < 0.2 ? LIGHT_FLICKER : LIGHT_ON)
  return state | ((hash3(gx, gz, 9) & 255) << 2)
}

// Flicker curve shared with the shader (materials.js) so the audio buzz and
// the visible light stay in sync: mostly on, with irregular drop-outs.
export function flicker(t, seed01) {
  const n = Math.sin(t * 7.3 + seed01 * 31) + 0.5 * Math.sin(t * 13.1 + seed01 * 17) + Math.sin(t * 2.1 + seed01 * 5)
  return n > 1.25 ? 0.12 : 1
}
