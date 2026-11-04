import { useState, useEffect } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { PALETTES } from '../data/palettes'
import { BREATH_MODES } from '../data/breathModes'
import { PATTERN_META } from '../patterns/meta'
import './Controls.css'

// ── Color helpers ──────────────────────────────────────────────────────────

function hueToColor(h, l = 0.58) {
  const c = (1 - Math.abs(2 * l - 1))
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  const s = Math.floor(h / 60) % 6
  const [r, g, b] = s === 0 ? [c,x,0] : s === 1 ? [x,c,0] : s === 2 ? [0,c,x]
                  : s === 3 ? [0,x,c] : s === 4 ? [x,0,c] : [c,0,x]
  return '#' + [r+m, g+m, b+m].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')
}

function colorToHsl(hex) {
  if (!hex) return { h: 180, l: 0.58 }
  const r = parseInt(hex.slice(1,3),16)/255
  const g = parseInt(hex.slice(3,5),16)/255
  const b = parseInt(hex.slice(5,7),16)/255
  const max = Math.max(r,g,b), min = Math.min(r,g,b)
  const l = (max + min) / 2
  const d = max - min
  if (d < 0.001) return { h: 180, l: Math.round(l * 100) / 100 }
  let h = max === r ? ((g-b)/d + 6) % 6 : max === g ? (b-r)/d + 2 : (r-g)/d + 4
  return { h: Math.round(h * 60), l: Math.round(l * 100) / 100 }
}

const SYMMETRIES = [2, 4, 6, 8, 12]

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
  customColor, setCustomColor,
  shapeType, setShapeType,
  symmetry, setSymmetry,
  speed, setSpeed,
  hueShift, setHueShift,
  hueCycleSpeed, setHueCycleSpeed,
  brightness, setBrightness,
  contrast, setContrast,
  rotSpeed, setRotSpeed,
  zoomPulse, setZoomPulse,
  warp, setWarp,
  zoomScroll, setZoomScroll,
  setTunnelDir,
  breathMode, setBreathMode,
  engineStatus,
}) {
  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [tabHidden, setTabHidden] = useState(false)
  const { h: currentHue, l: currentLum } = colorToHsl(customColor)

  useEffect(() => {
    function onKey(e) {
      if (e.shiftKey && e.key === 'M') setOpen(o => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) return
    let timer = setTimeout(() => setTabHidden(true), 2000)
    function onActivity() {
      setTabHidden(false)
      clearTimeout(timer)
      timer = setTimeout(() => setTabHidden(true), 2000)
    }
    window.addEventListener('mousemove', onActivity)
    window.addEventListener('pointerdown', onActivity)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('pointerdown', onActivity)
    }
  }, [open])

  const current = PATTERN_META.find(p => p.id === shapeType)

  const patternButton = (p) => (
    <button
      key={p.id}
      className={`shape-btn${shapeType === p.id ? ' active' : ''}${p.accent ? ` ${p.accent}` : ''}`}
      onClick={() => {
        // Clicking Tunnel again reverses the direction of travel.
        if (p.id === 'tunnel' && shapeType === 'tunnel') setTunnelDir(d => d * -1)
        else setShapeType(p.id)
      }}
      title={p.fold ? `${p.label} (mirrored)` : p.label}
    >
      {p.label}
    </button>
  )

  return (
    <>
      {/* ── Edge tab — fixed independently so hit area never moves during animation ── */}
      <button
        className={`sidebar-tab${open ? ' sidebar-tab--open' : ''}${tabHidden && !open ? ' sidebar-tab--hidden' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close controls' : 'Open controls'}
      >
        <span className="sidebar-tab-label">CTRL</span>
        <ChevronRight size={13} className={`sidebar-tab-arrow${open ? ' sidebar-tab-arrow--open' : ''}`} />
        <span className="sidebar-tab-tooltip">Shift + M</span>
      </button>

      {/* ── Sidebar panel ─────────────────────────────────────────── */}
      <div className={`sidebar${open ? ' sidebar--open' : ''}`}>

        {/* Scrollable content */}
        <div className="sidebar-body">

          {/* Header */}
          <div className="sb-header">
            <span className="sb-title">CONTROLS</span>
            <button className="sb-close" onClick={() => setOpen(false)}><X size={14} /></button>
          </div>

          {/* ── PATTERNS ─────────────────────────────────────────── */}
          <Section title="3D">
            <div className="shape-grid">
              {PATTERN_META.filter(p => p.group === '3d').map(patternButton)}
            </div>
            {current?.accent === 'wire' && (
              <div className="wire-badge">WIREFRAME MODE</div>
            )}
          </Section>

          <Section title="Particles">
            <div className="shape-grid">
              {PATTERN_META.filter(p => p.group === 'particles').map(patternButton)}
            </div>
            {engineStatus && (
              <div className="engine-badge">
                {engineStatus.error
                  ? 'GRAPHICS UNAVAILABLE ON THIS DEVICE'
                  : `${engineStatus.backend} · ${engineStatus.tier.toUpperCase()}`}
              </div>
            )}
          </Section>

          {/* ── SYMMETRY ─────────────────────────────────────────── */}
          <Section title="Symmetry">
            <div className={`sym-row${current && !current.fold ? ' sym-row--inactive' : ''}`}>
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
                  className={`swatch${palette === i && !customColor ? ' active' : ''}`}
                  onClick={() => { setCustomColor(null); setPalette(i); setPickerOpen(false) }}
                  title={p.name}
                  style={{ background: `rgb(${p.colors[2].map(v => Math.round(v * 255)).join(',')})` }}
                />
              ))}
              <button
                className={`swatch swatch--custom${customColor ? ' active' : ''}`}
                style={{ background: customColor ?? 'conic-gradient(#ff2d6b 0deg 90deg, #00e5ff 90deg 180deg, #ffe600 180deg 270deg, #00ff88 270deg 360deg)' }}
                title="Custom color"
                onClick={() => {
                  if (!customColor) setCustomColor(hueToColor(180))
                  setPickerOpen(o => !o)
                }}
              />
            </div>

            {pickerOpen && (
              <div className="custom-picker">
                <div className="custom-picker-preview" style={{ background: customColor }} />
                <div className="custom-picker-row">
                  <span className="cp-label">HUE</span>
                  <input
                    type="range" className="cp-slider hue-slider"
                    min={0} max={359} step={1}
                    value={currentHue}
                    onChange={e => setCustomColor(hueToColor(+e.target.value, currentLum))}
                  />
                </div>
                <div className="custom-picker-row">
                  <span className="cp-label">LUM</span>
                  <input
                    type="range" className="cp-slider"
                    min={0.28} max={0.78} step={0.01}
                    value={currentLum}
                    onChange={e => setCustomColor(hueToColor(currentHue, +e.target.value))}
                    style={{ background: `linear-gradient(to right, hsl(${currentHue},90%,18%), hsl(${currentHue},100%,55%), hsl(${currentHue},60%,82%))` }}
                  />
                </div>
              </div>
            )}

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
            <SliderRow label="Zoom Scroll"   value={zoomScroll}    onChange={setZoomScroll}    min={0}    max={1}  step={0.01} />
            <SliderRow label="Warp"          value={warp}          onChange={setWarp}          min={0}    max={1}  step={0.01} />
          </Section>

          {/* ── MEDITATE ─────────────────────────────────────────── */}
          <Section title="Meditate">
            <div className="breath-mode-list">
              {BREATH_MODES.map(m => {
                const active = breathMode === m.id
                return (
                  <div
                    key={m.id}
                    className="breath-mode-row"
                    onClick={() => setBreathMode(cur => cur === m.id ? null : m.id)}
                  >
                    <span className={`breath-mode-label${active ? ' breath-mode-label--on' : ''}`}>{m.label}</span>
                    <div className={`breath-toggle${active ? ' breath-toggle--on' : ''}`}>
                      <div className="breath-toggle-thumb" />
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>

        </div>
      </div>
    </>
  )
}

