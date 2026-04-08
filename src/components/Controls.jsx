import { PALETTES } from '../data/palettes'
import './Controls.css'

const SHAPES = ['Circuits', 'Crystals', 'Plasma', 'Geo']
const SYMMETRIES = [4, 6, 8, 12]

export default function Controls({ palette, setPalette, shapeType, setShapeType, symmetry, setSymmetry, speed, setSpeed }) {
  return (
    <div className="controls">

      {/* Color palette */}
      <div className="ctrl-group">
        <span className="ctrl-label">Color</span>
        <div className="ctrl-row">
          {PALETTES.map((p, i) => (
            <button
              key={i}
              className={`swatch${palette === i ? ' active' : ''}`}
              onClick={() => setPalette(i)}
              title={p.name}
              style={{ background: `rgb(${p.colors[0].map(v => Math.round(v * 255)).join(',')})` }}
            />
          ))}
        </div>
      </div>

      {/* Shape type */}
      <div className="ctrl-group">
        <span className="ctrl-label">Shape</span>
        <div className="ctrl-row">
          {SHAPES.map((s, i) => (
            <button
              key={i}
              className={`pill${shapeType === i ? ' active' : ''}`}
              onClick={() => setShapeType(i)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Symmetry */}
      <div className="ctrl-group">
        <span className="ctrl-label">Sym</span>
        <div className="ctrl-row">
          {SYMMETRIES.map(n => (
            <button
              key={n}
              className={`step${symmetry === n ? ' active' : ''}`}
              onClick={() => setSymmetry(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Speed */}
      <div className="ctrl-group">
        <span className="ctrl-label">Speed</span>
        <div className="ctrl-row">
          <input
            type="range"
            className="speed-slider"
            min="0.05"
            max="3"
            step="0.05"
            value={speed}
            onChange={e => setSpeed(parseFloat(e.target.value))}
          />
        </div>
      </div>

    </div>
  )
}
