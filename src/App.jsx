import { useState, useMemo, useRef } from 'react'
import KaleidoscopeScene from './components/KaleidoscopeScene'
import Controls from './components/Controls'
import BreathCue from './components/BreathCue'
import { PALETTES } from './data/palettes'

function hexToRgb01(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ]
}

function colorToPalette(hex) {
  const [r, g, b] = hexToRgb01(hex)
  return [
    [r * 0.08, g * 0.08, b * 0.08],
    [r * 0.45, g * 0.45, b * 0.45],
    [r,        g,        b       ],
    [Math.min(1, r * 1.1 + 0.28), Math.min(1, g * 1.1 + 0.28), Math.min(1, b * 1.1 + 0.28)],
  ]
}

export default function App() {
  const [palette,       setPalette]       = useState(0)
  const [customColor,   setCustomColor]   = useState(null)
  const [shapeType,     setShapeType]     = useState(3)
  const [symmetry,      setSymmetry]      = useState(8)
  const [speed,         setSpeed]         = useState(0.45)

  const [hueShift,      setHueShift]      = useState(0)
  const [hueCycleSpeed, setHueCycleSpeed] = useState(0)
  const [brightness,    setBrightness]    = useState(1.0)
  const [contrast,      setContrast]      = useState(1.1)
  const [rotSpeed,      setRotSpeed]      = useState(0)
  const [zoomPulse,     setZoomPulse]     = useState(0)
  const [warp,          setWarp]          = useState(0)
  const [tunnelDir,     setTunnelDir]     = useState(1)

  const [breathMode,    setBreathMode]    = useState(null)
  const [breathPhase,   setBreathPhase]   = useState({ label: null, progress: 0 })
  const setBreathPhaseRef = useRef(setBreathPhase)
  setBreathPhaseRef.current = setBreathPhase

  const paletteColors = useMemo(
    () => customColor ? colorToPalette(customColor) : PALETTES[palette].colors,
    [palette, customColor]
  )

  return (
    <>
      <KaleidoscopeScene
        paletteColors={paletteColors}
        shapeType={shapeType}
        symmetry={symmetry}
        speed={speed}
        hueShift={hueShift}
        hueCycleSpeed={hueCycleSpeed}
        brightness={brightness}
        contrast={contrast}
        zoomPulse={zoomPulse}
        rotSpeed={rotSpeed}
        warp={warp}
        tunnelDir={tunnelDir}
        breathMode={breathMode}
        setBreathPhaseRef={setBreathPhaseRef}
      />
      <Controls
        palette={palette}             setPalette={setPalette}
        customColor={customColor}     setCustomColor={setCustomColor}
        shapeType={shapeType}         setShapeType={setShapeType}
        symmetry={symmetry}           setSymmetry={setSymmetry}
        speed={speed}                 setSpeed={setSpeed}
        hueShift={hueShift}           setHueShift={setHueShift}
        hueCycleSpeed={hueCycleSpeed} setHueCycleSpeed={setHueCycleSpeed}
        brightness={brightness}       setBrightness={setBrightness}
        contrast={contrast}           setContrast={setContrast}
        rotSpeed={rotSpeed}           setRotSpeed={setRotSpeed}
        zoomPulse={zoomPulse}         setZoomPulse={setZoomPulse}
        warp={warp}                   setWarp={setWarp}
        tunnelDir={tunnelDir}         setTunnelDir={setTunnelDir}
        breathMode={breathMode}       setBreathMode={setBreathMode}
      />
      <BreathCue phase={breathPhase} />
    </>
  )
}
