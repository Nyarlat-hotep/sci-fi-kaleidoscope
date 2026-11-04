import * as THREE from 'three/webgpu'
import {
  float, vec4, abs, max, smoothstep, attribute, positionWorld, normalLocal, uv, fract, min,
} from 'three/tsl'
import { createStage } from './lib/stage'
import { disposeTree } from './lib/materials'

// Hex Mesh — a field of hexagonal columns rising and falling in interfering
// waves, with neon-traced edges. Moving the pointer over the field raises a
// swell beneath it.

const RINGS = 15

export default {
  id: 'hex-mesh',
  label: 'Hex Mesh',
  wire: true,
  fold: false,
  bloom: { strength: 0.7, radius: 0.4, threshold: 0.3 },

  create(ctx) {
    const { u, palette } = ctx
    const stage = createStage(ctx, { radius: 17, elev: 0.75, orbitSpeed: 0.025, useRot: true, target: new THREE.Vector3(0, 0.5, 0) })

    // Axial hex grid of cell centers.
    const cells = []
    for (let q = -RINGS; q <= RINGS; q++) {
      for (let r = Math.max(-RINGS, -q - RINGS); r <= Math.min(RINGS, -q + RINGS); r++) {
        cells.push([(q + r / 2) * 0.92, r * 0.92 * 0.866])
      }
    }

    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1)
    geo.translate(0, 0.5, 0)
    const mat = new THREE.MeshBasicNodeMaterial()
    // Raw geometry position: positionLocal already includes the per-column
    // instance offset/scale, which would break the edge maths below.
    const pl = attribute('position', 'vec3')
    // Edge glow: hex distance on the cap, cylinder seams on the sides.
    // Cylinder hexes have corners on ±z, flat sides at x = ±0.433.
    const hexD = max(abs(pl.x), abs(pl.x).mul(0.5).add(abs(pl.z).mul(0.866)))
    const capEdge = smoothstep(0.395, 0.43, hexD).mul(smoothstep(0.5, 0.9, normalLocal.y))
    const seam = fract(uv().x.mul(6))
    const sideEdge = smoothstep(0.045, 0.0, min(seam, float(1).sub(seam)))
      .mul(smoothstep(0.5, 0.1, abs(normalLocal.y)))
    const topBand = smoothstep(0.96, 1.0, pl.y).mul(smoothstep(0.5, 0.1, abs(normalLocal.y)))
    const edge = capEdge.add(sideEdge.mul(0.7)).add(topBand)
    const h = positionWorld.y
    const body = u.pal3.mul(0.5).add(palette(h.mul(0.2)).mul(0.025))
    mat.colorNode = vec4(body.add(palette(h.mul(0.22).add(0.1)).mul(edge.mul(0.85))), 1)

    const mesh = new THREE.InstancedMesh(geo, mat, cells.length)
    mesh.frustumCulled = false
    stage.scene.add(mesh)

    const m4 = new THREE.Matrix4()
    const scale = new THREE.Vector3()
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const ray = new THREE.Ray()
    const hitPt = new THREE.Vector3()
    const ptr = new THREE.Vector3(999, 0, 999)

    return {
      scene: stage.scene,
      camera: stage.camera,
      resize: stage.resize,
      update(dt, { pointerNDC }) {
        stage.update(dt, pointerNDC)
        // Pointer → point on the ground plane.
        ray.origin.copy(stage.camera.position)
        ray.direction.set(pointerNDC.x, pointerNDC.y, 0.5).unproject(stage.camera).sub(stage.camera.position).normalize()
        if (ray.intersectPlane(ground, hitPt)) ptr.lerp(hitPt, Math.min(1, dt * 6))
        const pf = u.pointerForce.value

        const t = u.animTime.value
        const breath = 1 + u.breath.value * 0.8
        cells.forEach(([x, z], i) => {
          const d = Math.hypot(x, z)
          let hgt = 0.25
            + (Math.sin(d * 0.7 - t * 2.2) * 0.5 + 0.5) * 1.6
            + (Math.sin(x * 0.45 + t * 1.3) * Math.cos(z * 0.5 - t) * 0.5 + 0.5) * 0.9
          const pd = Math.hypot(x - ptr.x, z - ptr.z)
          hgt += pf * 3.5 * Math.exp(-pd * pd * 0.12)
          pos.set(x, 0, z)
          scale.set(1, hgt * breath, 1)
          m4.compose(pos, quat, scale)
          mesh.setMatrixAt(i, m4)
        })
        mesh.instanceMatrix.needsUpdate = true
      },
      dispose: () => disposeTree(stage.scene),
    }
  },
}
