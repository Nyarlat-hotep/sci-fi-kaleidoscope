import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { vert } from '../shaders/vert'
import { frag } from '../shaders/frag'
import { PALETTES } from '../data/palettes'
import { BG_PRESETS } from '../data/bgColors'

function KaleidoscopeMesh({
  paletteIdx, shapeType, symmetry, speed,
  hueShift, hueCycleSpeed,
  brightness, contrast,
  bgColorIdx,
  zoomPulse, rotSpeed, warp,
  glitchTrigger,
}) {
  const matRef = useRef()
  const { size } = useThree()

  // Build stable uniforms object once — mutate .value directly
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

  // ── Sync uniforms reactively ─────────────────────────────────────────────
  useEffect(() => { if (matRef.current) matRef.current.uniforms.uSpeed.value     = speed      }, [speed])
  useEffect(() => { if (matRef.current) matRef.current.uniforms.uSymmetry.value  = symmetry   }, [symmetry])
  useEffect(() => { if (matRef.current) matRef.current.uniforms.uShapeType.value = shapeType  }, [shapeType])
  useEffect(() => { if (matRef.current) matRef.current.uniforms.uHueShift.value  = hueShift   }, [hueShift])
  useEffect(() => { if (matRef.current) matRef.current.uniforms.uBrightness.value = brightness }, [brightness])
  useEffect(() => { if (matRef.current) matRef.current.uniforms.uContrast.value  = contrast   }, [contrast])
  useEffect(() => { if (matRef.current) matRef.current.uniforms.uZoomPulse.value = zoomPulse  }, [zoomPulse])
  useEffect(() => { if (matRef.current) matRef.current.uniforms.uWarp.value      = warp       }, [warp])

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uPalette.value = PALETTES[paletteIdx].colors.map(c => new THREE.Vector3(...c))
  }, [paletteIdx])

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uBgColor.value = new THREE.Vector3(...BG_PRESETS[bgColorIdx].color)
  }, [bgColorIdx])

  // Glitch trigger — set to 1 and let useFrame decay it
  useEffect(() => {
    if (!matRef.current || glitchTrigger === 0) return
    matRef.current.uniforms.uGlitch.value = 1.0
  }, [glitchTrigger])

  // Aspect ratio on resize
  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uAspect.value = size.width / size.height
  }, [size])

  useFrame((_, delta) => {
    if (!matRef.current) return
    const u = matRef.current.uniforms

    u.uTime.value += delta

    // Rotation accumulates
    if (rotSpeed > 0.001) {
      u.uRotOffset.value += rotSpeed * 0.45 * delta
    }

    // Hue cycle accumulates
    if (hueCycleSpeed > 0.001) {
      u.uHueAngle.value += hueCycleSpeed * 0.8 * delta
    }

    // Glitch decays
    if (u.uGlitch.value > 0.001) {
      u.uGlitch.value = Math.max(0, u.uGlitch.value - delta * 2.2)
    }
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
