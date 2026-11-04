import * as THREE from 'three/webgpu'
import { float, uniform } from 'three/tsl'
import { createStage } from './lib/stage'
import { glowLines, ghostSurface, fresnel, disposeTree } from './lib/materials'

// Geo — nested Platonic solids counter-rotating inside each other: glowing
// edges over translucent shells around a pulsing core. The mirror fold turns
// the overlapping silhouettes into a sacred-geometry mandala.

export default {
  id: 'geo',
  label: 'Geo',
  fold: true,
  bloom: { strength: 0.9, radius: 0.5, threshold: 0.1 },

  create(ctx) {
    const { u, palette } = ctx
    const stage = createStage(ctx, { radius: 6.2, elev: 0.25, orbitSpeed: 0.02 })
    const root = new THREE.Group()
    stage.scene.add(root)

    const solids = [
      { geo: new THREE.IcosahedronGeometry(2.3),  t: 0.85, spin: [0.11, 0.07, 0] },
      { geo: new THREE.DodecahedronGeometry(1.6), t: 0.65, spin: [-0.08, 0.13, 0.05] },
      { geo: new THREE.OctahedronGeometry(1.05),  t: 0.5,  spin: [0.17, -0.1, 0.12] },
      { geo: new THREE.TetrahedronGeometry(0.6),  t: 0.95, spin: [-0.2, 0.25, 0] },
    ]
    const nodes = solids.map(({ geo, t, spin }) => {
      const g = new THREE.Group()
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), glowLines(palette, t, { intensity: 1.6 })))
      g.add(new THREE.Mesh(geo, ghostSurface(palette, t - 0.25, { intensity: 0.5 })))
      root.add(g)
      return { g, spin }
    })

    const coreMat = new THREE.MeshBasicNodeMaterial()
    const beat = uniform(0)
    coreMat.colorNode = palette(float(0.9)).mul(fresnel(1.5).mul(1.5).add(0.6).mul(beat.mul(0.6).add(0.8)))
    root.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16), coreMat))

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      update(dt, { pointerNDC }) {
        const t = u.animTime.value
        nodes.forEach(({ g, spin }) => g.rotation.set(t * spin[0] * 3, t * spin[1] * 3, t * spin[2] * 3))
        root.scale.setScalar(1 + u.breath.value * 0.12)
        beat.value = Math.sin(u.time.value * 2.2) * 0.5 + 0.5
        stage.update(dt, pointerNDC)
      },
      dispose: () => disposeTree(stage.scene),
    }
  },
}
