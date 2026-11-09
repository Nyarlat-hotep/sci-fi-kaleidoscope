// Generated ambience for Liminal Space (Web Audio, no files): fluorescent
// hum and buzz that swell near lit panels and crackle when one flickers,
// low room tone, footsteps on carpet / tile / water, rare distant noises,
// a hazy far-off mall pad in the mall wings and trickling water near pools
// and fountains.
//
// Browsers only allow audio after a user gesture, so the context is created
// on the first pointer/key press while the mode is active. A module-level
// singleton lets the React overlay's mute button share state with the mode.

const STORAGE_KEY = 'liminal-muted'
const MASTER = 0.8

// Slow, dreamy mall-muzak chords (Hz), one every CHORD_SECONDS.
const CHORDS = [
  [174.6, 220.0, 261.6, 329.6],   // Fmaj7
  [146.8, 174.6, 220.0, 329.6],   // Dm9-ish
  [116.5, 146.8, 174.6, 220.0],   // Bbmaj7
  [130.8, 164.8, 196.0, 220.0],   // C6
]
const CHORD_SECONDS = 7

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

    // Mall: detuned triangle pad through a lowpass and a long echo, as if
    // drifting from speakers somewhere down the concourse. Footsteps on
    // tile also feed the echo.
    this.echo = ctx.createDelay(1)
    this.echo.delayTime.value = 0.43
    const feedback = ctx.createGain()
    feedback.gain.value = 0.42
    const echoTone = ctx.createBiquadFilter()
    echoTone.type = 'lowpass'
    echoTone.frequency.value = 1800
    this.echo.connect(echoTone).connect(feedback).connect(this.echo)
    this.echoSend = ctx.createGain()
    this.echoSend.gain.value = 0
    this.echoSend.connect(this.echo)
    const echoOut = ctx.createGain()
    echoOut.gain.value = 0.5
    this.echo.connect(echoOut).connect(this.master)

    this.padGain = ctx.createGain()
    this.padGain.gain.value = 0
    const padTone = ctx.createBiquadFilter()
    padTone.type = 'lowpass'
    padTone.frequency.value = 1100
    padTone.connect(this.padGain)
    this.padGain.connect(this.master)
    this.padGain.connect(this.echo)
    this.voices = CHORDS[0].map((f, i) => {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      o.detune.value = (i - 1.5) * 6
      const g = ctx.createGain()
      g.gain.value = 0.16
      o.connect(g).connect(padTone)
      o.start()
      return o
    })
    this.chord = 0
    this.nextChord = ctx.currentTime + CHORD_SECONDS

    // Trickling water: band-limited noise with a slow wobble.
    const water = ctx.createBufferSource()
    water.buffer = this.white
    water.loop = true
    const waterTone = ctx.createBiquadFilter()
    waterTone.type = 'bandpass'
    waterTone.frequency.value = 1300
    waterTone.Q.value = 0.8
    this.waterGain = ctx.createGain()
    this.waterGain.gain.value = 0
    water.connect(waterTone).connect(this.waterGain).connect(this.master)
    water.start()

    this.nextEvent = ctx.currentTime + 20 + Math.random() * 30
  }

  // Muffled thump on carpet, a hard click on tile, a slosh in water.
  footstep(intensity, surface) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const [type, freq, level, decay] = surface === 'tile' ? ['lowpass', 2200, 0.2, 0.08]
      : surface === 'water' ? ['bandpass', 900, 0.3, 0.32]
        : ['lowpass', 380, 0.32, 0.16]
    const src = ctx.createBufferSource()
    src.buffer = this.white
    src.playbackRate.value = 0.7 + Math.random() * 0.3
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq * (0.85 + Math.random() * 0.4)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(level * intensity, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    src.connect(f).connect(g).connect(this.master)
    if (surface === 'tile') g.connect(this.echoSend)
    src.start(t, Math.random() * 1.5, decay + 0.05)
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
  // cutting out right now; steps: footsteps that landed; pace: 0..1 walk
  // speed; surface: 'carpet' | 'tile' | 'water'; mall / water: 0..1 presence.
  update({ light, flickering, steps, pace, surface, mall, water }) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    const hum = (0.02 + Math.min(light, 1.5) * 0.05) * (1 - mall * 0.75)
    this.humGain.gain.setTargetAtTime(hum, t, 0.15)
    this.padGain.gain.setTargetAtTime(mall * 0.05, t, 1.5)
    this.echoSend.gain.setTargetAtTime(mall * 0.6, t, 0.5)
    this.waterGain.gain.setTargetAtTime(water * 0.035 * (0.8 + 0.2 * Math.sin(t * 0.7)), t, 0.8)
    if (mall > 0 && t > this.nextChord) {
      this.chord = (this.chord + 1) % CHORDS.length
      CHORDS[this.chord].forEach((f, i) => this.voices[i].frequency.setTargetAtTime(f, t, 0.6))
      this.nextChord = t + CHORD_SECONDS
    }
    const buzz = flickering ? 0.05 * Math.random() : 0.004 + Math.min(light, 1.5) * 0.006
    this.buzzGain.gain.setTargetAtTime(buzz, t, flickering ? 0.01 : 0.2)
    for (let i = 0; i < steps; i++) this.footstep(0.6 + pace * 0.4, surface)
    if (t > this.nextEvent) {
      this.distantEvent()
      this.nextEvent = t + 25 + Math.random() * 45
    }
  }
}

export const liminalAudio = new LiminalAudio()
