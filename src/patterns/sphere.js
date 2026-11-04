import * as THREE from 'three/webgpu'
import { float } from 'three/tsl'
import { createStage } from './lib/stage'
import { glowLines, ghostSurface, polylineGeometry, circle, disposeTree } from './lib/materials'

// Sphere — a holographic wireframe globe: latitude and longitude lines, an
// inner counter-rotating geodesic shell, and three tilted orbit rings with
// satellites racing around them. Shown unfolded in full 3D.

export default {
  id: 'sphere',
  label: 'Sphere',
  wire: true,
  fold: false,
  bloom: { strength: 0.9, radius: 0.45, threshold: 0.05 },

  create(ctx) {
    const { u, palette } = ctx
    const stage = createStage(ctx, { radius: 7.5, elev: 0.3, orbitSpeed: 0.03, useRot: true })
    const R = 2

    const lines = []
    for (let i = 1; i < 12; i++) {
      const lat = -Math.PI / 2 + (i / 12) * Math.PI
      lines.push(circle(Math.cos(lat) * R, 128, Math.sin(lat) * R))
    }
    for (let i = 0; i < 24; i++) {
      const lon = (i / 24) * Math.PI * 2
      const meridian = []
      for (let j = 0; j <= 64; j++) {
        const lat = -Math.PI / 2 + (j / 64) * Math.PI
        meridian.push([Math.cos(lat) * Math.cos(lon) * R, Math.sin(lat) * R, Math.cos(lat) * Math.sin(lon) * R])
      }
      lines.push(meridian)
    }
    const globe = new THREE.LineSegments(polylineGeometry(lines), glowLines(palette, 0.15, { intensity: 1.1 }))
    const shellGeo = new THREE.SphereGeometry(R * 0.99, 48, 32)
    const shell = new THREE.Mesh(shellGeo, ghostSurface(palette, 0.1, { intensity: 0.6, base: 0.02 }))

    const inner = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(R * 0.55, 1)),
      glowLines(palette, 0.6, { intensity: 1.6 }),
    )
    const coreMat = new THREE.MeshBasicNodeMaterial()
    coreMat.colorNode = palette(float(0.85)).mul(1.4)
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), coreMat)

    const orbits = [0.4, 1.3, 2.2].map((tilt, k) => {
      const g = new THREE.Group()
      g.rotation.set(tilt, k * 1.1, 0)
      const ring = new THREE.LineSegments(polylineGeometry([circle(R * (1.3 + k * 0.18), 160)]),
        glowLines(palette, 0.4 + k * 0.25, { intensity: 1.2 }))
      const satMat = new THREE.MeshBasicNodeMaterial()
      satMat.colorNode = palette(float(0.9 - k * 0.2)).mul(2)
      const sat = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), satMat)
      g.add(ring, sat)
      stage.scene.add(g)
      return { sat, r: R * (1.3 + k * 0.18), speed: 0.6 + k * 0.35 }
    })

    const globeGroup = new THREE.Group()
    globeGroup.add(globe, shell)
    stage.scene.add(globeGroup, inner, core)

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      update(dt, { pointerNDC }) {
        const t = u.animTime.value
        globeGroup.rotation.y = t * 0.25
        inner.rotation.set(t * 0.2, -t * 0.35, 0)
        orbits.forEach(({ sat, r, speed }) => sat.position.set(Math.cos(t * speed) * r, 0, Math.sin(t * speed) * r))
        stage.update(dt, pointerNDC)
      },
      dispose: () => disposeTree(stage.scene),
    }
  },
}
