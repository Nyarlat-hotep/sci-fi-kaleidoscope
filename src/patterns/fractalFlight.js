import * as THREE from 'three/webgpu'
import {
  Fn, Loop, If, Break, uniform, float, vec2, vec3, screenUV, normalize, abs, max, min,
  mod, length, exp, dot, sin, smoothstep, clamp, rotate, fract,
} from 'three/tsl'

// Fractal Flight — a ray-marched infinite Menger lattice. The camera glides
// down the central shaft of the sponge while the structure slowly twists.
// Folded by the engine into the kaleidoscope, which turns the vanishing
// point into the mandala center.

const ITERS = 4
// The lattice is drawn at 2× size: bigger features drift past more calmly
// and alias (shimmer) far less than fine ones.
const ZOOM = 0.5
// Half-width of the central flight shaft in sponge units (the sponge's own
// hole is 0.33; a full cell is 1.0).
const APERTURE = 0.6

export default {
  id: 'fractal-flight',
  label: 'Fractal',
  fold: true,
  lowRes: true,
  bloom: { strength: 0.9, radius: 0.5, threshold: 0.18 },

  create({ u, palette, tier }) {
    const camZ  = uniform(0)
    const look  = uniform(new THREE.Vector2())
    const morph = uniform(0)

    // Menger sponge distance estimate (tiles infinitely by construction).
    const sceneDE = Fn(([pIn]) => {
      const p = pIn.mul(ZOOM).toVar()
      // Gentle helical twist along the flight axis.
      p.xy.assign(rotate(p.xy, p.z.mul(0.08).add(morph.mul(0.3))))
      const d = float(-10).toVar()
      const s = float(1).toVar()
      Loop(ITERS, () => {
        const a = mod(p.mul(s), 2).sub(1)
        s.mulAssign(3)
        const r = abs(float(1).sub(abs(a).mul(3)))
        const da = max(r.x, r.y)
        const db = max(r.y, r.z)
        const dc = max(r.z, r.x)
        const c = min(da, min(db, dc)).sub(1).div(s)
        d.assign(max(d, c))
      })
      // Carve a wider square shaft along the flight path. The sponge's own
      // central hole is 1/3 of a cell; this opens the main aperture up.
      d.assign(max(d, float(APERTURE).sub(max(abs(p.x), abs(p.y)))))
      return d.div(ZOOM)
    })

    // Orbit-trap style value used for surface coloring.
    const trapAt = Fn(([pIn]) => {
      const p = pIn.mul(ZOOM).toVar()
      p.xy.assign(rotate(p.xy, p.z.mul(0.08).add(morph.mul(0.3))))
      const trap = float(10).toVar()
      const s = float(1).toVar()
      Loop(ITERS, () => {
        const a = mod(p.mul(s), 2).sub(1)
        s.mulAssign(3)
        trap.assign(min(trap, length(a).mul(0.6).add(abs(a.z).mul(0.4))))
      })
      return trap
    })

    const color = Fn(() => {
      const uvp = screenUV.sub(0.5).mul(vec2(u.aspect, 1))
      const ro  = vec3(0, 0, camZ.negate())
      const rd  = normalize(vec3(uvp.add(look), -1.15))

      const t     = float(0.05).toVar()
      const glow  = float(0).toVar()
      const steps = float(0).toVar()
      const hit   = float(0).toVar()

      Loop(tier.steps, () => {
        const d = sceneDE(ro.add(rd.mul(t)))
        glow.addAssign(float(0.02).div(float(1).add(d.mul(d).mul(900))))
        If(d.lessThan(t.mul(0.0015)), () => { hit.assign(1); Break() })
        t.addAssign(d.mul(0.85))
        steps.addAssign(1)
        If(t.greaterThan(14), () => { Break() })
      })

      const p   = ro.add(rd.mul(t))
      const eps = t.mul(0.0015).max(0.0008)
      const k   = vec2(1, -1)
      const n   = normalize(
        k.xyy.mul(sceneDE(p.add(k.xyy.mul(eps)))).add(
        k.yyx.mul(sceneDE(p.add(k.yyx.mul(eps))))).add(
        k.yxy.mul(sceneDE(p.add(k.yxy.mul(eps))))).add(
        k.xxx.mul(sceneDE(p.add(k.xxx.mul(eps))))),
      )

      const ao   = float(1).sub(steps.div(tier.steps))
      const diff = clamp(dot(n, rd.negate()), 0, 1)
      const fog  = exp(t.mul(-0.09))
      const trap = trapAt(p)

      // Light pulses racing down the shaft toward the viewer.
      const pulse = smoothstep(0.7, 1, sin(p.z.mul(0.8).add(u.animTime.mul(0.6))).mul(0.5).add(0.5))

      const base = palette(clamp(trap.mul(1.3).add(0.15), 0, 1))
        .mul(diff.mul(1.0).add(0.2)).mul(ao).mul(1.25)
      const edge = palette(float(0.92)).mul(pulse.mul(smoothstep(0.35, 0.05, trap)).mul(0.45))
      const surf = base.add(edge).mul(fog).mul(hit)
      const halo = palette(fract(camZ.mul(0.02)).mul(0.3).add(0.6)).mul(glow.mul(0.18))
      return surf.add(halo)
    })

    const material = new THREE.MeshBasicNodeMaterial()
    material.colorNode = color()
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    mesh.frustumCulled = false

    const scene  = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    scene.add(mesh)

    const lookTarget = new THREE.Vector2()

    return {
      scene,
      camera,
      update(dt, { pointerNDC }) {
        const travel = 0.03 + u.speed.value * 0.06 + u.zoomScroll.value * 0.3
        camZ.value  += dt * travel
        morph.value  = Math.sin(u.animTime.value * 0.05) * 0.5 + 0.5
        const f = u.pointerForce.value
        lookTarget.set(pointerNDC.x * 0.35 * f, pointerNDC.y * 0.25 * f)
        look.value.lerp(lookTarget, Math.min(1, dt * 2))
      },
      dispose() {
        mesh.geometry.dispose()
        material.dispose()
      },
    }
  },
}
