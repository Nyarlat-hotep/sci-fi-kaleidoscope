import * as THREE from 'three/webgpu'
import { Fn, float, vec3, floor, fract, min, max, abs, length, sin, smoothstep, select, exp } from 'three/tsl'
import { buildRaymarch, litSurface } from './lib/raymarch'
import { sdBox, hash21 } from './lib/sdf'

// Circuits — skimming low over an endless circuit board. Raised traces run
// between cells (randomly in x and/or z so they join into long branching
// buses), chips sit in some cells, and data pulses race along the copper.

export default {
  id: 'circuits',
  label: 'Circuits',
  fold: true,
  lowRes: true,
  bloom: { strength: 0.9, radius: 0.4, threshold: 0.2 },

  create(ctx) {
    const { u, palette } = ctx

    const de = Fn(([p]) => {
      const cell = floor(p.xz)
      const q  = fract(p.xz).sub(0.5)
      const h1 = hash21(cell)
      const h2 = hash21(cell.add(17.31))
      const y  = p.y.sub(0.035)
      const barX = select(h1.lessThan(0.55), sdBox(vec3(q.x, y, q.y), vec3(0.5, 0.035, 0.06)), float(9))
      const barZ = select(h2.lessThan(0.55), sdBox(vec3(q.y, y, q.x), vec3(0.5, 0.035, 0.06)), float(9))
      const chip = select(h1.greaterThan(0.86),
        sdBox(vec3(q.x, p.y.sub(0.08), q.y), vec3(0.24, 0.08, 0.24)).sub(0.01), float(9))
      const via  = length(vec3(q.x, p.y.sub(0.02), q.y)).sub(0.11)
      return min(p.y, min(min(barX, barZ), min(chip, via)))
    })

    const shade = (info) => {
      const { p, t, hit } = info
      const cell = floor(p.xz)
      const q    = fract(p.xz).sub(0.5)
      const h    = hash21(cell)
      const raised = smoothstep(0.012, 0.03, p.y)
      const pulse  = smoothstep(0.88, 1,
        sin(p.x.add(p.z).mul(2.2).sub(u.animTime.mul(5)).add(h.mul(6.283))).mul(0.5).add(0.5))
      const grid   = smoothstep(0.47, 0.5, max(abs(q.x), abs(q.y))).mul(0.25)
      const board  = u.pal3.mul(0.5).add(palette(float(0.45)).mul(grid.mul(0.5).add(0.03)))
      const trace  = palette(h.mul(0.6).add(0.2)).mul(1.3)
      const base   = board.mul(float(1).sub(raised)).add(trace.mul(raised))
      const lit    = litSurface(info, base, { fog: 0.16, rim: 0.3, spec: 0.15 })
      const glow   = palette(float(0.95)).mul(pulse.mul(raised).mul(2.2)).mul(exp(t.mul(-0.16))).mul(hit)
      const horizon = palette(float(0.6)).mul(exp(t.mul(-0.05)).mul(float(1).sub(hit)).mul(0.08))
      return lit.add(glow).add(horizon)
    }

    const rm = buildRaymarch(ctx, { de, shade, maxDist: 24, stepScale: 0.7, fov: 1.1, hitEps: 0.0008 })
    const pos = new THREE.Vector3()
    const tgt = new THREE.Vector3()
    let travel = 0

    return {
      scene: rm.scene,
      camera: rm.camera,
      update(dt, { pointerNDC }) {
        travel += dt * (0.3 + u.speed.value * 0.7 + u.zoomScroll.value * 2)
        const t = u.time.value
        pos.set(Math.sin(t * 0.11) * 0.6, 3.4 + Math.sin(t * 0.17) * 0.3, -travel)
        // Steep, almost top-down view so the whole frame is board.
        tgt.set(pos.x, 0, pos.z - 1.4)
        rm.setCamera(pos, tgt, Math.sin(t * 0.07) * 0.15)
        rm.updateLook(dt, pointerNDC)
      },
      dispose: rm.dispose,
    }
  },
}
