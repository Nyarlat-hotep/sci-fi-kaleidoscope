import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { vert } from '../shaders/vert'
import { frag } from '../shaders/frag'
import { PALETTES } from '../data/palettes'

function KaleidoscopeMesh({ paletteIdx, shapeType, symmetry, speed }) {
  const matRef = useRef()
  const { size } = useThree()

  // Build stable uniform object once — mutate values directly
  const uniforms = useMemo(() => ({
    uTime:      { value: 0 },
    uSpeed:     { value: speed },
    uSymmetry:  { value: symmetry },
    uShapeType: { value: shapeType },
    uPalette:   { value: PALETTES[paletteIdx].colors.map(c => new THREE.Vector3(...c)) },
    uAspect:    { value: size.width / size.height },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync uniforms on prop change
  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uSpeed.value = speed
  }, [speed])

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uSymmetry.value = symmetry
  }, [symmetry])

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uShapeType.value = shapeType
  }, [shapeType])

  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uPalette.value = PALETTES[paletteIdx].colors.map(c => new THREE.Vector3(...c))
  }, [paletteIdx])

  // Update aspect on resize
  useEffect(() => {
    if (!matRef.current) return
    matRef.current.uniforms.uAspect.value = size.width / size.height
  }, [size])

  // Tick time
  useFrame((_, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += delta
  })

  return (
    <mesh>
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
      style={{ position: 'fixed', inset: 0 }}
    >
      <KaleidoscopeMesh {...props} />
    </Canvas>
  )
}
