import { useState } from 'react'
import { Zap } from 'lucide-react'
import { PALETTES } from '../data/palettes'
import { BG_PRESETS } from '../data/bgColors'
import './Controls.css'

const SHAPES = [
  { id: 'CIR', label: 'Circuits'  },
  { id: 'XTL', label: 'Crystals'  },
  { id: 'PLS', label: 'Plasma'    },
  { id: 'GEO', label: 'Geo'       },
  { id: 'FRC', label: 'Fractal'   },
  { id: 'SWM', label: 'Swarm'     },
  { id: 'LQD', label: 'Liquid'    },
  { id: 'TNL', label: 'Tunnel'    },
  // ── Wireframe ────────────────
  { id: 'BOX', label: 'Wire Box'  },
  { id: 'SPH', label: 'Sphere'    },
  { id: 'GRD', label: 'Wire Grid' },
  { id: 'HEX', label: 'Hex Mesh'  },
]

const SYMMETRIES = [4, 6, 8, 12]

function Section({ title, children }) {
  return (
    <div className="sb-section">
      <div className="sb-section-title">{title}</div>
      {children}
    </div>
  )
}

function SliderRow({ label, value, onChange, min, max, step, displayValue }) {
  return (
    <div className="sb-slider-row">
      <div className="sb-slider-header">
        <span className="sb-slider-label">{label}</span>
        <span className="sb-slider-value">{displayValue ?? value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        className="sb-slider"
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
  const [open, setOpen] = useState(false)
  const [glitching, setGlitching] = useState(false)

  function handleGlitch() {
    setGlitching(true)
    onGlitch()
    setTimeout(() => setGlitching(false), 420)
  }

  const isWireframe = shapeType >= 8

  return (
    <>
      {/* ── Sidebar panel ─────────────────────────────────────────── */}
      <div className={`sidebar${open ? ' sidebar--open' : ''}`}>

        {/* Edge tab */}
        <button
          className="sidebar-tab"
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Close controls' : 'Open controls'}
        >
          <span className="sidebar-tab-label">CTRL</span>
          <span className={`sidebar-tab-arrow${open ? ' sidebar-tab-arrow--open' : ''}`}>&#10148;</span>
        </button>

        {/* Scrollable content */}
        <div className="sidebar-body">

          {/* Header */}
          <div className="sb-header">
            <span className="sb-title">CONTROLS</span>
            <button className="sb-close" onClick={() => setOpen(false)}>&#x2715;</button>
          </div>

          {/* ── PATTERN ──────────────────────────────────────────── */}
          <Section title="Pattern">
            <div className="shape-grid">
              {SHAPES.map((s, i) => (
                <button
                  key={i}
                  className={`shape-btn${shapeType === i ? ' active' : ''}${i >= 8 ? ' wire' : ''}`}
                  onClick={() => setShapeType(i)}
                  title={s.label}
                >
                  {s.id}
                </button>
              ))}
            </div>
            {isWireframe && (
              <div className="wire-badge">WIREFRAME MODE</div>
            )}
          </Section>

          {/* ── SYMMETRY ─────────────────────────────────────────── */}
          <Section title="Symmetry">
            <div className="sym-row">
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
          </Section>

          {/* ── PALETTE ──────────────────────────────────────────── */}
          <Section title="Palette">
            <div className="palette-row">
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
            <div className="sb-row-label">Background</div>
            <div className="palette-row">
              {BG_PRESETS.map((b, i) => (
                <button
                  key={i}
                  className={`swatch swatch--sq${bgColorIdx === i ? ' active' : ''}`}
                  onClick={() => setBgColorIdx(i)}
                  title={b.label}
                  style={{ background: b.display }}
                />
              ))}
            </div>
          </Section>

          {/* ── COLOR ────────────────────────────────────────────── */}
          <Section title="Color">
            <SliderRow label="Hue Spread"    value={hueShift}      onChange={setHueShift}      min={0}   max={1}   step={0.01} />
            <SliderRow label="Hue Cycle"     value={hueCycleSpeed} onChange={setHueCycleSpeed} min={0}   max={1}   step={0.01} />
            <SliderRow label="Brightness"    value={brightness}    onChange={setBrightness}    min={0.3} max={2.0} step={0.05} />
            <SliderRow label="Contrast"      value={contrast}      onChange={setContrast}      min={0.5} max={2.0} step={0.05} />
          </Section>

          {/* ── MOTION ───────────────────────────────────────────── */}
          <Section title="Motion">
            <SliderRow label="Speed"         value={speed}         onChange={setSpeed}         min={0.05} max={3}  step={0.05} />
            <SliderRow label="Spin"          value={rotSpeed}      onChange={setRotSpeed}      min={0}    max={1}  step={0.01} />
            <SliderRow label="Zoom Pulse"    value={zoomPulse}     onChange={setZoomPulse}     min={0}    max={1}  step={0.01} />
            <SliderRow label="Warp"          value={warp}          onChange={setWarp}          min={0}    max={1}  step={0.01} />
          </Section>

          {/* ── EFFECTS ──────────────────────────────────────────── */}
          <Section title="Effects">
            <button
              className={`glitch-btn${glitching ? ' glitching' : ''}`}
              onClick={handleGlitch}
            >
              <Zap size={13} />
              GLITCH BURST
            </button>
          </Section>

        </div>
      </div>
    </>
  )
}
