import * as THREE from 'three/webgpu'
import { Fn, float, vec3, sin, cos, dot, abs, exp, fract, max } from 'three/tsl'
import { buildRaymarch } from './lib/raymarch'

// Plasma — flying through a glowing gyroid: a triply-periodic surface that
// never touches itself. Instead of hitting a hard surface the ray gathers
// light as it passes close to the shell, which reads as luminous plasma.

export default {
  id: 'plasma',
  label: 'Plasma',
  fold: true,
  lowRes: true,
  bloom: { strength: 0.7, radius: 0.6, threshold: 0.25 },

  create(ctx) {
    const { u, palette } = ctx

    const field = Fn(([p]) => {
      const sc = float(1.4)
      const q  = p.mul(sc).add(vec3(0, 0, u.animTime.mul(0.4)))
      const g  = dot(sin(q), cos(q.zxy)).add(sin(q.x.mul(0.5).add(u.animTime.mul(0.3))).mul(0.3))
      return g.div(sc)
    })

    const de = Fn(([p]) => max(abs(field(p)).sub(0.04), 0.0))

    const accumulate = (p, d, t) => {
      const hue = fract(p.z.mul(0.05).add(p.x.mul(0.04)).add(u.animTime.mul(0.03)))
      const w   = float(0.0019).div(float(0.03).add(d)).mul(exp(t.mul(-0.17)))
      return palette(hue.mul(0.6).add(0.35)).mul(w)
    }

    const shade = ({ acc }) => vec3(1).sub(exp(acc.mul(-0.8))).mul(1.1)

    const rm = buildRaymarch(ctx, {
      de, shade, accumulate, maxDist: 14, stepScale: 0.6, hitEps: 0, minStep: 0.05, stepMul: 0.9,
    })
    const pos = new THREE.Vector3()
    const tgt = new THREE.Vector3()
    let travel = 0

    return {
      scene: rm.scene,
      camera: rm.camera,
      update(dt, { pointerNDC }) {
        travel += dt * (0.25 + u.speed.value * 0.6 + u.zoomScroll.value * 1.8)
        const t = u.time.value
        pos.set(Math.sin(t * 0.13) * 0.4, Math.cos(t * 0.1) * 0.4, -travel)
        tgt.set(0, 0, pos.z - 3)
        rm.setCamera(pos, tgt, t * 0.03)
        rm.updateLook(dt, pointerNDC)
      },
      dispose: rm.dispose,
    }
  },
}
