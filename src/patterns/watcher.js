import * as THREE from 'three/webgpu'
import {
  float, vec3, uniform, sin, cos, atan, length, smoothstep, mix, pow, abs, clamp,
  positionLocal, mx_noise_float,
} from 'three/tsl'
import { createStage } from './lib/stage'
import { fresnel, disposeTree } from './lib/materials'

// Watcher — a single great eye hanging in the void, ringed by slowly writhing
// tentacles. The eye tracks your cursor or finger; its pupil dilates as you
// breathe in. Folded, it becomes a mandala of watching eyes.

const TENTACLES = 9

export default {
  id: 'watcher',
  label: 'Watcher',
  fold: true,
  bloom: { strength: 0.8, radius: 0.5, threshold: 0.15 },

  create(ctx) {
    const { u, palette } = ctx
    const stage = createStage(ctx, { radius: 6.5, elev: 0.0, orbitSpeed: 0, tilt: 0.3 })
    const root = new THREE.Group()
    stage.scene.add(root)

    // ── Eye ────────────────────────────────────────────────────────────
    const pupilSize = uniform(0.17)
    const p  = positionLocal
    const front = smoothstep(0.0, 0.25, p.z)
    // Radial distance across the front cap; pushed out of range on the back.
    const rr = length(p.xy).add(float(1).sub(front).mul(2))
    const ang = atan(p.y, p.x)
    const fib = mx_noise_float(vec3(ang.mul(6), rr.mul(9), u.time.mul(0.1)))
    const iris = smoothstep(0.47, 0.44, rr).mul(smoothstep(pupilSize, pupilSize.add(0.02), rr))
    const striae = sin(ang.mul(46).add(fib.mul(5))).mul(0.5).add(0.5).mul(0.6).add(0.4)
    const limbus = smoothstep(0.06, 0.0, abs(rr.sub(0.46)))
    const pupil = smoothstep(pupilSize.add(0.015), pupilSize, rr)
    const veins = smoothstep(0.82, 0.95,
      sin(mx_noise_float(p.mul(3.5)).mul(18)).mul(0.5).add(0.5)).mul(smoothstep(0.5, 0.75, rr))

    const sclera = u.pal3.mul(0.8).add(palette(float(0.1)).mul(0.07)).add(palette(float(0.95)).mul(veins.mul(0.35)))
    const irisCol = palette(rr.mul(1.4).add(fib.mul(0.3))).mul(striae).mul(1.3)
      .add(palette(float(0.5)).mul(pow(clamp(float(0.47).sub(rr).mul(4), 0, 1), 3)))
    const eyeMat = new THREE.MeshBasicNodeMaterial()
    eyeMat.colorNode = mix(mix(sclera, irisCol, iris), vec3(0), pupil)
      .add(palette(float(0.8)).mul(limbus.mul(0.9)))
      .add(palette(float(0.3)).mul(fresnel(3).mul(0.6)))
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), eyeMat)
    root.add(eye)

    // ── Tentacles ──────────────────────────────────────────────────────
    const len = 3.4
    const tGeo = new THREE.CylinderGeometry(0.025, 0.17, len, 14, 72, false)
    tGeo.translate(0, len / 2, 0)
    for (let k = 0; k < TENTACLES; k++) {
      const phase = k * 1.7
      const m = new THREE.MeshBasicNodeMaterial()
      const y = positionLocal.y
      const s = pow(y.div(len), 1.4)
      const wt = u.time.mul(0.9)
      const bend = vec3(
        sin(y.mul(1.9).sub(wt.mul(1.3)).add(phase)).mul(0.55),
        float(0),
        cos(y.mul(1.4).sub(wt).add(phase * 0.7)).mul(0.4),
      ).mul(s)
      m.positionNode = positionLocal.add(bend)
      const sucker = smoothstep(0.55, 0.9, sin(y.mul(22)).mul(0.5).add(0.5))
        .mul(smoothstep(0.0, 0.5, positionLocal.z.negate()))
      m.colorNode = u.pal3.mul(0.9).add(palette(float(0.2 + (k % 3) * 0.2)).mul(fresnel(2).mul(0.9).add(0.06)))
        .add(palette(float(0.85)).mul(sucker.mul(0.5)))
        .add(palette(float(0.95)).mul(pow(y.div(len), 6).mul(1.2)))
      const mesh = new THREE.Mesh(tGeo, m)
      const a = (k / TENTACLES) * Math.PI * 2
      mesh.position.set(Math.cos(a) * 0.7, Math.sin(a) * 0.7, -0.45)
      // Point outward from the eye and sweep back.
      mesh.rotation.z = a - Math.PI / 2
      mesh.rotateX(-0.55)
      root.add(mesh)
    }

    const lookAt = new THREE.Vector3()
    const want = new THREE.Vector3()

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      update(dt, { pointerNDC }) {
        stage.update(dt, pointerNDC)
        const f = u.pointerForce.value
        const t = u.time.value
        // Wander when idle; lock onto the pointer when it moves.
        want.set(
          Math.sin(t * 0.37) * 1.6 * (1 - f) + u.pointerWorld.value.x * f * 1.4,
          Math.sin(t * 0.23 + 1) * 1.0 * (1 - f) + u.pointerWorld.value.y * f * 1.4,
          4,
        )
        lookAt.lerp(want, Math.min(1, dt * 4))
        eye.lookAt(lookAt)
        pupilSize.value = 0.15 + u.breath.value * 0.1 + Math.sin(t * 0.7) * 0.01
        root.rotation.z += dt * 0.03 * (0.5 + u.speed.value)
      },
      dispose: () => disposeTree(stage.scene),
    }
  },
}
