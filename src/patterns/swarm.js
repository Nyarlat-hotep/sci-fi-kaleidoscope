import * as THREE from 'three/webgpu'
import {
  uniform, hash, float, vec3, floor, select, length, cross, clamp, min,
} from 'three/tsl'
import { createStage } from './lib/stage'
import { buildParticles, pointerVortex } from './lib/particles'
import { curlNoise } from './lib/sdf'

// Swarm — five flocks, each chasing its own leader along a looping 3D path.
// Particles are pulled toward their leader, orbit it on a tilted axis and are
// jostled by curl noise, so each flock stretches and folds like starlings.
// The pointer acts as a sixth, much stronger attractor.

const FLOCKS = 5

export default {
  id: 'swarm',
  label: 'Swarm',
  fold: false,
  bloom: { strength: 0.8, radius: 0.5, threshold: 0.05 },

  create(ctx) {
    const { u, palette } = ctx
    const stage = createStage(ctx, { radius: 9, elev: 0.35, orbitSpeed: 0.03, useRot: true })
    const leaders = Array.from({ length: FLOCKS }, () => uniform(new THREE.Vector3()))

    // Picks the leader (or orbit axis) for flock index k via a select chain.
    const pick = (k, list) => list.slice(1).reduce(
      (acc, v, j) => select(k.equal(float(j + 1)), v, acc), list[0],
    )
    const axes = Array.from({ length: FLOCKS }, (_, j) => {
      const a = new THREE.Vector3(Math.sin(j * 2.1), 0.8, Math.cos(j * 1.3)).normalize()
      return vec3(a.x, a.y, a.z)
    })

    const ps = buildParticles(ctx, {
      extras: { flock: 'float' },
      init: ({ i, pos, vel, ex }) => {
        const k = floor(hash(i.add(11)).mul(FLOCKS))
        ex.flock.assign(k)
        pos.assign(vec3(hash(i), hash(i.add(1)), hash(i.add(2))).sub(0.5).mul(8))
        vel.assign(vec3(0))
      },
      step: ({ p, v, dt, ex }) => {
        const k = ex.flock
        const leader = pick(k, leaders)
        const axis = pick(k, axes)
        const d = leader.sub(p)
        const dist = length(d)
        const pull = d.div(dist.add(0.001)).mul(min(dist, 3).mul(2.2))
        const orbit = cross(axis, d).mul(1.6).div(dist.add(0.4))
        const flow = curlNoise(p.mul(0.5).add(vec3(0, u.animTime.mul(0.05), k)))
        const force = pull.add(orbit).add(flow.mul(1.6))
          .add(pointerVortex(u, p, stage.camDir, { swirl: 3, push: -6, reach: 0.25 }))
        v.addAssign(force.mul(dt))
        v.mulAssign(clamp(float(1).sub(dt.mul(1.1)), 0, 1))
        p.addAssign(v.mul(dt))
      },
      color: ({ vel, ex }) => palette(ex.flock.div(FLOCKS - 1).mul(0.85).add(length(vel).mul(0.04)))
        .mul(float(0.7).add(length(vel).mul(0.12))),
      size: 0.024,
      opacity: 0.32,
    })
    stage.scene.add(ps.object)

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      init: ps.init,
      update(dt, { pointerNDC }) {
        stage.update(dt, pointerNDC)
        const t = u.animTime.value * 0.18
        const spread = 1 - u.breath.value * 0.5
        leaders.forEach((l, j) => {
          const a = t * (0.5 + j * 0.13) + j * 1.7
          l.value.set(
            Math.sin(a) * 3.6 * spread,
            Math.sin(a * 1.3 + j) * 1.8 * spread,
            Math.cos(a * 0.8 + j * 0.5) * 3.6 * spread,
          )
        })
        ps.step(Math.min(dt, 1 / 30) * (0.15 + u.speed.value * 0.35))
      },
      dispose: () => ps.dispose(),
    }
  },
}
