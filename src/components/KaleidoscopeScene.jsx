import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { vert } from '../shaders/vert'
import { frag } from '../shaders/frag'
import { PALETTES } from '../data/palettes'
import { BG_PRESETS } from '../data/bgColors'

function KaleidoscopeMesh(props) {
  const {
    paletteIdx, shapeType, symmetry, speed,
    hueShift, hueCycleSpeed,
    brightness, contrast,
    bgColorIdx,
    zoomPulse, rotSpeed, warp,
    glitchTrigger,
  } = props

  const matRef      = useRef()
  const propsRef    = useRef(props)  // always holds latest props, no stale closures
  propsRef.current  = props
  const symRef      = useRef(symmetry)  // smoothly lerped symmetry value

  const { size } = useThree()

  // Build stable uniforms object once — all mutations go through useFrame / effects below
  const uniforms = useMemo(() => ({
    uTime:       { value: 0 },
    uSpeed:      { value: speed },
    uSymmetry:   { value: symmetry },
    uShapeType:  { value: shapeType },
    uPalette:    { value: PALETTES[paletteIdx].colors.map(c => new THREE.Vector3(...c)) },
    uAspect:     { value: size.width / size.height },
    uHueShift:   { value: hueShift },
    uHueAngle:   { value: 0 },
    uBrightness: { value: brightness },
    uContrast:   { value: contrast },
    uBgColor:    { value: new THREE.Vector3(...BG_PRESETS[bgColorIdx].color) },
    uZoomPulse:  { value: zoomPulse },
    uRotOffset:  { value: 0 },
    uWarp:       { value: warp },
    uGlitch:     { value: 0 },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Object-valued uniforms — update via effect (creates Three.js objects)
  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uPalette.value = PALETTES[paletteIdx].colors.map(c => new THREE.Vector3(...c))
  }, [paletteIdx])

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uBgColor.value = new THREE.Vector3(...BG_PRESETS[bgColorIdx].color)
  }, [bgColorIdx])

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uAspect.value = size.width / size.height
  }, [size])

  // Glitch trigger
  useEffect(() => {
    if (!matRef.current || glitchTrigger === 0) return
    matRef.current.uniforms.uGlitch.value = 1.0
  }, [glitchTrigger])

  // Sync ALL scalar uniforms every frame via propsRef — most reliable R3F pattern,
  // avoids useEffect timing issues with the custom R3F reconciler
  useFrame((_, delta) => {
    if (!matRef.current) return
    const u = matRef.current.uniforms
    const p = propsRef.current

    u.uTime.value      += delta
    u.uShapeType.value  = p.shapeType
    // Lerp symmetry for a smooth morph animation
    symRef.current      = symRef.current + (p.symmetry - symRef.current) * Math.min(1, delta * 7)
    u.uSymmetry.value   = symRef.current
    u.uSpeed.value      = p.speed
    u.uHueShift.value   = p.hueShift
    u.uBrightness.value = p.brightness
    u.uContrast.value   = p.contrast
    u.uZoomPulse.value  = p.zoomPulse
    u.uWarp.value       = p.warp

    if (p.rotSpeed      > 0.001) u.uRotOffset.value += p.rotSpeed      * 0.45 * delta
    if (p.hueCycleSpeed > 0.001) u.uHueAngle.value  += p.hueCycleSpeed * 0.8  * delta
    if (u.uGlitch.value > 0.001) u.uGlitch.value     = Math.max(0, u.uGlitch.value - delta * 2.2)
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
