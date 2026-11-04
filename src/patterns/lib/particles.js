import * as THREE from 'three/webgpu'
import {
  Fn, uniform, instancedArray, instanceIndex, float, vec4, length, smoothstep, uv, exp,
  cross, normalize,
} from 'three/tsl'

// GPU particle system: position + velocity buffers (plus optional extras)
// simulated by compute shaders and drawn as additive soft sprites.
//
//   init({ i, pos, vel, ex })            write starting values (TSL)
//   step({ i, p, v, dt, ex })            mutate p / v vars each frame (TSL)
//   color({ pos, vel, ex })              vec3 color per particle (TSL)
//   extras: { name: 'float' | 'vec3' }   additional per-particle buffers
export function buildParticles(ctx, opts) {
  const { renderer, tier } = ctx
  const count = Math.round(tier.particles * (opts.countMul ?? 1))
  const { extras = {}, init, step, color, size = 0.022, opacity = 0.34 } = opts

  const pos = instancedArray(count, 'vec3')
  const vel = instancedArray(count, 'vec3')
  const exBuf = {}
  for (const [name, type] of Object.entries(extras)) exBuf[name] = instancedArray(count, type)
  const dtU = uniform(0)

  const elems = () => Object.fromEntries(
    Object.entries(exBuf).map(([k, b]) => [k, b.element(instanceIndex)]),
  )

  const initCompute = Fn(() => {
    init({ i: instanceIndex, pos: pos.element(instanceIndex), vel: vel.element(instanceIndex), ex: elems() })
  })().compute(count)

  const stepCompute = Fn(() => {
    const P = pos.element(instanceIndex)
    const V = vel.element(instanceIndex)
    const p = P.toVar()
    const v = V.toVar()
    step({ i: instanceIndex, p, v, dt: dtU, ex: elems() })
    P.assign(p)
    V.assign(v)
  })().compute(count)

  // Fewer particles → each one a little larger and brighter.
  const density = Math.sqrt((1 << 18) / count)
  const material = new THREE.SpriteNodeMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const posAttr = pos.toAttribute()
  const exAttr = Object.fromEntries(Object.entries(exBuf).map(([k, b]) => [k, b.toAttribute()]))
  material.positionNode = posAttr
  material.colorNode = vec4(color({ pos: posAttr, vel: vel.toAttribute(), ex: exAttr }), 1)
  const disc = smoothstep(0.5, 0.0, length(uv().sub(0.5)))
  material.opacityNode = disc.mul(disc).mul(opacity * density)
  material.scaleNode = float(size * Math.min(density, 2.2))

  const sprite = new THREE.Sprite(material)
  sprite.count = count
  sprite.frustumCulled = false

  return {
    object: sprite,
    count,
    init: () => renderer.computeAsync(initCompute),
    step(dt) {
      dtU.value = dt
      renderer.compute(stepCompute)
    },
    dispose() {
      material.dispose()
    },
  }
}

// Swirl + push around the pointer's position in the scene.
export function pointerVortex(u, p, camDir, { swirl = 6, push = 2.5, reach = 1.4 } = {}) {
  const d = p.sub(u.pointerWorld)
  const pf = u.pointerForce.mul(exp(d.dot(d).mul(-reach)))
  return cross(camDir, d).mul(swirl).add(normalize(d.add(1e-4)).mul(push)).mul(pf)
}
