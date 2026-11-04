import * as THREE from 'three/webgpu'
import {
  Fn, Loop, If, Break, uniform, float, vec2, vec3, screenUV, normalize, clamp, max, dot, pow,
  abs, exp, reflect,
} from 'three/tsl'

// Full-screen ray marcher. A pattern supplies a distance estimator `de(p)`
// and a `shade(hitInfo)` function; this builds the camera rays, the march
// loop, normals and step-count AO, and exposes a JS-side camera.
//
// Options:
//   de(p)            TSL Fn → float distance
//   shade(info)      ({ p, n, rd, ro, t, hit, ao, acc, uvp }) → vec3
//   accumulate(p,d,t) optional per-step vec3 added to `acc` (glow, volumes)
//   maxDist, stepScale, hitEps, minStep, fov, stepMul
export function buildRaymarch(ctx, opts) {
  const { u, tier } = ctx
  const {
    de, shade, accumulate = null,
    maxDist = 20, stepScale = 0.9, hitEps = 0.0015, minStep = 0, fov = 1.2,
  } = opts
  const steps = Math.max(24, Math.round(tier.steps * (opts.stepMul ?? 1)))

  const camPos   = uniform(new THREE.Vector3(0, 0, 3))
  const camFwd   = uniform(new THREE.Vector3(0, 0, -1))
  const camRight = uniform(new THREE.Vector3(1, 0, 0))
  const camUp    = uniform(new THREE.Vector3(0, 1, 0))
  const look     = uniform(new THREE.Vector2())

  const colorFn = Fn(() => {
    const uvp = screenUV.sub(0.5).mul(vec2(u.aspect, -1)).add(look)
    const ro  = camPos
    const rd  = normalize(camFwd.mul(fov).add(camRight.mul(uvp.x)).add(camUp.mul(uvp.y)))

    const t   = float(0.02).toVar()
    const hit = float(0).toVar()
    const n_i = float(0).toVar()
    const acc = vec3(0).toVar()

    Loop(steps, () => {
      const p = ro.add(rd.mul(t))
      const d = de(p)
      if (accumulate) acc.addAssign(accumulate(p, d, t))
      If(d.lessThan(t.mul(hitEps)), () => { hit.assign(1); Break() })
      t.addAssign(max(d.mul(stepScale), minStep))
      n_i.addAssign(1)
      If(t.greaterThan(maxDist), () => { Break() })
    })

    const p   = ro.add(rd.mul(t))
    const eps = max(t.mul(hitEps), 0.0006)
    const k   = vec2(1, -1)
    const n   = normalize(
      k.xyy.mul(de(p.add(k.xyy.mul(eps)))).add(
      k.yyx.mul(de(p.add(k.yyx.mul(eps))))).add(
      k.yxy.mul(de(p.add(k.yxy.mul(eps))))).add(
      k.xxx.mul(de(p.add(k.xxx.mul(eps))))),
    )
    const ao = clamp(float(1).sub(n_i.div(steps)), 0, 1)
    return shade({ p, n, rd, ro, t, hit, ao, acc, uvp })
  })

  const material = new THREE.MeshBasicNodeMaterial()
  material.colorNode = colorFn()
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  mesh.frustumCulled = false
  const scene  = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  scene.add(mesh)

  const worldUp    = new THREE.Vector3(0, 1, 0)
  const lookTarget = new THREE.Vector2()

  return {
    scene,
    camera,
    // Points the ray camera from `pos` at `target`, with optional roll.
    setCamera(pos, target, roll = 0, up = worldUp) {
      camPos.value.copy(pos)
      camFwd.value.subVectors(target, pos).normalize()
      camRight.value.crossVectors(camFwd.value, up).normalize()
      camUp.value.crossVectors(camRight.value, camFwd.value)
      if (roll) {
        camRight.value.applyAxisAngle(camFwd.value, roll)
        camUp.value.applyAxisAngle(camFwd.value, roll)
      }
    },
    // Lets the pointer nudge the view direction a little.
    updateLook(dt, pointerNDC, amount = 0.3) {
      const f = u.pointerForce.value
      lookTarget.set(pointerNDC.x * amount * f, -pointerNDC.y * amount * 0.7 * f)
      look.value.lerp(lookTarget, Math.min(1, dt * 2))
    },
    dispose() {
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}

// A reusable lit-surface model: headlight diffuse, a key light, rim fresnel
// and a specular glint, fogged by distance.
export function litSurface({ n, rd, t, hit, ao }, base, { fog = 0.2, rim = 0.6, spec = 0.5, rimColor } = {}) {
  const L    = normalize(vec3(0.4, 0.8, 0.3))
  const head = clamp(dot(n, rd.negate()), 0, 1)
  const key  = clamp(dot(n, L), 0, 1)
  const fres = pow(float(1).sub(abs(dot(n, rd))), 3)
  const sp   = pow(clamp(dot(reflect(rd, n), L), 0, 1), 24)
  const lit  = base.mul(head.mul(0.75).add(key.mul(0.35)).add(0.12)).mul(ao)
    .add((rimColor ?? base).mul(fres.mul(rim)))
    .add(vec3(sp.mul(spec)))
  return lit.mul(exp(t.mul(-fog))).mul(hit)
}
