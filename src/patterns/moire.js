import * as THREE from 'three/webgpu'
import { createStage } from './lib/stage'
import { glowLines, polylineGeometry, circle, disposeTree } from './lib/materials'

// Moire — three stacks of fine concentric rings, each tilting through 3D on
// its own slow axis. Where their projected ellipses overlap, interference
// bands bloom and slide across the frame.

export default {
  id: 'moire',
  label: 'Moire',
  fold: true,
  bloom: { strength: 0.6, radius: 0.4, threshold: 0.15 },

  create(ctx) {
    const { u, palette } = ctx
    const stage = createStage(ctx, { radius: 6, elev: 0.0, orbitSpeed: 0, tilt: 0.4 })

    const rings = []
    for (let i = 1; i <= 46; i++) rings.push(circle(i * 0.075, 160))
    const geo = polylineGeometry(rings)

    const stacks = [0.0, 0.5, 1.0].map((t, k) => {
      const m = new THREE.LineSegments(geo, glowLines(palette, t, { intensity: 0.9 }))
      const g = new THREE.Group()
      g.add(m)
      g.position.x = [-0.35, 0.35, 0][k]
      g.position.y = [0.2, 0.2, -0.35][k]
      stage.scene.add(g)
      return g
    })

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      update(dt, { pointerNDC }) {
        const t = u.animTime.value
        stacks.forEach((g, k) => {
          g.rotation.x = Math.PI / 2 + Math.sin(t * (0.21 + k * 0.07) + k * 2.1) * 0.75
          g.rotation.z = Math.sin(t * (0.17 + k * 0.05) + k) * 0.6
          g.scale.setScalar(1 + u.breath.value * 0.15)
        })
        stage.update(dt, pointerNDC)
      },
      dispose: () => disposeTree(stage.scene),
    }
  },
}
