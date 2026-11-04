import * as THREE from 'three/webgpu'
import { Fn, float, vec3, min, length, atan, floor, cos, sin, rotate, abs, dot, pow, clamp, exp } from 'three/tsl'
import { buildRaymarch, litSurface } from './lib/raymarch'
import { sdCrystal } from './lib/sdf'

// Crystals — a slowly turning geode cluster: one tall central spire ringed
// by two tiers of tilted shards. Faceted shading with hot rim light and a
// soft glow halo between the crystals.

const TAU = Math.PI * 2

// Polar repetition around y: folds p into one of `n` sectors.
const polar = (p, n, offset = 0) => {
  const sector = TAU / n
  const a  = atan(p.z, p.x).add(offset)
  const ai = a.sub(floor(a.div(sector).add(0.5)).mul(sector))
  const r  = length(p.xz)
  return vec3(cos(ai).mul(r), p.y, sin(ai).mul(r))
}

export default {
  id: 'crystals',
  label: 'Crystals',
  fold: true,
  lowRes: true,
  bloom: { strength: 1.0, radius: 0.5, threshold: 0.2 },

  create(ctx) {
    const { u, palette } = ctx

    const de = Fn(([pIn]) => {
      const p = pIn.toVar()
      p.xz.assign(rotate(p.xz, u.animTime.mul(0.12)))
      const grow = float(1).add(u.breath.mul(0.15))
      const core = sdCrystal(p.sub(vec3(0, 0.2, 0)), float(2.6), float(0.55).mul(grow))

      const a = polar(p, 6).sub(vec3(1.05, -0.35, 0)).toVar()
      a.xy.assign(rotate(a.xy, -0.65))
      const ring1 = sdCrystal(a, float(2.0), float(0.34).mul(grow))

      const b = polar(p, 7, TAU / 14).sub(vec3(1.7, -0.95, 0)).toVar()
      b.xy.assign(rotate(b.xy, -1.05))
      const ring2 = sdCrystal(b, float(1.7), float(0.24).mul(grow))

      const ground = p.y.add(1.25).add(length(p.xz).mul(0.08))
      return min(min(core, ring1), min(ring2, ground))
    })

    const shade = (info) => {
      const { p, n, rd, t, hit } = info
      const facet = n.y.mul(0.5).add(0.5)
      const ground = clamp(p.y.add(1.2).mul(-6), 0, 1)
      const base = palette(facet.mul(0.45).add(0.35)).mul(float(1).sub(ground.mul(0.9)))
      const lit  = litSurface(info, base, { fog: 0.12, rim: 1.3, spec: 0.8, rimColor: palette(float(0.95)) })
      // Fake internal glow: brighter where the view grazes the facet.
      const inner = pow(float(1).sub(abs(dot(n, rd))), 1.5).mul(palette(float(0.75))).mul(0.4)
        .mul(hit).mul(float(1).sub(ground)).mul(exp(t.mul(-0.12)))
      return lit.add(inner).add(info.acc)
    }

    const accumulate = (p, d) =>
      palette(float(0.7)).mul(float(0.006).div(float(1).add(d.mul(d).mul(80))))

    const rm = buildRaymarch(ctx, { de, shade, accumulate, maxDist: 16, stepScale: 0.8 })
    const pos = new THREE.Vector3()
    const tgt = new THREE.Vector3(0, 0, 0)

    return {
      scene: rm.scene,
      camera: rm.camera,
      update(dt, { pointerNDC }) {
        const t = u.time.value
        const r = 5.6 - u.zoomScroll.value * 1.4 * (Math.sin(t * 0.3) * 0.5 + 0.5)
        // High, near top-down view: the cluster reads as a radial star.
        const el = 1.1 + Math.sin(t * 0.09) * 0.12
        pos.set(Math.sin(t * 0.05) * Math.cos(el) * r, Math.sin(el) * r, Math.cos(t * 0.05) * Math.cos(el) * r)
        rm.setCamera(pos, tgt)
        rm.updateLook(dt, pointerNDC, 0.25)
      },
      dispose: rm.dispose,
    }
  },
}
