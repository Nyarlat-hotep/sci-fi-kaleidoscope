import * as THREE from 'three/webgpu'
import {
  float, vec2, vec3, vec4, uniform, abs, smoothstep, exp, mx_fractal_noise_float, positionLocal,
  positionView, uv, length, step, fract, mix,
} from 'three/tsl'
import { disposeTree } from './lib/materials'

// Wire Grid — synthwave flyover: a wireframe valley scrolls toward you between
// rising noise mountains, under a striped sun on the horizon.

export default {
  id: 'wire-grid',
  label: 'Wire Grid',
  wire: true,
  fold: false,
  bloom: { strength: 0.9, radius: 0.5, threshold: 0.05 },

  create(ctx) {
    const { u, palette, tier } = ctx
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 200)

    const segs = { low: 70, mid: 100, high: 140 }[tier.name]
    const size = 80
    const geo = new THREE.PlaneGeometry(size, size, segs, segs)
    geo.rotateX(-Math.PI / 2)

    const scroll = uniform(0)
    const height = (x, z) => {
      const n = mx_fractal_noise_float(vec2(x.mul(0.09), z.sub(scroll).mul(0.09)), 3, 2, 0.5)
      const valley = smoothstep(2.5, 14, abs(x))
      return n.mul(0.5).add(0.5).mul(valley.mul(9).add(0.35))
    }
    const mat = new THREE.MeshBasicNodeMaterial({ wireframe: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const pl = positionLocal
    const hgt = height(pl.x, pl.z)
    mat.positionNode = vec3(pl.x, hgt, pl.z)
    const depth = positionView.z.negate()
    mat.colorNode = vec4(
      palette(hgt.mul(0.09).add(0.05)).mul(exp(depth.mul(-0.035)).mul(1.5)),
      1,
    )
    const ground = new THREE.Mesh(geo, mat)
    ground.position.z = -size / 2 + 8
    scene.add(ground)

    // Striped horizon sun.
    const sunMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    const suv = uv().sub(0.5)
    const disc = smoothstep(0.5, 0.48, length(suv))
    const band = step(0.35, fract(suv.y.mul(14).add(scroll.mul(0.05)))).max(step(0.05, suv.y))
    const sunCol = mix(palette(float(0.9)), palette(float(0.3)), suv.y.add(0.5))
    sunMat.colorNode = vec4(sunCol.mul(disc.mul(band)).mul(1.4).add(sunCol.mul(smoothstep(0.7, 0.3, length(suv)).mul(0.12))), 1)
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), sunMat)
    sun.position.set(0, 9, -75)
    scene.add(sun)

    const tilt = new THREE.Vector2()
    const tmp = new THREE.Vector2()

    return {
      scene,
      camera,
      resize(w, h) {
        camera.aspect = w / h
        camera.fov = w < h ? 85 : 62
        camera.updateProjectionMatrix()
      },
      update(dt, { pointerNDC }) {
        scroll.value += dt * (2 + u.speed.value * 6 + u.zoomScroll.value * 14)
        const f = u.pointerForce.value
        tilt.lerp(tmp.set(pointerNDC.x * f, pointerNDC.y * f), Math.min(1, dt * 1.5))
        const bob = Math.sin(u.time.value * 0.4) * 0.2
        camera.position.set(tilt.x * 2.5, 2.2 + bob + tilt.y * 1.2 - u.breath.value * 0.6, 8)
        camera.lookAt(tilt.x * 4, 2.5 + tilt.y * 2, -40)
        // Spin rolls the horizon.
        camera.rotateZ(Math.sin(u.time.value * 0.1) * 0.03 + u.rot.value)
      },
      dispose: () => disposeTree(scene),
    }
  },
}
