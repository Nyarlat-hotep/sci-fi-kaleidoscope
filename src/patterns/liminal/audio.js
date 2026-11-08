// Generated ambience for Liminal Space (Web Audio, no files): fluorescent
// hum and buzz that swell near lit panels and crackle when one flickers,
// low room tone, carpet footsteps, and rare distant noises.
//
// Browsers only allow audio after a user gesture, so the context is created
// on the first pointer/key press while the mode is active. A module-level
// singleton lets the React overlay's mute button share state with the mode.

const STORAGE_KEY = 'liminal-muted'
const MASTER = 0.8

function readMuted() {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

function noiseBuffer(ctx, seconds, brown = false) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 } else d[i] = w
  }
  return buf
}

class LiminalAudio {
  constructor() {
    this.muted = readMuted()
    this.ctx = null
    this.active = false
    this.listeners = new Set()
    this.nextEvent = 0
    this.onGesture = () => this.start()
    this.onVisibility = () => {
      if (!this.ctx) return
      if (document.hidden) this.ctx.suspend()
      else if (this.active) this.ctx.resume()
    }
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  setMuted(muted) {
    this.muted = muted
    try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0') } catch { /* storage unavailable */ }
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : MASTER, this.ctx.currentTime, 0.1)
    if (!muted) this.start()
    this.listeners.forEach(fn => fn(muted))
  }

  // Mode became active: wait for a gesture to start sound.
  enable() {
    this.active = true
    window.addEventListener('pointerdown', this.onGesture)
    window.addEventListener('keydown', this.onGesture)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  disable() {
    this.active = false
    window.removeEventListener('pointerdown', this.onGesture)
    window.removeEventListener('keydown', this.onGesture)
    document.removeEventListener('visibilitychange', this.onVisibility)
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
      this.master = null
    }
  }

  start() {
    if (!this.active || this.ctx) return
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    this.ctx = ctx
    window.removeEventListener('pointerdown', this.onGesture)
    window.removeEventListener('keydown', this.onGesture)

    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : MASTER
    this.master.connect(ctx.destination)
    this.white = noiseBuffer(ctx, 2)

    // Mains hum: 60 Hz fundamental with harmonics, softened.
    const humFilter = ctx.createBiquadFilter()
    humFilter.type = 'lowpass'
    humFilter.frequency.value = 420
    this.humGain = ctx.createGain()
    this.humGain.gain.value = 0
    humFilter.connect(this.humGain).connect(this.master)
    for (const [f, g, type] of [[60, 0.5, 'sawtooth'], [120, 0.35, 'sine'], [180, 0.15, 'sine']]) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const og = ctx.createGain()
      og.gain.value = g
      o.connect(og).connect(humFilter)
      o.start()
    }

    // High ballast buzz.
    const buzz = ctx.createBufferSource()
    buzz.buffer = this.white
    buzz.loop = true
    const buzzFilter = ctx.createBiquadFilter()
    buzzFilter.type = 'bandpass'
    buzzFilter.frequency.value = 3400
    buzzFilter.Q.value = 9
    this.buzzGain = ctx.createGain()
    this.buzzGain.gain.value = 0
    buzz.connect(buzzFilter).connect(this.buzzGain).connect(this.master)
    buzz.start()

    // Room tone.
    const room = ctx.createBufferSource()
    room.buffer = noiseBuffer(ctx, 4, true)
    room.loop = true
    const roomFilter = ctx.createBiquadFilter()
    roomFilter.type = 'lowpass'
    roomFilter.frequency.value = 220
    const roomGain = ctx.createGain()
    roomGain.gain.value = 0.18
    room.connect(roomFilter).connect(roomGain).connect(this.master)
    room.start()

    this.nextEvent = ctx.currentTime + 20 + Math.random() * 30
  }

  footstep(intensity) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.white
    src.playbackRate.value = 0.7 + Math.random() * 0.3
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 380 + Math.random() * 160
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.32 * intensity, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
    src.connect(f).connect(g).connect(this.master)
    src.start(t, Math.random() * 1.5, 0.2)
  }

  // A far-off thud or groan, panned somewhere around you.
  distantEvent() {
    const ctx = this.ctx
    const t = ctx.currentTime
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.6 - 0.8
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.12, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.5)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 160
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(48 + Math.random() * 20, t)
    o.frequency.exponentialRampToValueAtTime(28, t + 2)
    o.connect(f).connect(g).connect(pan).connect(this.master)
    o.start(t)
    o.stop(t + 2.6)
  }

  // light: 0..~1.5 brightness of nearby panels; flickering: a nearby panel is
  // cutting out right now; steps: footsteps that landed; pace: 0..1 walk speed.
  update({ light, flickering, steps, pace }) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    const hum = 0.02 + Math.min(light, 1.5) * 0.05
    this.humGain.gain.setTargetAtTime(hum, t, 0.15)
    const buzz = flickering ? 0.05 * Math.random() : 0.004 + Math.min(light, 1.5) * 0.006
    this.buzzGain.gain.setTargetAtTime(buzz, t, flickering ? 0.01 : 0.2)
    for (let i = 0; i < steps; i++) this.footstep(0.6 + pace * 0.4)
    if (t > this.nextEvent) {
      this.distantEvent()
      this.nextEvent = t + 25 + Math.random() * 45
    }
  }
}

export const liminalAudio = new LiminalAudio()
