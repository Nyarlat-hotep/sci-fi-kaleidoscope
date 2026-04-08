import { useState } from 'react'
import KaleidoscopeScene from './components/KaleidoscopeScene'
import Controls from './components/Controls'

export default function App() {
  const [palette,       setPalette]       = useState(0)
  const [shapeType,     setShapeType]     = useState(2)   // plasma default
  const [symmetry,      setSymmetry]      = useState(8)
  const [speed,         setSpeed]         = useState(0.45)

  const [hueShift,      setHueShift]      = useState(0)
  const [hueCycleSpeed, setHueCycleSpeed] = useState(0)
  const [brightness,    setBrightness]    = useState(1.0)
  const [contrast,      setContrast]      = useState(1.1)
  const [bgColorIdx,    setBgColorIdx]    = useState(0)

  const [rotSpeed,      setRotSpeed]      = useState(0)
  const [zoomPulse,     setZoomPulse]     = useState(0)
  const [warp,          setWarp]          = useState(0)
  const [glitchTrigger, setGlitchTrigger] = useState(0)

  return (
    <>
      <KaleidoscopeScene
        paletteIdx={palette}
        shapeType={shapeType}
        symmetry={symmetry}
        speed={speed}
        hueShift={hueShift}
        hueCycleSpeed={hueCycleSpeed}
        brightness={brightness}
        contrast={contrast}
        bgColorIdx={bgColorIdx}
        zoomPulse={zoomPulse}
        rotSpeed={rotSpeed}
        warp={warp}
        glitchTrigger={glitchTrigger}
      />
      <Controls
        palette={palette}             setPalette={setPalette}
        shapeType={shapeType}         setShapeType={setShapeType}
        symmetry={symmetry}           setSymmetry={setSymmetry}
        speed={speed}                 setSpeed={setSpeed}
        hueShift={hueShift}           setHueShift={setHueShift}
        hueCycleSpeed={hueCycleSpeed} setHueCycleSpeed={setHueCycleSpeed}
        brightness={brightness}       setBrightness={setBrightness}
        contrast={contrast}           setContrast={setContrast}
        bgColorIdx={bgColorIdx}       setBgColorIdx={setBgColorIdx}
        rotSpeed={rotSpeed}           setRotSpeed={setRotSpeed}
        zoomPulse={zoomPulse}         setZoomPulse={setZoomPulse}
        warp={warp}                   setWarp={setWarp}
        onGlitch={() => setGlitchTrigger(n => n + 1)}
      />
    </>
  )
}
