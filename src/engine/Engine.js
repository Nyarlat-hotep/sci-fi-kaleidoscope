import * as THREE from 'three/webgpu'
import {
  pass, screenUV, vec2, vec4, float, atan, length, floor, cos, sin, min,
  smoothstep, clamp, PI, TWO_PI,
} from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { createUniforms, makePaletteFn, hueRotate } from './uniforms'
import { createBreathState, resetBreath, stepBreath } from './breath'
import { getPattern } from '../patterns'
import { PATTERN_META } from '../patterns/meta'

// Quality tiers. The engine starts at a tier guessed from the device and
// steps down whenever the frame rate stays low.
//   dpr      — max device-pixel ratio for the canvas (Retina is 2; 1.5 is
//              visually near-identical with glow on, at ~56% of the pixels)
//   rayRes   — ray-marched scenes render at this fraction of CSS pixels,
//              independent of dpr (they're the most expensive per pixel)
export const TIERS = [
  { name: 'low',  dpr: 1,    particles: 1 << 15, bloom: false, steps: 44, rayRes: 0.5  },
  { name: 'mid',  dpr: 1.25, particles: 1 << 16, bloom: true,  steps: 60, rayRes: 0.6  },
  { name: 'high', dpr: 1.5,  particles: 1 << 17, bloom: true,  steps: 80, rayRes: 0.75 },
]

// Cap the frame rate: 120 Hz+ displays would otherwise render twice as many
// frames for no visible gain on slow-moving visuals. A frame is skipped only
// when it arrives much sooner than 1/60 s, so 60 and 90 Hz displays run at
// their native rate and 120 Hz drops to every other frame.
const MAX_FPS = 60
const MIN_FRAME_MS = (1000 / MAX_FPS) * 0.6

const FPS_FLOOR       = 42     // below this for a whole window → step down a tier
const FPS_WINDOW      = 2.5    // seconds per measurement window
const SETTLE_TIME     = 2.0    // ignore frame times right after a (re)build
const POINTER_IDLE    = 1.6    // seconds before pointer influence fades out

function guessTier(isWebGPU) {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const small  = Math.min(window.innerWidth, window.innerHeight) < 700
  if (!isWebGPU) return coarse || small ? 0 : 1
  return coarse || small ? 1 : 2
}

export class Engine {
  constructor(container, { paramsRef, onBreathPhase, onStatus, onError }) {
    this.container     = container
    this.paramsRef     = paramsRef
    this.onBreathPhase = onBreathPhase
    this.onStatus      = onStatus
    this.onError       = onError

    this.u        = createUniforms()
    this.palette  = makePaletteFn(this.u)
    this.breath   = createBreathState()
    this.lastBreathMode = null
    this.symCurrent = paramsRef.current.symmetry

    this.patternId  = null
    this.inst       = null
    this.buildToken = 0
    this.disposed   = false

    this.pointerNDC   = new THREE.Vector2()
    this.pointerIdle  = 99
    this.pointerForce = 0

    this.clock = new THREE.Timer()
    this.fps   = { frames: 0, time: 0, settle: SETTLE_TIME }

    this.canvas = document.createElement('canvas')
    Object.assign(this.canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%', display: 'block',
      touchAction: 'none',
    })
    container.appendChild(this.canvas)
    if (import.meta.env.DEV) window.__engine = this
  }

  async init() {
    const renderer = new THREE.WebGPURenderer({
      canvas: this.canvas, antialias: false, alpha: false,
      // ?webgl in the URL forces the WebGL2 fallback, for testing older devices.
      forceWebGL: new URLSearchParams(window.location.search).has('webgl'),
    })
    await renderer.init()
    if (this.disposed) { renderer.dispose(); return }

    renderer.toneMapping = THREE.NoToneMapping
    this.renderer = renderer
    this.isWebGPU = !!renderer.backend.isWebGPUBackend
    this.tierIndex = guessTier(this.isWebGPU)

    this.pipeline = new THREE.RenderPipeline(renderer)
    // Palettes are authored as display colors; write them through unchanged
    // so the new patterns match the legacy look.
    this.pipeline.outputColorTransform = false

    this._onResize = () => this.resize()
    this._onPointerMove = (e) => this.handlePointer(e)
    this._onPointerUp = (e) => { if (e.pointerType === 'touch') this.pointerIdle = POINTER_IDLE }
    window.addEventListener('resize', this._onResize)
    window.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerdown', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)

    this.resize()
    this.reportStatus()
    if (this.patternId) await this.build()
    if (this.disposed) return
    this.lastFrameTime = -Infinity
    renderer.setAnimationLoop((time) => {
      if (time - this.lastFrameTime < MIN_FRAME_MS) return
      this.lastFrameTime = time
      this.frame()
    })
  }

  get tier() { return TIERS[this.tierIndex] }

  reportStatus() {
    this.onStatus?.({ backend: this.isWebGPU ? 'WebGPU' : 'WebGL2', tier: this.tier.name })
  }

  handlePointer(e) {
    this.pointerNDC.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    )
    this.pointerIdle = 0
  }

  resize() {
    if (!this.renderer) return
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.tier.dpr))
    this.renderer.setSize(w, h, false)
    this.u.aspect.value = w / h
    // Keep ray-marched scenes at the tier's CSS-pixel resolution even if the
    // pixel ratio changed (e.g. window dragged to a different display).
    if (this.scenePass && this.def?.lowRes) {
      this.scenePass.setResolutionScale(this.tier.rayRes / this.renderer.getPixelRatio())
    }
    this.inst?.resize?.(w, h)
  }

  // ── Pattern lifecycle ────────────────────────────────────────────────

  setPattern(id) {
    this.patternId = id
    if (this.renderer) this.build()
  }

  async build() {
    const token = ++this.buildToken
    const def = getPattern(this.patternId)
    if (!def) return

    let inst
    try {
      inst = def.create({
        u: this.u, palette: this.palette, tier: this.tier,
        renderer: this.renderer, isWebGPU: this.isWebGPU,
      })
      await inst.init?.()
    } catch (err) {
      console.error(err)
      this.onError?.(err)
      return
    }
    if (token !== this.buildToken || this.disposed) { inst.dispose?.(); return }

    this.inst?.dispose?.()
    this.disposePost()
    this.inst = inst
    this.def  = def
    // Mouse / touch interaction is reserved for the particle modes; 3D modes
    // ignore the pointer (no view steering, tilt or eye tracking).
    this.interactive = PATTERN_META.find(m => m.id === def.id)?.group === 'particles'
    this.u.fold.value = def.fold ? 1 : 0
    this.resize()
    this.buildPost()
    this.fps = { frames: 0, time: 0, settle: SETTLE_TIME }
  }

  // Post chain: scene → (mirror fold) → bloom → color grade.
  buildPost() {
    const u = this.u
    const def = this.def
    const scenePass = pass(this.inst.scene, this.inst.camera)
    if (def.lowRes) scenePass.setResolutionScale(this.tier.rayRes / this.renderer.getPixelRatio())
    // Mirrored wrapping means any fold sample that lands past the edge of the
    // frame reflects back in seamlessly instead of smearing.
    const rtTex = scenePass.renderTarget.texture
    rtTex.wrapS = rtTex.wrapT = THREE.MirroredRepeatWrapping
    const tex = scenePass.getTextureNode()

    const aspectV = vec2(u.aspect, 1)
    const p0 = screenUV.sub(0.5).mul(aspectV)
    let r = length(p0)
      .mul(float(1).add(u.zoomPulse.mul(0.3).mul(sin(u.time.mul(1.22)))))
    let a = atan(p0.y, p0.x)
    let segIdx = float(0)

    if (def.fold) {
      r = r.mul(float(1).sub(u.breath.mul(0.35)))
      a = a.add(u.rot)
      const seg = TWO_PI.div(u.symmetry)
      const aw  = a.sub(TWO_PI.mul(floor(a.div(TWO_PI))))   // wrap to [0, 2π)
      segIdx    = floor(aw.div(seg))
      const am  = aw.sub(seg.mul(segIdx))                    // angle inside segment
      a = min(am, seg.sub(am))                               // mirror half
      // Each pattern says which way its wedge faces (default π/2 = toward the
      // bottom of the frame, since screenUV runs top-down),
      // so the fold samples the most interesting part of its frame.
      a = a.add(def.foldAngle ?? PI.mul(0.5)).sub(seg.mul(0.25))
    }

    let q = vec2(cos(a), sin(a)).mul(r)
    const wt = u.time.mul(0.26)
    q = q.add(vec2(
      sin(q.y.mul(3.1).add(wt.mul(0.82))),
      cos(q.x.mul(2.8).sub(wt.mul(0.61))),
    ).mul(u.warp.mul(0.17)))

    const sampleUV = q.div(aspectV).add(0.5)
    let col = tex.sample(sampleUV).rgb

    if (this.tier.bloom) {
      this.bloomPass = bloom(vec4(col, 1), def.bloom?.strength ?? 0.8, def.bloom?.radius ?? 0.45, def.bloom?.threshold ?? 0.12)
      col = col.add(this.bloomPass.rgb)
    }

    // Grade: global hue cycle + per-segment hue spread, contrast, brightness.
    const hueA = u.hueAngle.add(segIdx.div(u.symmetry).mul(TWO_PI).mul(u.hueSpread).mul(u.fold))
    col = hueRotate(col, hueA)
    col = col.sub(0.5).mul(u.contrast).add(0.5).mul(u.brightness)
    col = col.mul(float(1).sub(smoothstep(0.74, 1.08, length(p0)).mul(0.28)))

    this.scenePass = scenePass
    this.pipeline.outputNode = vec4(clamp(col, 0, 1), 1)
    this.pipeline.needsUpdate = true
  }

  disposePost() {
    this.scenePass?.dispose()
    this.bloomPass?.dispose()
    this.scenePass = null
    this.bloomPass = null
  }

  // ── Frame loop ───────────────────────────────────────────────────────

  frame() {
    this.clock.update()
    const dt = Math.min(this.clock.getDelta(), 0.1)
    const p  = this.paramsRef.current
    const u  = this.u

    if (p.breathMode !== this.lastBreathMode) {
      resetBreath(this.breath)
      if (!p.breathMode) this.onBreathPhase?.({ label: null, progress: 0 })
      this.lastCue = null
      this.lastBreathMode = p.breathMode
    }
    const cue = stepBreath(this.breath, p, dt)
    // Only push breath UI updates to React when they'd visibly change.
    if (cue && (cue.label !== this.lastCue?.label || Math.abs(cue.progress - this.lastCue.progress) >= 0.01)) {
      this.lastCue = cue
      this.onBreathPhase?.(cue)
    }
    const bc = this.breath.current

    const slow = p.breathMode ? 0.28 + 0.72 * (1 - bc.breath * 0.6) : 1
    u.time.value     += dt * slow
    u.animTime.value += dt * slow * p.speed
    u.speed.value     = p.speed
    this.symCurrent  += (p.symmetry - this.symCurrent) * ((p.warp > 0.001 || p.zoomScroll > 0.001) ? 1 : Math.min(1, dt * 7))
    u.symmetry.value  = this.symCurrent
    u.hueSpread.value = p.hueShift
    u.contrast.value  = p.contrast
    u.zoomScroll.value = p.zoomScroll
    if (p.rotSpeed      > 0.001) u.rot.value      += p.rotSpeed      * 0.45 * dt
    if (p.hueCycleSpeed > 0.001) u.hueAngle.value += p.hueCycleSpeed * 0.8  * dt
    u.brightness.value = bc.brightness
    u.zoomPulse.value  = bc.zoomPulse
    u.warp.value       = bc.warp
    u.breath.value     = bc.breath

    if (p.paletteColors !== this.lastPalette) {
      this.lastPalette = p.paletteColors
      // Palettes are 3 vivid colors + 1 dark one, in no fixed order (custom
      // colors arrive as a dark→bright ramp). Split them: pal0..pal2 are the
      // accents patterns color with, pal3 is the shadow tone.
      const lum = c => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722
      const pc = p.paletteColors
      let dark = 0
      pc.forEach((c, i) => { if (lum(c) < lum(pc[dark])) dark = i })
      const accents = pc.filter((_, i) => i !== dark)
      u.pal0.value.setRGB(...accents[0]); u.pal1.value.setRGB(...accents[1])
      u.pal2.value.setRGB(...accents[2]); u.pal3.value.setRGB(...pc[dark])
    }

    this.pointerIdle += dt
    const forceTarget = this.interactive && this.pointerIdle < POINTER_IDLE ? 1 : 0
    this.pointerForce += (forceTarget - this.pointerForce) * Math.min(1, dt * (forceTarget ? 6 : 1.5))
    u.pointerForce.value = this.pointerForce
    u.pointer.value.set(this.pointerNDC.x * 0.5 * u.aspect.value, this.pointerNDC.y * 0.5)

    if (!this.inst) return
    this.inst.update?.(dt * slow, { pointerNDC: this.pointerNDC, params: p })
    this.pipeline.render()
    this.monitor(dt)
  }

  monitor(dt) {
    const f = this.fps
    if (f.settle > 0) { f.settle -= dt; return }
    f.frames += 1
    f.time   += dt
    if (f.time < FPS_WINDOW) return
    const fps = f.frames / f.time
    f.frames = 0
    f.time   = 0
    if (fps < FPS_FLOOR && this.tierIndex > 0) {
      this.tierIndex -= 1
      this.reportStatus()
      this.build()
    }
  }

  dispose() {
    this.disposed = true
    this.buildToken++
    window.removeEventListener('resize', this._onResize)
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerdown', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
    if (this.renderer) {
      this.renderer.setAnimationLoop(null)
      this.disposePost()
      this.inst?.dispose?.()
      this.pipeline?.dispose()
      this.renderer.dispose()
    }
    this.canvas.remove()
  }
}
