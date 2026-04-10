import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { vert } from '../shaders/vert'
import { frag } from '../shaders/frag'
import { BREATH_MODES } from '../data/breathModes'

function KaleidoscopeMesh(props) {
  const {
    paletteColors, shapeType, symmetry, speed,
    hueShift, hueCycleSpeed,
    brightness, contrast,
    zoomPulse, rotSpeed, warp, zoomScroll,
    tunnelDir,
    breathMode, setBreathPhaseRef,
  } = props

  const matRef      = useRef()
  const propsRef    = useRef(props)
  propsRef.current  = props
  const symRef      = useRef(symmetry)

  const breathRef        = useRef({ phaseIndex: 0, elapsed: 0, lastActivePhaseName: 'EXHALE' })
  const breathCurrentRef = useRef({ brightness: 1.0, zoomPulse: 0, warp: 0, breath: 0 })

  const { size } = useThree()

  const uniforms = useMemo(() => ({
    uTime:       { value: 0 },
    uSpeed:      { value: speed },
    uSymmetry:   { value: symmetry },
    uShapeType:  { value: shapeType },
    uPalette:    { value: paletteColors.map(c => new THREE.Vector3(...c)) },
    uAspect:     { value: size.width / size.height },
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
    uHueShift:   { value: hueShift },
    uHueAngle:   { value: 0 },
    uBrightness: { value: brightness },
    uContrast:   { value: contrast },
    uBgColor:    { value: new THREE.Vector3(0, 0, 0) },
    uZoomPulse:  { value: zoomPulse },
    uRotOffset:  { value: 0 },
    uWarp:       { value: warp },
    uTunnelDir:  { value: 1 },
    uBreath:     { value: 0 },
    uZoomScroll: { value: 0 },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uPalette.value = paletteColors.map(c => new THREE.Vector3(...c))
  }, [paletteColors])

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uAspect.value = size.width / size.height
    matRef.current.uniforms.uResolution.value.set(size.width, size.height)
  }, [size])

  useEffect(() => {
    breathRef.current = { phaseIndex: 0, elapsed: 0, lastActivePhaseName: 'EXHALE' }
    if (!breathMode && setBreathPhaseRef) {
      setBreathPhaseRef.current({ label: null, progress: 0 })
    }
  }, [breathMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    if (!matRef.current) return
    const u = matRef.current.uniforms
    const p = propsRef.current

    // Slow pattern speed during breath modes — calming effect
    const breathSpeedMult = p.breathMode
      ? 0.28 + 0.72 * (1 - breathCurrentRef.current.breath * 0.6)
      : 1.0
    u.uTime.value      += delta * breathSpeedMult
    u.uShapeType.value  = p.shapeType
    symRef.current      = symRef.current + (p.symmetry - symRef.current) * Math.min(1, delta * 7)
    u.uSymmetry.value   = symRef.current
    u.uSpeed.value      = p.speed
    u.uHueShift.value   = p.hueShift
    u.uContrast.value   = p.contrast

    u.uTunnelDir.value  = p.tunnelDir
    if (p.rotSpeed      > 0.001) u.uRotOffset.value += p.rotSpeed      * 0.45 * delta
    if (p.hueCycleSpeed > 0.001) u.uHueAngle.value  += p.hueCycleSpeed * 0.8  * delta

    // ── Breathing logic ────────────────────────────────────────────
    let targetBrightness = p.brightness
    let targetZoomPulse  = p.zoomPulse
    let targetWarp       = p.warp
    let targetBreath     = 0

    if (p.breathMode) {
      const mode  = BREATH_MODES.find(m => m.id === p.breathMode)
      const br    = breathRef.current
      const phase = mode.phases[br.phaseIndex]
      br.elapsed += delta
      const progress = Math.min(br.elapsed / phase.dur, 1)

      if (phase.name !== 'HOLD') br.lastActivePhaseName = phase.name
      const holdAtPeak = br.lastActivePhaseName === 'INHALE'

      const focusMult = p.breathMode === 'focus' ? 0.5 : 0.18
      if (phase.name === 'INHALE') {
        targetBrightness = 1.0 + 0.7 * progress
        targetBreath     = progress
        targetZoomPulse  = 0
        targetWarp       = focusMult * progress
      } else if (phase.name === 'EXHALE') {
        targetBrightness = 1.7 - 0.7 * progress
        targetBreath     = 1.0 - progress
        targetZoomPulse  = 0
        targetWarp       = focusMult * (1 - progress)
      } else { // HOLD
        targetBrightness = holdAtPeak ? 1.7 : 1.0
        targetBreath     = holdAtPeak ? 1.0 : 0.0
        targetZoomPulse  = 0
        targetWarp       = holdAtPeak ? focusMult : 0
      }

      if (br.elapsed >= phase.dur) {
        br.elapsed    -= phase.dur
        br.phaseIndex  = (br.phaseIndex + 1) % mode.phases.length
      }

      if (p.setBreathPhaseRef) p.setBreathPhaseRef.current({ label: phase.name, progress })
    }

    // Lerp current values toward targets (~300ms transition)
    const s  = Math.min(1, delta * 3)
    const sb = Math.min(1, delta * 8)  // tighter tracking for breath sync
    breathCurrentRef.current.brightness += (targetBrightness - breathCurrentRef.current.brightness) * s
    breathCurrentRef.current.zoomPulse  += (targetZoomPulse  - breathCurrentRef.current.zoomPulse)  * s
    breathCurrentRef.current.warp       += (targetWarp       - breathCurrentRef.current.warp)        * s
    breathCurrentRef.current.breath     += (targetBreath     - breathCurrentRef.current.breath)      * sb

    u.uBrightness.value  = breathCurrentRef.current.brightness
    u.uZoomPulse.value   = breathCurrentRef.current.zoomPulse
    u.uWarp.value        = breathCurrentRef.current.warp
    u.uBreath.value      = breathCurrentRef.current.breath
    u.uZoomScroll.value  = p.zoomScroll
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
      />
    </mesh>
  )
}

export default function KaleidoscopeScene(props) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 1], near: 0.1, far: 10, zoom: 1 }}
      gl={{ antialias: false, alpha: false }}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}
    >
      <KaleidoscopeMesh {...props} />
    </Canvas>
  )
}
