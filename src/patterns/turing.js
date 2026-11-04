import * as THREE from 'three/webgpu'
import {
  float, vec3, sin, smoothstep, mix, positionLocal, normalLocal, normalize, mx_noise_float,
  mx_fractal_noise_float, varying,
} from 'three/tsl'
import { createStage } from './lib/stage'
import { fresnel, disposeTree } from './lib/materials'

// Turing — a living coral blob. A labyrinth of reaction-diffusion-style
// stripes (thresholded rings of warped noise) is carved into a sphere as real
// displacement, drifting slowly so the maze reorganises as it turns.

export default {
  id: 'turing',
  label: 'Turing',
  fold: true,
  bloom: { strength: 0.7, radius: 0.45, threshold: 0.2 },

  create(ctx) {
    const { u, palette, tier } = ctx
    const stage = createStage(ctx, { radius: 5.2, elev: 0.3, orbitSpeed: 0.03 })

    const detail = { low: 28, mid: 44, high: 64 }[tier.name]
    const geo = new THREE.IcosahedronGeometry(1.5, detail)

    const n = normalize(positionLocal)
    const t = u.animTime.mul(0.08)
    const warp = mx_noise_float(n.mul(1.6).add(vec3(t, t.mul(0.7), 0))).mul(0.6)
    const field = mx_fractal_noise_float(n.mul(2.2).add(warp).add(vec3(0, t, 0)), 3, 2, 0.5)
    const stripes = sin(field.mul(26).add(u.animTime.mul(0.4))).mul(0.5).add(0.5)
    const ridge = smoothstep(0.35, 0.65, stripes)

    const mat = new THREE.MeshBasicNodeMaterial()
    const lobe = mx_noise_float(n.mul(1.2).add(vec3(t.mul(0.5)))).mul(0.18)
    mat.positionNode = positionLocal.add(normalLocal.mul(
      ridge.mul(float(0.09).mul(u.breath.mul(0.8).add(1))).add(lobe),
    ))
    // Evaluate the noise once per vertex and interpolate, instead of
    // re-running fractal noise for every pixel.
    const fieldV = varying(field)
    const ridgeV = varying(ridge)
    const valley = u.pal3.mul(0.6).add(palette(float(0.15)).mul(0.08))
    const crest  = palette(fieldV.mul(0.8).add(0.5))
    mat.colorNode = mix(valley, crest, ridgeV).mul(fresnel(1.6).mul(1.4).add(0.45))
      .add(palette(float(0.9)).mul(fresnel(4).mul(0.8)))

    const mesh = new THREE.Mesh(geo, mat)
    stage.scene.add(mesh)

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      update(dt, { pointerNDC }) {
        mesh.rotation.y += dt * 0.08 * (0.4 + u.speed.value)
        mesh.rotation.x = Math.sin(u.time.value * 0.05) * 0.4
        stage.update(dt, pointerNDC)
      },
      dispose: () => disposeTree(stage.scene),
    }
  },
}
