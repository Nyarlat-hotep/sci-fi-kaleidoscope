import * as THREE from 'three/webgpu'
import { uniform, hash, float, vec3, length, If, clamp } from 'three/tsl'
import { createStage } from './lib/stage'
import { buildParticles, pointerVortex } from './lib/particles'

// Attractor — particles riding the Aizawa strange attractor: a chaotic flow
// that wraps into a glowing apple-core shell with a spiralling tube through
// its axis. Particles respawn now and then so the whole structure stays lit.

const A = 0.95, B = 0.7, C = 0.6, D = 3.5, E = 0.25, F = 0.1
const SCALE = 1.9

export default {
  id: 'attractor',
  label: 'Attractor',
  fold: false,
  bloom: { strength: 0.8, radius: 0.5, threshold: 0.05 },

  create(ctx) {
    const { u, palette } = ctx
    const stage = createStage(ctx, { radius: 7.5, elev: 0.25, orbitSpeed: 0.02, useRot: true })
    const seed = uniform(0)

    const flow = (p) => {
      const x = p.x, y = p.y, z = p.z
      return vec3(
        z.sub(B).mul(x).sub(y.mul(D)),
        x.mul(D).add(z.sub(B).mul(y)),
        float(C).add(z.mul(A)).sub(z.mul(z).mul(z).div(3))
          .sub(x.mul(x).add(y.mul(y)).mul(float(1).add(z.mul(E))))
          .add(z.mul(x).mul(x).mul(x).mul(F)),
      )
    }

    const ps = buildParticles(ctx, {
      extras: { life: 'float' },
      init: ({ i, pos, vel, ex }) => {
        pos.assign(vec3(hash(i), hash(i.add(1)), hash(i.add(2))).sub(0.5).mul(2))
        vel.assign(vec3(0))
        ex.life.assign(hash(i.add(5)).mul(12))
      },
      step: ({ i, p, v, dt, ex }) => {
        // Attractor space is z-up; rendering swaps axes so it stands upright.
        const q = vec3(p.x, p.z, p.y)
        const f = flow(q)
        const fv = vec3(f.x, f.z, f.y)
        const push = pointerVortex(u, p.mul(SCALE), stage.camDir, { swirl: 2, push: 4, reach: 1.2 })
        v.assign(fv.add(push.div(SCALE).mul(3)))
        p.addAssign(v.mul(dt))
        ex.life.subAssign(dt)
        If(ex.life.lessThan(0).or(length(p).greaterThan(4)), () => {
          const si = i.add(seed.toUint())
          const h = hash(si)
          p.assign(vec3(h, hash(si.add(1)), hash(si.add(2))).sub(0.5).mul(1.6))
          ex.life.assign(h.mul(10).add(4))
        })
      },
      color: ({ vel }) => {
        const s = clamp(length(vel).mul(0.35), 0, 1)
        return palette(s).mul(s.mul(0.8).add(0.6))
      },
      size: 0.016,
      opacity: 0.28,
    })
    ps.object.scale.setScalar(SCALE)
    const holder = new THREE.Group()
    holder.add(ps.object)
    stage.scene.add(holder)

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      init: ps.init,
      update(dt, { pointerNDC }) {
        stage.update(dt, pointerNDC)
        seed.value = Math.floor(Math.random() * 1e6)
        holder.scale.setScalar(1 - u.breath.value * 0.2)
        ps.step(Math.min(dt, 1 / 30) * (0.08 + u.speed.value * 0.18))
      },
      dispose: () => ps.dispose(),
    }
  },
}
