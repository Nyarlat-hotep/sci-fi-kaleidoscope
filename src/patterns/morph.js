import * as THREE from 'three/webgpu'
import {
  uniform, hash, float, vec3, sin, cos, sqrt, abs, max, select, mix, clamp, smoothstep, length,
  PI, TWO_PI,
} from 'three/tsl'
import { createStage } from './lib/stage'
import { buildParticles, pointerVortex } from './lib/particles'
import { curlNoise } from './lib/sdf'

// Morph — a cloud of particles that keeps reassembling itself into new forms:
// sphere → torus → cube → double helix → trefoil knot. Each particle departs
// on its own slight delay and tumbles through curl noise mid-flight.

const SHAPES = 5
const HOLD = 4.5
const MOVE = 3.0

export default {
  id: 'morph',
  label: 'Morph',
  fold: false,
  bloom: { strength: 0.85, radius: 0.5, threshold: 0.05 },

  create(ctx) {
    const { u, palette } = ctx
    const stage = createStage(ctx, { radius: 8, elev: 0.3, orbitSpeed: 0.02, useRot: true })
    const shapeA = uniform(0)
    const shapeB = uniform(1)
    const blend  = uniform(0)

    const shapeFor = (k, h1, h2, h3) => {
      // 0 sphere
      const z = h1.mul(2).sub(1)
      const ph = h2.mul(TWO_PI)
      const rs = sqrt(float(1).sub(z.mul(z)))
      const sphere = vec3(cos(ph).mul(rs), z, sin(ph).mul(rs)).mul(2.3)
      // 1 torus
      const a = h1.mul(TWO_PI)
      const b = h2.mul(TWO_PI)
      const torus = vec3(cos(a).mul(float(1.9).add(cos(b).mul(0.65))), sin(b).mul(0.65), sin(a).mul(float(1.9).add(cos(b).mul(0.65))))
      // 2 cube surface
      const c = vec3(h1, h2, h3).mul(2).sub(1)
      const cube = c.div(max(abs(c.x), max(abs(c.y), abs(c.z)))).mul(1.7)
      // 3 double helix
      const ty = h1.mul(2).sub(1)
      const strand = select(h2.lessThan(0.5), float(0), PI)
      const ha = ty.mul(7).add(strand)
      const helix = vec3(cos(ha).mul(1.0), ty.mul(2.6), sin(ha).mul(1.0))
        .add(vec3(h3.sub(0.5), h2.sub(0.5), h3.mul(h2).sub(0.25)).mul(0.25))
      // 4 trefoil knot
      const tt = h1.mul(TWO_PI)
      const knot = vec3(
        sin(tt).add(sin(tt.mul(2)).mul(2)),
        cos(tt).sub(cos(tt.mul(2)).mul(2)),
        sin(tt.mul(3)).negate(),
      ).mul(0.75).add(vec3(h2.sub(0.5), h3.sub(0.5), h2.mul(h3).sub(0.25)).mul(0.35))

      return select(k.lessThan(0.5), sphere,
        select(k.lessThan(1.5), torus,
          select(k.lessThan(2.5), cube,
            select(k.lessThan(3.5), helix, knot))))
    }

    const ps = buildParticles(ctx, {
      extras: { seed: 'vec3' },
      init: ({ i, pos, vel, ex }) => {
        const h = vec3(hash(i), hash(i.add(1)), hash(i.add(2)))
        ex.seed.assign(h)
        pos.assign(h.sub(0.5).mul(4))
        vel.assign(vec3(0))
      },
      step: ({ p, v, dt, ex }) => {
        const h = ex.seed
        const local = clamp(blend.mul(1.5).sub(h.z.mul(0.5)), 0, 1)
        const k = smoothstep(0, 1, local)
        const target = mix(shapeFor(shapeA, h.x, h.y, h.z), shapeFor(shapeB, h.x, h.y, h.z), k)
          .mul(float(1).sub(u.breath.mul(0.25)))
        const inFlight = sin(local.mul(PI))
        const flow = curlNoise(p.mul(0.6).add(vec3(0, u.animTime.mul(0.07), 0)))
        const force = target.sub(p).mul(7).add(flow.mul(inFlight.mul(5).add(0.25)))
          .add(pointerVortex(u, p, stage.camDir))
        v.addAssign(force.mul(dt))
        v.mulAssign(clamp(float(1).sub(dt.mul(3.2)), 0, 1))
        p.addAssign(v.mul(dt))
      },
      color: ({ pos, vel }) => palette(length(pos).mul(0.22).add(length(vel).mul(0.05)))
        .mul(float(0.65).add(length(vel).mul(0.08))),
      size: 0.022,
      opacity: 0.3,
    })
    stage.scene.add(ps.object)

    let clock = 0

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      init: ps.init,
      update(dt, { pointerNDC }) {
        stage.update(dt, pointerNDC)
        clock += dt * (0.15 + u.speed.value * 0.3)
        const cycle = HOLD + MOVE
        const n = Math.floor(clock / cycle)
        const phase = clock - n * cycle
        shapeA.value = n % SHAPES
        shapeB.value = (n + 1) % SHAPES
        blend.value = phase < HOLD ? 0 : (phase - HOLD) / MOVE
        ps.step(Math.min(dt, 1 / 30) * (0.25 + u.speed.value * 0.3))
      },
      dispose: () => ps.dispose(),
    }
  },
}
