import * as THREE from 'three/webgpu'
import {
  uniform, hash, float, vec2, vec3, If, length, normalize, exp, smoothstep, cos, sin, TWO_PI, sqrt,
} from 'three/tsl'
import { buildParticles } from './lib/particles'

// Warp — the jump to hyperspace. Stars stream out of a distant vanishing
// point and rush past the camera; speed (and Zoom Scroll) push you faster.
// The pointer bends space so the star stream curves around it.

const DEPTH = 70

export default {
  id: 'warp',
  label: 'Warp',
  fold: false,
  bloom: { strength: 0.9, radius: 0.55, threshold: 0.05 },

  create(ctx) {
    const { u, palette } = ctx
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200)
    camera.position.set(0, 0, 4)
    const speedU = uniform(1)
    const ptr = uniform(new THREE.Vector2())
    const frameSeed = uniform(0)

    // Stars live in a cylinder around the flight axis, leaving the axis clear.
    const spawn = (h1, h2) => {
      const a = h1.mul(TWO_PI)
      const r = sqrt(h2).mul(9).add(0.6)
      return vec2(cos(a).mul(r), sin(a).mul(r))
    }

    const ps = buildParticles(ctx, {
      countMul: 0.5,
      extras: { seed: 'float' },
      init: ({ i, pos, vel, ex }) => {
        const xy = spawn(hash(i), hash(i.add(1)))
        pos.assign(vec3(xy, hash(i.add(2)).mul(-DEPTH).add(4)))
        vel.assign(vec3(0))
        ex.seed.assign(hash(i.add(3)))
      },
      step: ({ i, p, v, dt, ex }) => {
        const zSpeed = speedU.mul(ex.seed.mul(0.5).add(0.75))
        // Bend: stars near the pointer's line of sight are pushed aside.
        const off = p.xy.sub(ptr.mul(p.z.negate().add(4).mul(0.35)))
        const bend = normalize(off.add(1e-4)).mul(u.pointerForce.mul(exp(length(off).mul(-0.9))).mul(6))
        v.assign(vec3(bend, zSpeed))
        p.addAssign(v.mul(dt))
        If(p.z.greaterThan(4.5), () => {
          const si = i.add(frameSeed.toUint())
          const xy = spawn(hash(si), hash(si.add(7)))
          p.assign(vec3(xy, float(-DEPTH).add(4)))
        })
      },
      color: ({ pos, ex }) => {
        const near = smoothstep(-DEPTH + 4, 4, pos.z)
        return palette(ex.seed).mul(near.mul(1.6).add(0.15)).add(vec3(near.mul(near).mul(0.4)))
      },
      size: 0.05,
      opacity: 0.55,
    })
    scene.add(ps.object)

    const tilt = new THREE.Vector2()
    const tmp = new THREE.Vector2()

    return {
      scene,
      camera,
      init: ps.init,
      resize(w, h) {
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      },
      update(dt, { pointerNDC }) {
        const f = u.pointerForce.value
        tilt.lerp(tmp.set(pointerNDC.x * f, pointerNDC.y * f), Math.min(1, dt * 2))
        ptr.value.set(pointerNDC.x * 5, pointerNDC.y * 3.5)
        camera.position.set(tilt.x * 0.6, tilt.y * 0.4, 4)
        camera.lookAt(tilt.x * 2, tilt.y * 1.5, -20)
        camera.rotateZ(u.rot.value + u.time.value * 0.008)
        // Breathing in eases off the throttle; Zoom Scroll floors it.
        speedU.value = (0.7 + u.speed.value * 3.5 + u.zoomScroll.value * 12) * (1 - u.breath.value * 0.6)
        frameSeed.value = Math.floor(Math.random() * 1e6)
        ps.step(Math.min(dt, 1 / 30))
      },
      dispose: () => ps.dispose(),
    }
  },
}
