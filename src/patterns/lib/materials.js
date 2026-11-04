import * as THREE from 'three/webgpu'
import { float, vec4, abs, dot, normalize, normalView, positionView, pow, exp } from 'three/tsl'

// Additive glowing line material colored from the palette. `fade` dims lines
// with distance from the camera so deep geometry recedes into the dark.
export function glowLines(palette, t, { intensity = 1.4, fade = 0 } = {}) {
  const m = new THREE.LineBasicNodeMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const tNode = typeof t === 'number' ? float(t) : t
  let c = palette(tNode).mul(intensity)
  if (fade) c = c.mul(exp(positionView.z.mul(fade)))
  m.colorNode = vec4(c, 1)
  return m
}

// View-angle rim term: 0 facing the camera, 1 at silhouettes.
export const fresnel = (power = 2.5) =>
  pow(float(1).sub(abs(dot(normalView, normalize(positionView.negate())))), power)

// Translucent additive shell that glows at its silhouette.
export function ghostSurface(palette, t, { intensity = 1, base = 0.04, power = 2.5 } = {}) {
  const m = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })
  m.colorNode = vec4(palette(float(t)).mul(fresnel(power).mul(intensity).add(base)), 1)
  return m
}

// Builds a LineSegments geometry from a list of polylines ([[x,y,z], ...]).
export function polylineGeometry(lines) {
  const pts = []
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) pts.push(...line[i], ...line[i + 1])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

export function circle(radius, segments = 128, y = 0) {
  const out = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    out.push([Math.cos(a) * radius, y, Math.sin(a) * radius])
  }
  return out
}

// Disposes every geometry and material under an object.
export function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose()
    if (Array.isArray(o.material)) o.material.forEach(m => m.dispose())
    else o.material?.dispose()
  })
}
