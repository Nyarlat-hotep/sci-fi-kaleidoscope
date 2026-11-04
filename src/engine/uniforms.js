import * as THREE from 'three/webgpu'
import { uniform, Fn, vec3, float, clamp, mix, cos, sin, cross, dot, select } from 'three/tsl'

// One shared set of TSL uniforms that every pattern and the post pipeline
// read from. The engine writes these once per frame from the React controls.
export function createUniforms() {
  return {
    time:       uniform(0),       // seconds, slowed during breath modes
    animTime:   uniform(0),       // time scaled by the Speed slider (integrated)
    speed:      uniform(0.45),
    symmetry:   uniform(8),
    rot:        uniform(0),       // accumulated spin angle
    hueSpread:  uniform(0),
    hueAngle:   uniform(0),
    brightness: uniform(1),
    contrast:   uniform(1.1),
    zoomPulse:  uniform(0),
    warp:       uniform(0),
    breath:     uniform(0),
    zoomScroll: uniform(0),
    aspect:     uniform(1),
    fold:       uniform(1),       // 1 = mirror fold on, 0 = raw scene

    pointer:      uniform(new THREE.Vector2()),   // aspect-corrected, center = 0
    pointerWorld: uniform(new THREE.Vector3()),   // pointer projected into the scene
    pointerForce: uniform(0),                     // 0..1, decays when idle

    pal0: uniform(new THREE.Color()),
    pal1: uniform(new THREE.Color()),
    pal2: uniform(new THREE.Color()),
    pal3: uniform(new THREE.Color()),
  }
}

// Maps 0..1 across the three accent colors (pal0 → pal1 → pal2). Accents
// are always vivid; patterns set their own brightness, and use u.pal3 (the
// palette's dark tone) for shadows and backgrounds.
export function makePaletteFn(u) {
  return Fn(([tIn]) => {
    const t = clamp(tIn, 0, 1).mul(2).toVar()
    const a = mix(u.pal0, u.pal1, clamp(t, 0, 1))
    const b = mix(u.pal1, u.pal2, clamp(t.sub(1), 0, 1))
    return select(t.lessThan(1), a, b)
  })
}

// Rodrigues rotation around the grey axis — rotates hue, keeps luminance.
export const hueRotate = Fn(([col, angle]) => {
  const k = vec3(0.57735026919)
  const c = cos(angle)
  const s = sin(angle)
  return col.mul(c).add(cross(k, col).mul(s)).add(k.mul(dot(k, col)).mul(float(1).sub(c)))
})
