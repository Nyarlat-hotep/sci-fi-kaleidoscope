import { useState } from 'react'
import KaleidoscopeScene from './components/KaleidoscopeScene'
import Controls from './components/Controls'

export default function App() {
  const [palette,   setPalette]   = useState(0)
  const [shapeType, setShapeType] = useState(0)
  const [symmetry,  setSymmetry]  = useState(6)
  const [speed,     setSpeed]     = useState(0.5)

  return (
    <>
      <KaleidoscopeScene
        paletteIdx={palette}
        shapeType={shapeType}
        symmetry={symmetry}
        speed={speed}
      />
      <Controls
        palette={palette}     setPalette={setPalette}
        shapeType={shapeType} setShapeType={setShapeType}
        symmetry={symmetry}   setSymmetry={setSymmetry}
        speed={speed}         setSpeed={setSpeed}
      />
    </>
  )
}
