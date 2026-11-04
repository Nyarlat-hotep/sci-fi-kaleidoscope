import * as THREE from 'three/webgpu'
import {
  Fn, float, vec2, vec3, min, length, atan, floor, sin, cos, mod, abs, smoothstep, exp,
} from 'three/tsl'
import { buildRaymarch, litSurface } from './lib/raymarch'

// Tunnel — a winding ribbed corridor. Torus ribs every 1.5 units, six rails
// along the walls and light pulses sweeping past. Clicking the Tunnel button
// again reverses the direction of travel.

const TAU = Math.PI * 2
const pathX = (z) => Math.sin(z * 0.15) * 1.2
const pathY = (z) => Math.cos(z * 0.11) * 0.8

export default {
  id: 'tunnel',
  label: 'Tunnel',
  fold: true,
  lowRes: true,
  bloom: { strength: 0.9, radius: 0.45, threshold: 0.2 },

  create(ctx) {
    const { u, palette } = ctx
    const dirU = { value: 1 }

    const local = Fn(([p]) => vec3(
      p.x.sub(sin(p.z.mul(0.15)).mul(1.2)),
      p.y.sub(cos(p.z.mul(0.11)).mul(0.8)),
      p.z,
    ))

    const de = Fn(([pIn]) => {
      const p  = local(pIn)
      const r  = length(p.xy)
      const wall = float(1.3).sub(r)
      const zr = mod(p.z, 1.5).sub(0.75)
      const rib = length(vec2(r.sub(1.24), zr)).sub(0.07)
      const sector = TAU / 6
      const a  = atan(p.y, p.x)
      const ai = a.sub(floor(a.div(sector).add(0.5)).mul(sector))
      const rail = length(vec2(r.sub(1.2), r.mul(sin(ai)))).sub(0.045)
      return min(wall, min(rib, rail))
    })

    const shade = (info) => {
      const { t, hit } = info
      const p = local(info.p)
      const r = length(p.xy)
      const a = atan(p.y, p.x)
      const panel = smoothstep(0.42, 0.5, abs(mod(a.mul(6 / TAU).add(0.5), 1).sub(0.5)))
      const isWall = smoothstep(1.22, 1.29, r)
      const base = palette(float(0.25).add(panel.mul(0.15))).mul(0.35)
        .add(palette(float(0.6)).mul(float(1).sub(isWall)))
      const lit  = litSurface(info, base, { fog: 0.12, rim: 0.5 })
      const pulse = smoothstep(0.9, 1, sin(p.z.mul(1.2).add(u.animTime.mul(5))).mul(0.5).add(0.5))
      const glow = palette(float(0.95)).mul(pulse.mul(float(1).sub(isWall)).mul(2)).mul(exp(t.mul(-0.12))).mul(hit)
      return lit.add(glow)
    }

    const rm = buildRaymarch(ctx, { de, shade, maxDist: 24, stepScale: 0.85, fov: 1.0 })
    const pos = new THREE.Vector3()
    const tgt = new THREE.Vector3()
    let z = 0

    return {
      scene: rm.scene,
      camera: rm.camera,
      update(dt, { pointerNDC, params }) {
        dirU.value += ((params.tunnelDir ?? 1) - dirU.value) * Math.min(1, dt * 2)
        z -= dt * (0.6 + u.speed.value * 1.2 + u.zoomScroll.value * 3) * dirU.value
        pos.set(pathX(z), pathY(z), z)
        tgt.set(pathX(z - 2), pathY(z - 2), z - 2)
        rm.setCamera(pos, tgt)
        rm.updateLook(dt, pointerNDC)
      },
      dispose: rm.dispose,
    }
  },
}
