import * as THREE from 'three/webgpu'
import { vec4, exp, positionView, sin, positionWorld } from 'three/tsl'
import { createStage } from './lib/stage'
import { polylineGeometry, glowLines, disposeTree } from './lib/materials'

// Wire Box — a neon Tron corridor: rectangular frames stream past the camera
// with a slow corkscrew twist, joined by corner rails, while a wire cube
// tumbles at the vanishing point.

const FRAMES = 34
const GAP = 1.2

export default {
  id: 'wire-box',
  label: 'Wire Box',
  wire: true,
  fold: true,
  bloom: { strength: 0.9, radius: 0.4, threshold: 0.05 },

  create(ctx) {
    const { u, palette } = ctx
    const stage = createStage(ctx, { fov: 70, radius: 0.001, elev: 0, orbitSpeed: 0, tilt: 0 })
    stage.camera.position.set(0, 0, 3)

    const w = 2.2
    const h = 1.5
    const rect = [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0], [-w, -h, 0]]
    // Inner cross-braces at each corner for a little more structure.
    const brace = [[[-w, -h, 0], [-w + 0.4, -h + 0.4, 0]], [[w, -h, 0], [w - 0.4, -h + 0.4, 0]],
      [[w, h, 0], [w - 0.4, h - 0.4, 0]], [[-w, h, 0], [-w + 0.4, h - 0.4, 0]]]
    const frameGeo = polylineGeometry([rect, ...brace])

    // One shared material; depth fade and a traveling pulse come from view-space z.
    const frameMat = new THREE.LineBasicNodeMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const depth = positionView.z.negate()
    const pulse = sin(positionWorld.z.mul(0.9).add(u.animTime.mul(4))).mul(0.5).add(0.5)
    frameMat.colorNode = vec4(
      palette(depth.mul(0.03).add(0.1)).mul(exp(depth.mul(-0.04)).mul(pulse.mul(1.6).add(1.0))),
      1,
    )

    const frames = []
    for (let i = 0; i < FRAMES; i++) {
      const f = new THREE.LineSegments(frameGeo, frameMat)
      f.position.z = -i * GAP
      stage.scene.add(f)
      frames.push(f)
    }

    const railGeo = polylineGeometry([
      [[-w, -h, 4], [-w, -h, -FRAMES * GAP]], [[w, -h, 4], [w, -h, -FRAMES * GAP]],
      [[w, h, 4], [w, h, -FRAMES * GAP]], [[-w, h, 4], [-w, h, -FRAMES * GAP]],
    ])
    const rails = new THREE.LineSegments(railGeo, frameMat)
    stage.scene.add(rails)

    const cube = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, 0.9, 0.9)),
      glowLines(palette, 0.9, { intensity: 2.2 }),
    )
    cube.position.z = -14
    stage.scene.add(cube)

    let travel = 0

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      update(dt, { pointerNDC }) {
        travel += dt * (0.8 + u.speed.value * 2 + u.zoomScroll.value * 6)
        // Twist is anchored to each frame's place in the corridor, so frames
        // keep their angle as they recycle.
        const twist = 0.05 + Math.sin(u.time.value * 0.1) * 0.04
        frames.forEach((f, i) => {
          const z = -i * GAP + (travel % GAP)
          f.position.z = z
          f.rotation.z = (z - travel) * twist
        })
        cube.rotation.set(u.animTime.value * 0.7, u.animTime.value * 0.5, 0)
        cube.scale.setScalar(1 + u.breath.value * 0.6)
        const f = u.pointerForce.value
        stage.camera.position.set(pointerNDC.x * 0.5 * f, pointerNDC.y * 0.35 * f, 3)
        stage.camera.lookAt(0, 0, -10)
      },
      dispose: () => disposeTree(stage.scene),
    }
  },
}
