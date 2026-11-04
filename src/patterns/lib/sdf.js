import {
  Fn, abs, max, min, length, vec2, vec3, float, fract, sin, dot, mx_noise_vec3,
} from 'three/tsl'

// Signed-distance and hashing helpers shared by the ray-marched patterns.

export const sdBox = Fn(([p, b]) => {
  const q = abs(p).sub(b)
  return length(max(q, 0)).add(min(max(q.x, max(q.y, q.z)), 0))
})

// Torus lying in the xz plane: t = vec2(majorRadius, tubeRadius).
export const sdTorus = Fn(([p, t]) => length(vec2(length(p.xz).sub(t.x), p.y)).sub(t.y))

// Octahedron stretched along y by `len` (always a safe under-estimate).
export const sdCrystal = Fn(([p, len, w]) => {
  const a = abs(p)
  return a.x.add(a.y.div(len)).add(a.z).sub(w).mul(0.57735)
})

export const hash21 = Fn(([c]) => fract(sin(dot(c, vec2(127.1, 311.7))).mul(43758.5453)))
export const hash31 = Fn(([c]) => fract(sin(dot(c, vec3(127.1, 311.7, 74.7))).mul(43758.5453)))

// Divergence-free noise field — makes particles swirl without bunching.
export const curlNoise = Fn(([p]) => {
  const e  = float(0.12)
  const f0 = mx_noise_vec3(p)
  const dx = mx_noise_vec3(p.add(vec3(e, 0, 0))).sub(f0)
  const dy = mx_noise_vec3(p.add(vec3(0, e, 0))).sub(f0)
  const dz = mx_noise_vec3(p.add(vec3(0, 0, e))).sub(f0)
  return vec3(dy.z.sub(dz.y), dz.x.sub(dx.z), dx.y.sub(dy.x)).div(e)
})
