import * as THREE from 'three/webgpu'
import {
  uniform, float, vec2, vec3, dot, mix, sin, abs, length, smoothstep, hash, screenUV,
  screenCoordinate,
} from 'three/tsl'
import { CELL } from './constants'
import { lightAt, flicker, LIGHT_ON, LIGHT_FLICKER } from './layout'
import { createTextures } from './textures'
import { World } from './world'
import { Player } from './player'
import { liminalAudio } from './audio'

// Liminal Space — an endless, procedurally generated Level 0 you explore in
// first person, filmed on an old camcorder. It is a `raw` pattern: the
// engine skips the kaleidoscope fold and color grading, so none of the
// sidebar's visual controls apply.

export default {
  id: 'liminal',
  label: 'Liminal Space',
  fold: false,
  raw: true,
  lowRes: true,    // render a touch soft, like tape — and cheaper
  bloom: { strength: 0.35, radius: 0.6, threshold: 0.75 },

  create({ canvas }) {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 60)
    camera.rotation.order = 'YXZ'

    const time = uniform(0)
    const textures = createTextures()
    const world = new World(scene, textures, time)
    const player = new Player(camera, world, canvas)
    liminalAudio.enable()

    // Camcorder state: per-frame grain seed and the occasional tracking glitch.
    const grainSeed = uniform(0)
    const glitchY = uniform(0.5)
    const glitchAmt = uniform(0)
    let nextGlitch = 6 + Math.random() * 10
    let glitchLeft = 0

    // Brightness of nearby panels at the player, for the audio hum.
    const sampleLights = () => {
      const gx = Math.floor(player.x / CELL)
      const gz = Math.floor(player.z / CELL)
      let light = 0
      let flickering = false
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const l = lightAt(gx + dx, gz + dz)
          const state = l & 3
          if (state !== LIGHT_ON && state !== LIGHT_FLICKER) continue
          let I = 1
          if (state === LIGHT_FLICKER) {
            I = flicker(time.value, (l >> 2) / 255)
            if (I < 1) flickering = true
          }
          const ddx = (gx + dx + 0.5) * CELL - player.x
          const ddz = (gz + dz + 0.5) * CELL - player.z
          light += I / (1 + (ddx * ddx + ddz * ddz) * 0.32)
        }
      }
      return { light, flickering }
    }

    return {
      scene,
      camera,
      // Dev-only handle for automated walk-throughs (stripped from builds).
      debug: import.meta.env.DEV ? { player, world } : undefined,
      resize(w, h) {
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      },
      update(dt) {
        time.value += dt
        const steps = player.update(dt)
        world.update(player.x, player.z)
        liminalAudio.update({ ...sampleLights(), steps, pace: Math.min(1, player.speed / 3) })

        grainSeed.value = (grainSeed.value + 7919) % 1e6
        if (glitchLeft > 0) {
          glitchLeft -= dt
          glitchAmt.value = glitchLeft > 0 ? 1 : 0
        } else if ((nextGlitch -= dt) <= 0) {
          glitchLeft = 0.12 + Math.random() * 0.25
          glitchY.value = Math.random()
          nextGlitch = 8 + Math.random() * 18
        }
      },
      // Camcorder look: tracking glitch, edge color bleed, warm washed-out
      // grade, grain, faint scanlines and a heavy vignette.
      post(tex) {
        const band = smoothstep(0.03, 0.0, abs(screenUV.y.sub(glitchY))).mul(glitchAmt)
        const uv = screenUV.add(vec2(band.mul(0.025), 0))
        const bleed = uv.sub(0.5).mul(0.006).add(vec2(0.0015, 0))
        let col = vec3(
          tex.sample(uv.add(bleed)).r,
          tex.sample(uv).g,
          tex.sample(uv.sub(bleed)).b,
        )
        const lum = dot(col, vec3(0.299, 0.587, 0.114))
        col = mix(vec3(lum), col, 0.8).mul(vec3(1.05, 1.0, 0.86)).add(vec3(0.03, 0.028, 0.02))
        const grain = hash(screenCoordinate.x.add(screenCoordinate.y.mul(4099)).add(grainSeed))
        col = col.add(grain.sub(0.5).mul(0.08))
        col = col.mul(sin(screenCoordinate.y.mul(1.7)).mul(0.035).add(0.965))
        const vig = length(screenUV.sub(0.5).mul(vec2(1.25, 1)))
        col = col.mul(float(1).sub(smoothstep(0.35, 0.85, vig).mul(0.6)))
        return col.add(vec3(band.mul(0.08)))
      },
      dispose() {
        liminalAudio.disable()
        player.dispose()
        world.dispose()
        for (const t of Object.values(textures)) t.dispose()
      },
    }
  },
}
