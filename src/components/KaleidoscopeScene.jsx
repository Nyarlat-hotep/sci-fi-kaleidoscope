import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { vert } from '../shaders/vert'
import { frag } from '../shaders/frag'

function KaleidoscopeMesh(props) {
  const {
    paletteColors, shapeType, symmetry, speed,
    hueShift, hueCycleSpeed,
    brightness, contrast,
    zoomPulse, rotSpeed, warp,
    tunnelDir,
  } = props

  const matRef      = useRef()
  const propsRef    = useRef(props)
  propsRef.current  = props
  const symRef      = useRef(symmetry)

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
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Palette colors (object array — update via effect)
  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uPalette.value = paletteColors.map(c => new THREE.Vector3(...c))
  }, [paletteColors])

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uAspect.value = size.width / size.height
    matRef.current.uniforms.uResolution.value.set(size.width, size.height)
  }, [size])

  useFrame((_, delta) => {
    if (!matRef.current) return
    const u = matRef.current.uniforms
    const p = propsRef.current

    u.uTime.value      += delta
    u.uShapeType.value  = p.shapeType
    symRef.current      = symRef.current + (p.symmetry - symRef.current) * Math.min(1, delta * 7)
    u.uSymmetry.value   = symRef.current
    u.uSpeed.value      = p.speed
    u.uHueShift.value   = p.hueShift
    u.uBrightness.value = p.brightness
    u.uContrast.value   = p.contrast
    u.uZoomPulse.value  = p.zoomPulse
    u.uWarp.value       = p.warp

    u.uTunnelDir.value  = p.tunnelDir
    if (p.rotSpeed      > 0.001) u.uRotOffset.value += p.rotSpeed      * 0.45 * delta
    if (p.hueCycleSpeed > 0.001) u.uHueAngle.value  += p.hueCycleSpeed * 0.8  * delta
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
