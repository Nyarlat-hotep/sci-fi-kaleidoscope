import { useState } from 'react'
import { Zap } from 'lucide-react'
import { PALETTES } from '../data/palettes'
import { BG_PRESETS } from '../data/bgColors'
import './Controls.css'

const SHAPES = [
  { id: 'CIR', label: 'Circuits' },
  { id: 'XTL', label: 'Crystals' },
  { id: 'PLS', label: 'Plasma'   },
  { id: 'GEO', label: 'Geo'      },
  { id: 'FRC', label: 'Fractal'  },
  { id: 'SWM', label: 'Swarm'    },
  { id: 'LQD', label: 'Liquid'   },
  { id: 'TNL', label: 'Tunnel'   },
]

const SYMMETRIES = [4, 6, 8, 12]

function Slider({ label, value, onChange, min, max, step }) {
  return (
    <div className="ctrl-group">
      <span className="ctrl-label">{label}</span>
      <input
        type="range"
        className="ctrl-slider"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

export default function Controls({
  palette, setPalette,
  shapeType, setShapeType,
  symmetry, setSymmetry,
  speed, setSpeed,
  hueShift, setHueShift,
  hueCycleSpeed, setHueCycleSpeed,
  brightness, setBrightness,
  contrast, setContrast,
  bgColorIdx, setBgColorIdx,
  rotSpeed, setRotSpeed,
  zoomPulse, setZoomPulse,
  warp, setWarp,
  onGlitch,
}) {
  const [glitching, setGlitching] = useState(false)

  function handleGlitch() {
    setGlitching(true)
    onGlitch()
    setTimeout(() => setGlitching(false), 420)
  }

  return (
    <div className="controls">

      {/* ── Row 1: Shape / Symmetry / Palette ─────────────────────────── */}
      <div className="ctrl-row-top">

        <div className="ctrl-section">
          <span className="ctrl-section-label">Shape</span>
          <div className="shape-grid">
            {SHAPES.map((s, i) => (
              <button
                key={i}
                className={`shape-btn${shapeType === i ? ' active' : ''}`}
                onClick={() => setShapeType(i)}
                title={s.label}
              >
                {s.id}
              </button>
            ))}
          </div>
        </div>

        <div className="ctrl-divider" />

        <div className="ctrl-section">
          <span className="ctrl-section-label">Symmetry</span>
          <div className="ctrl-inline">
            {SYMMETRIES.map(n => (
              <button
                key={n}
                className={`step-btn${symmetry === n ? ' active' : ''}`}
                onClick={() => setSymmetry(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="ctrl-divider" />

        <div className="ctrl-section">
          <span className="ctrl-section-label">Palette</span>
          <div className="ctrl-inline">
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

      </div>

      {/* ── Row divider ────────────────────────────────────────────────── */}
      <div className="row-divider" />

      {/* ── Row 2: Color controls + Motion controls ────────────────────── */}
      <div className="ctrl-row-bottom">

        {/* Color */}
        <div className="ctrl-section">
          <span className="ctrl-section-label">Color</span>
          <div className="ctrl-inline">
            <Slider label="Hue"    value={hueShift}      onChange={setHueShift}      min={0}    max={1}   step={0.01} />
            <Slider label="Cycle"  value={hueCycleSpeed} onChange={setHueCycleSpeed} min={0}    max={1}   step={0.01} />
            <Slider label="Bright" value={brightness}    onChange={setBrightness}    min={0.3}  max={2.0} step={0.05} />
            <Slider label="Cntrst" value={contrast}      onChange={setContrast}      min={0.5}  max={2.0} step={0.05} />

            <div className="ctrl-group">
              <span className="ctrl-label">BG</span>
              <div className="ctrl-inline">
                {BG_PRESETS.map((b, i) => (
                  <button
                    key={i}
                    className={`swatch swatch-sm${bgColorIdx === i ? ' active' : ''}`}
                    onClick={() => setBgColorIdx(i)}
                    title={b.label}
                    style={{ background: b.display }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="ctrl-divider" />

        {/* Motion */}
        <div className="ctrl-section">
          <span className="ctrl-section-label">Motion</span>
          <div className="ctrl-inline">
            <Slider label="Speed" value={speed}     onChange={setSpeed}     min={0.05} max={3}   step={0.05} />
            <Slider label="Spin"  value={rotSpeed}  onChange={setRotSpeed}  min={0}    max={1}   step={0.01} />
            <Slider label="Zoom"  value={zoomPulse} onChange={setZoomPulse} min={0}    max={1}   step={0.01} />
            <Slider label="Warp"  value={warp}      onChange={setWarp}      min={0}    max={1}   step={0.01} />

            <button
              className={`glitch-btn${glitching ? ' glitching' : ''}`}
              onClick={handleGlitch}
            >
              <Zap size={13} />
              <span>GLITCH</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
