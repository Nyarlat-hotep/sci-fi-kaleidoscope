import * as THREE from 'three/webgpu'
import {
  hash, float, vec3, vec4, If, length, normalize, dot, clamp, pow, cos, sin, sqrt, select, abs,
  smoothstep, positionLocal, TWO_PI,
} from 'three/tsl'
import { createStage } from './lib/stage'
import { buildParticles, pointerVortex } from './lib/particles'
import { curlNoise } from './lib/sdf'
import { disposeTree } from './lib/materials'

// Singularity — a black hole feeding on an accretion disk. Disk particles
// follow real inverse-square orbits (inner ones whip around far faster),
// spiral slowly inward and vanish over the event horizon, while twin jets
// blast out of the poles. The side of the disk swinging toward you glows
// brighter (Doppler beaming), and a photon ring hugs the horizon.

const G = 4            // gravity strength
const HORIZON = 0.9    // event-horizon radius
const DISK_IN = 1.4
const DISK_OUT = 6.0
const JET_SHARE = 0.1 // fraction of particles in the polar jets

export default {
  id: 'singularity',
  label: 'Singularity',
  fold: false,
  bloom: { strength: 0.9, radius: 0.55, threshold: 0.05 },

  create(ctx) {
    const { u, palette } = ctx
    const stage = createStage(ctx, { radius: 9, elev: 0.2, orbitSpeed: 0.015, useRot: true })

    // Circular-orbit spawn on the disk at radius r, angle a.
    const diskSpawn = (r, a, h) => ({
      pos: vec3(cos(a).mul(r), h.sub(0.5).mul(0.06).mul(r), sin(a).mul(r)),
      vel: vec3(sin(a).negate(), 0, cos(a)).mul(sqrt(float(G).div(r))),
    })
    const jetSpawn = (h1, h2, h3) => {
      const up = select(h1.lessThan(0.5), float(1), float(-1))
      const a = h2.mul(TWO_PI)
      const spread = h3.mul(0.35)
      return {
        pos: vec3(cos(a).mul(0.3), up.mul(HORIZON + 0.15), sin(a).mul(0.3)),
        vel: vec3(cos(a).mul(spread), up.mul(float(3.2).add(h3)), sin(a).mul(spread)),
      }
    }

    const ps = buildParticles(ctx, {
      extras: { kind: 'float' },
      init: ({ i, pos, vel, ex }) => {
        const h1 = hash(i)
        const h2 = hash(i.add(1))
        const h3 = hash(i.add(2))
        const isJet = hash(i.add(9)).lessThan(JET_SHARE)
        ex.kind.assign(select(isJet, float(1), float(0)))
        const r = float(DISK_IN).add(pow(h1, 0.85).mul(DISK_OUT - DISK_IN))
        const d = diskSpawn(r, h2.mul(TWO_PI), h3)
        // Jets start part-way along so they don't all launch at once.
        const j = jetSpawn(h1, h2, h3)
        pos.assign(select(isJet, j.pos.add(j.vel.mul(hash(i.add(4)).mul(2.2))), d.pos))
        vel.assign(select(isJet, j.vel, d.vel))
      },
      step: ({ i, p, v, dt, ex }) => {
        const r = length(p)
        If(ex.kind.lessThan(0.5), () => {
          // Disk: inverse-square gravity, thin-disk restoring force, a little
          // drag so orbits decay inward, and turbulence for streaky texture.
          const grav = p.mul(float(-G).div(r.mul(r).mul(r)))
          const flat = vec3(0, p.y.mul(-3), 0)
          const turb = curlNoise(p.mul(0.7).add(vec3(0, u.animTime.mul(0.05), 0))).mul(0.25)
          const push = pointerVortex(u, p, stage.camDir, { swirl: 2, push: 3, reach: 0.8 })
          v.addAssign(grav.add(flat).add(turb).add(push).mul(dt))
          v.mulAssign(float(1).sub(dt.mul(0.06)))
          p.addAssign(v.mul(dt))
          If(length(p).lessThan(HORIZON).or(length(p).greaterThan(DISK_OUT * 1.6)), () => {
            const h = hash(i.add(u.time.mul(60).toUint()))
            const d = diskSpawn(float(DISK_OUT).sub(h.mul(1.2)), hash(i.add(3)).mul(TWO_PI).add(h.mul(6)), h)
            p.assign(d.pos)
            v.assign(d.vel)
          })
        }).Else(() => {
          // Jets: fly straight out along the poles, slowly widening.
          v.addAssign(vec3(p.x, 0, p.z).mul(dt.mul(0.4)))
          p.addAssign(v.mul(dt))
          If(abs(p.y).greaterThan(9), () => {
            const s = i.add(u.time.mul(60).toUint())
            const j = jetSpawn(hash(s), hash(s.add(1)), hash(s.add(2)))
            p.assign(j.pos)
            v.assign(j.vel)
          })
        })
      },
      color: ({ pos, vel, ex }) => {
        const r = length(pos.xz)
        const heat = clamp(float(1).sub(r.sub(DISK_IN).div(DISK_OUT - DISK_IN)), 0, 1)
        // Doppler beaming: material moving toward the camera is brighter.
        const toward = dot(normalize(vel), stage.camDir.negate())
        const beam = clamp(toward.mul(0.7).add(1), 0.3, 1.8)
        const disk = palette(float(1).sub(heat).mul(0.75)).mul(heat.mul(heat).mul(2.2).add(0.4)).mul(beam)
        const jet = palette(float(0.5)).mul(float(1).sub(abs(pos.y).div(9)).mul(0.8))
        return select(ex.kind.lessThan(0.5), disk, jet)
      },
      size: 0.02,
      opacity: 0.3,
    })

    const holder = new THREE.Group()
    holder.rotation.z = 0.12
    holder.add(ps.object)

    // Event horizon: an opaque black sphere that hides the disk behind it.
    const horizonMat = new THREE.MeshBasicNodeMaterial()
    horizonMat.colorNode = vec3(0)
    holder.add(new THREE.Mesh(new THREE.SphereGeometry(HORIZON, 48, 32), horizonMat))

    // Photon ring: a thin glowing halo, always facing the camera.
    const ringMat = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const rr = length(positionLocal.xy)
    const glow = smoothstep(HORIZON * 1.22, HORIZON * 1.06, rr).mul(smoothstep(HORIZON * 0.98, HORIZON * 1.06, rr))
    ringMat.colorNode = vec4(palette(float(0.1)).mul(glow.mul(1.4)), 1)
    const ring = new THREE.Mesh(new THREE.RingGeometry(HORIZON * 0.95, HORIZON * 1.4, 128), ringMat)
    stage.scene.add(holder, ring)

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      init: ps.init,
      update(dt, { pointerNDC }) {
        stage.update(dt, pointerNDC)
        ring.quaternion.copy(stage.camera.quaternion)
        holder.scale.setScalar(1 - u.breath.value * 0.15)
        ring.scale.copy(holder.scale)
        ps.step(Math.min(dt, 1 / 30) * (0.12 + u.speed.value * 0.3))
      },
      dispose: () => disposeTree(stage.scene),
    }
  },
}
