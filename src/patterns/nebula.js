import * as THREE from 'three/webgpu'
import {
  Fn, uniform, instancedArray, instanceIndex, hash, float, vec3, vec4, cos, sin, pow,
  length, normalize, cross, exp, floor, mx_noise_vec3, smoothstep, clamp, uv, TWO_PI,
} from 'three/tsl'

// Nebula — a GPU-simulated particle galaxy. Every particle is advected by a
// curl-noise flow field while tethered to a slowly winding spiral; the pointer (mouse
// or finger) stirs a vortex wherever it moves. Shown unfolded in full 3D.

const curlNoise = Fn(([p]) => {
  const e  = 0.12
  const f0 = mx_noise_vec3(p)
  const dx = mx_noise_vec3(p.add(vec3(e, 0, 0))).sub(f0)
  const dy = mx_noise_vec3(p.add(vec3(0, e, 0))).sub(f0)
  const dz = mx_noise_vec3(p.add(vec3(0, 0, e))).sub(f0)
  return vec3(dy.z.sub(dz.y), dz.x.sub(dx.z), dx.y.sub(dy.x)).div(e)
})

export default {
  id: 'nebula',
  label: 'Nebula',
  fold: false,
  bloom: { strength: 0.75, radius: 0.55, threshold: 0.05 },

  create({ u, palette, tier, renderer }) {
    const N = tier.particles
    const positions  = instancedArray(N, 'vec3')
    const velocities = instancedArray(N, 'vec3')
    const homes      = instancedArray(N, 'vec3')
    const dtU     = uniform(0)
    const camDir  = uniform(new THREE.Vector3(0, 0, -1))

    // Seed a flattened spiral disk.
    const initCompute = Fn(() => {
      const i  = instanceIndex
      const h1 = hash(i)
      const h2 = hash(i.add(7919))
      const h3 = hash(i.add(104729))
      const h4 = hash(i.add(52361))
      const h5 = hash(i.add(81283))
      // Three log-spiral arms with gaussian-ish scatter, plus ~20% diffuse dust.
      const r   = pow(h1, 0.75).mul(3.4).add(0.12)
      const arm = floor(h3.mul(3)).mul(TWO_PI.div(3))
      const scatter = h2.add(h4).sub(1).mul(0.9).div(r.mul(0.35).add(0.6))
      const dust = h5.lessThan(0.2)
      const a  = dust.select(h2.mul(TWO_PI), arm.add(r.mul(1.25)).add(scatter))
      const y  = hash(i.add(3331)).sub(0.5).mul(dust.select(0.9, 0.35)).mul(exp(r.mul(-0.4)))
      const home = vec3(cos(a).mul(r), y, sin(a).mul(r))
      homes.element(i).assign(home)
      positions.element(i).assign(home)
      velocities.element(i).assign(vec3(sin(a).negate(), 0, cos(a)).mul(0.5))
    })().compute(N)

    const updateCompute = Fn(() => {
      const pos = positions.element(instanceIndex)
      const vel = velocities.element(instanceIndex)
      const p = pos.toVar()
      const v = vel.toVar()

      // Each particle is tethered to a home on the spiral that turns with
      // differential rotation (inner stars orbit faster → arms wind up).
      const home  = homes.element(instanceIndex)
      const hr    = length(home.xz)
      const ang   = u.animTime.mul(0.3).div(hr.add(0.6))
      const ca    = cos(ang)
      const sa    = sin(ang)
      const squash = float(1).sub(u.breath.mul(0.45))
      const target = vec3(
        home.x.mul(ca).sub(home.z.mul(sa)),
        home.y,
        home.x.mul(sa).add(home.z.mul(ca)),
      ).mul(squash)

      const flow  = curlNoise(p.mul(0.6).add(vec3(0, u.animTime.mul(0.035), 0)))
      const tether = target.sub(p).mul(2.2)

      const d     = p.sub(u.pointerWorld)
      const dist2 = d.dot(d)
      const pf    = u.pointerForce.mul(exp(dist2.mul(-1.4)))
      const vortex = cross(camDir, d).mul(6).add(normalize(d.add(1e-4)).mul(2.5))

      const force = flow.mul(1.8).add(tether).add(vortex.mul(pf))
      v.addAssign(force.mul(dtU))
      v.mulAssign(float(1).sub(dtU.mul(2.2)).max(0))
      p.addAssign(v.mul(dtU))

      pos.assign(p)
      vel.assign(v)
    })().compute(N)

    // Fewer particles → each one a little larger and brighter.
    const density = Math.sqrt((1 << 18) / N)
    const material = new THREE.SpriteNodeMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    material.positionNode = positions.toAttribute()
    const speed = length(velocities.toAttribute())
    const radial = length(positions.toAttribute().xz)
    // Hot white-ish core fading to the palette's deep tones at the rim;
    // fast-moving (stirred) particles flare toward the bright end.
    material.colorNode = vec4(
      palette(clamp(float(1).sub(radial.mul(0.2)).add(speed.mul(0.25)), 0.25, 1)).mul(1.4), 1,
    )
    const disc = smoothstep(0.5, 0.0, length(uv().sub(0.5)))
    material.opacityNode = disc.mul(disc).mul(0.34 * density)
    material.scaleNode = float(0.022 * Math.min(density, 2.2))

    const sprite = new THREE.Sprite(material)
    sprite.count = N
    sprite.frustumCulled = false

    const group = new THREE.Group()
    group.add(sprite)
    const scene  = new THREE.Scene()
    scene.add(group)

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100)
    const tmp = new THREE.Vector3()
    const ray = new THREE.Vector3()
    const tilt = new THREE.Vector2()
    let orbit = 0
    let fit = 1

    return {
      scene,
      camera,
      async init() {
        await renderer.computeAsync(initCompute)
      },
      resize(w, h) {
        camera.aspect = w / h
        // Pull the camera back on tall phone screens so the disk stays framed.
        fit = Math.pow(Math.max(1, 0.95 / camera.aspect), 0.8)
        camera.updateProjectionMatrix()
      },
      update(dt, { pointerNDC }) {
        orbit += dt * 0.04
        const f = u.pointerForce.value
        tilt.lerp(tmp.set(pointerNDC.x * f, pointerNDC.y * f, 0), Math.min(1, dt * 1.5))
                const scroll = 1 - u.zoomScroll.value * 0.35 * (Math.sin(u.time.value * 0.3) * 0.5 + 0.5)
        const radius = 7.2 * fit * scroll * (1 - u.breath.value * 0.2)
        const elev = 0.55 + tilt.y * 0.25
        const az   = orbit + u.rot.value + tilt.x * 0.3
        camera.position.set(
          Math.sin(az) * Math.cos(elev) * radius,
          Math.sin(elev) * radius,
          Math.cos(az) * Math.cos(elev) * radius,
        )
        camera.lookAt(0, 0, 0)
        camera.updateMatrixWorld()
        camera.getWorldDirection(camDir.value)

        // Project the pointer onto the plane through the origin facing the camera.
        ray.set(pointerNDC.x, pointerNDC.y, 0.5).unproject(camera).sub(camera.position).normalize()
        const denom = ray.dot(camDir.value)
        const t = -camera.position.dot(camDir.value) / (Math.abs(denom) < 1e-4 ? 1e-4 : denom)
        u.pointerWorld.value.copy(camera.position).addScaledVector(ray, t)

        dtU.value = Math.min(dt, 1 / 30) * (0.12 + u.speed.value * 0.35)
        renderer.compute(updateCompute)
      },
      dispose() {
        material.dispose()
        initCompute.dispose?.()
        updateCompute.dispose?.()
      },
    }
  },
}
