import { BREATH_MODES } from '../data/breathModes'

// Breath-guided modulation for the engine. Mirrors the behaviour of
// the original 2D renderer: brightness, warp and a 0..1 "breath" value
// follow the inhale / hold / exhale cycle, and everything eases toward its
// target so mode switches never pop.

export function createBreathState() {
  return {
    phaseIndex: 0,
    elapsed: 0,
    lastActivePhaseName: 'EXHALE',
    current: { brightness: 1, zoomPulse: 0, warp: 0, breath: 0 },
  }
}

export function resetBreath(state) {
  state.phaseIndex = 0
  state.elapsed = 0
  state.lastActivePhaseName = 'EXHALE'
}

// Advances the breath cycle. Returns the phase label/progress for the UI cue
// (or null when no breath mode is active) and updates state.current.
export function stepBreath(state, p, delta) {
  let targetBrightness = p.brightness
  let targetZoomPulse  = p.zoomPulse
  let targetWarp       = p.warp
  let targetBreath     = 0
  let cue = null

  if (p.breathMode) {
    const mode  = BREATH_MODES.find(m => m.id === p.breathMode)
    const phase = mode.phases[state.phaseIndex]
    state.elapsed += delta
    const progress = Math.min(state.elapsed / phase.dur, 1)

    if (phase.name !== 'HOLD') state.lastActivePhaseName = phase.name
    const holdAtPeak = state.lastActivePhaseName === 'INHALE'
    const focusMult  = p.breathMode === 'focus' ? 0.5 : 0.18

    targetZoomPulse = 0
    if (phase.name === 'INHALE') {
      targetBrightness = 1.0 + 0.7 * progress
      targetBreath     = progress
      targetWarp       = focusMult * progress
    } else if (phase.name === 'EXHALE') {
      targetBrightness = 1.7 - 0.7 * progress
      targetBreath     = 1.0 - progress
      targetWarp       = focusMult * (1 - progress)
    } else {
      targetBrightness = holdAtPeak ? 1.7 : 1.0
      targetBreath     = holdAtPeak ? 1.0 : 0.0
      targetWarp       = holdAtPeak ? focusMult : 0
    }

    if (state.elapsed >= phase.dur) {
      state.elapsed   -= phase.dur
      state.phaseIndex = (state.phaseIndex + 1) % mode.phases.length
    }
    cue = { label: phase.name, progress }
  }

  const c  = state.current
  const s  = Math.min(1, delta * 3)
  const sb = Math.min(1, delta * 8)
  c.brightness += (targetBrightness - c.brightness) * s
  c.zoomPulse  += (targetZoomPulse  - c.zoomPulse)  * s
  c.warp       += (targetWarp       - c.warp)       * s
  c.breath     += (targetBreath     - c.breath)     * sb
  return cue
}
