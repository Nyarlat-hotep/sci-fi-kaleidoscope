import * as THREE from 'three/webgpu'
import { Fn, float, vec2, vec3, floor, fract, min, length, sign, sin, smoothstep, exp } from 'three/tsl'
import { buildRaymarch, litSurface } from './lib/raymarch'
import { hash31 } from './lib/sdf'

// Truchet — a 3D Truchet maze: every cube cell holds three quarter-torus
// tubes linking its six face centers, randomly mirrored per cell, so the
// tubes join into endless knotted channels. The camera rides a cell edge,
// which no tube ever crosses.

export default {
  id: 'truchet',
  label: 'Truchet',
  fold: true,
  lowRes: true,
  bloom: { strength: 0.9, radius: 0.45, threshold: 0.2 },

  create(ctx) {
    const { u, palette } = ctx

    const de = Fn(([p]) => {
      const cell = floor(p)
      const h = hash31(cell)
      const flip = sign(vec3(h, fract(h.mul(13.1)), fract(h.mul(71.7))).sub(0.5))
      const q = p.sub(cell).sub(0.5).mul(flip)
      const th = float(0.075).add(u.breath.mul(0.04))
      const d1 = length(vec2(length(q.xy.sub(0.5)).sub(0.5), q.z)).sub(th)
      const d2 = length(vec2(length(q.xz.add(0.5)).sub(0.5), q.y)).sub(th)
      const d3 = length(vec2(length(vec2(q.y.add(0.5), q.z.sub(0.5))).sub(0.5), q.x)).sub(th)
      return min(d1, min(d2, d3))
    })

    const shade = (info) => {
      const { p, t, hit } = info
      const h = hash31(floor(p))
      const base  = palette(h.mul(0.35).add(0.35))
      const lit   = litSurface(info, base, { fog: 0.3, rim: 0.9, rimColor: palette(float(0.9)) })
      const flow  = smoothstep(0.92, 1, sin(p.x.add(p.y).add(p.z).mul(3).sub(u.animTime.mul(4))).mul(0.5).add(0.5))
      const glow  = palette(float(0.97)).mul(flow.mul(1.6)).mul(exp(t.mul(-0.3))).mul(hit)
      return lit.add(glow).add(info.acc)
    }

    const accumulate = (p, d) =>
      palette(float(0.6)).mul(float(0.004).div(float(1).add(d.mul(d).mul(300))))

    const rm = buildRaymarch(ctx, { de, shade, accumulate, maxDist: 12, stepScale: 0.85 })
    const pos = new THREE.Vector3()
    const tgt = new THREE.Vector3()
    let travel = 0

    return {
      scene: rm.scene,
      camera: rm.camera,
      update(dt, { pointerNDC }) {
        travel += dt * (0.3 + u.speed.value * 0.6 + u.zoomScroll.value * 1.8)
        pos.set(0, 0, -travel)
        tgt.set(0, 0, -travel - 1)
        rm.setCamera(pos, tgt, u.time.value * 0.05)
        rm.updateLook(dt, pointerNDC, 0.4)
      },
      dispose: rm.dispose,
    }
  },
}
