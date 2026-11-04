import * as THREE from 'three/webgpu'
import { uniform } from 'three/tsl'

// Perspective scene + orbiting camera used by mesh and particle patterns.
// Handles portrait framing, pointer tilt, Spin (for unfolded patterns —
// folded ones get their spin from the mirror fold), Zoom Scroll, breath
// dolly, and projecting the pointer into the scene for interaction.
export function createStage(ctx, opts = {}) {
  const { u } = ctx
  const {
    fov = 50, radius = 7, elev = 0.4, orbitSpeed = 0.04,
    target = new THREE.Vector3(), useRot = false, tilt = 1, near = 0.05, far = 200,
  } = opts

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far)
  const camDir = uniform(new THREE.Vector3(0, 0, -1))

  const tiltV = new THREE.Vector2()
  const tmp   = new THREE.Vector2()
  const ray   = new THREE.Vector3()
  let orbit = 0
  let fit   = 1

  function projectPointer(pointerNDC) {
    ray.set(pointerNDC.x, pointerNDC.y, 0.5).unproject(camera).sub(camera.position).normalize()
    const n = camDir.value
    const denom = ray.dot(n)
    const tt = target.clone().sub(camera.position).dot(n) / (Math.abs(denom) < 1e-4 ? 1e-4 : denom)
    u.pointerWorld.value.copy(camera.position).addScaledVector(ray, tt)
  }

  return {
    scene,
    camera,
    camDir,
    target,
    resize(w, h) {
      camera.aspect = w / h
      fit = Math.pow(Math.max(1, 0.95 / camera.aspect), 0.8)
      camera.updateProjectionMatrix()
    },
    // o: optional per-frame overrides { radius, elev, az }
    update(dt, pointerNDC, o = {}) {
      orbit += dt * orbitSpeed
      const f = u.pointerForce.value
      tiltV.lerp(tmp.set(pointerNDC.x * f, pointerNDC.y * f), Math.min(1, dt * 1.5))
      const scroll = 1 - u.zoomScroll.value * 0.4 * (Math.sin(u.time.value * 0.3) * 0.5 + 0.5)
      const breath = useRot ? 1 - u.breath.value * 0.2 : 1
      const r  = (o.radius ?? radius) * fit * scroll * breath
      const el = (o.elev ?? elev) + tiltV.y * 0.25 * tilt
      const az = orbit + (useRot ? u.rot.value : 0) + tiltV.x * 0.35 * tilt + (o.az ?? 0)
      camera.position.set(
        target.x + Math.sin(az) * Math.cos(el) * r,
        target.y + Math.sin(el) * r,
        target.z + Math.cos(az) * Math.cos(el) * r,
      )
      camera.lookAt(target)
      camera.updateMatrixWorld()
      camera.getWorldDirection(camDir.value)
      projectPointer(pointerNDC)
    },
    projectPointer,
  }
}
