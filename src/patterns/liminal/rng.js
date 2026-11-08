import { SEED } from './constants'

// Deterministic integer hashing: the same coordinates always produce the same
// rooms and lights, so walking back reveals exactly what you left behind.

export function hash3(a, b, c = 0) {
  let h = (SEED ^ Math.imul(a | 0, 0x27d4eb2d)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= Math.imul(c | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  return (h ^ (h >>> 15)) >>> 0
}

export const hash01 = (a, b, c) => hash3(a, b, c) / 4294967296

// Small fast seeded PRNG (mulberry32) returning floats in [0, 1).
export function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
