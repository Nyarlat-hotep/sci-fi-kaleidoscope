import * as THREE from 'three/webgpu'
import { mulberry32 } from './rng'

// Procedurally painted, seamlessly tiling textures (no image assets): a set
// of wall / floor / ceiling surfaces per area theme, mall marble and plaster,
// and an atlas of neon shop signs.

function canvas(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

// Draws `fn(x, y)` at all 9 wrap offsets so anything near an edge tiles cleanly.
function wrapped(size, x, y, fn) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(x + dx, y + dy)
}

function blotch(ctx, size, x, y, r, rgba) {
  wrapped(size, x, y, (px, py) => {
    const g = ctx.createRadialGradient(px, py, 0, px, py, r)
    g.addColorStop(0, rgba)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(px - r, py - r, r * 2, r * 2)
  })
}

function addNoise(ctx, size, amount, rnd) {
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n * 0.8
  }
  ctx.putImageData(img, 0, 0)
}

function stains(ctx, S, rnd, count, rgb, alpha) {
  for (let i = 0; i < count; i++) {
    blotch(ctx, S, rnd() * S, rnd() * S, 40 + rnd() * 140, `rgba(${rgb},${alpha * (0.5 + rnd())})`)
  }
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c)
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

// ── Walls ────────────────────────────────────────────────────────────────

function wallpaper({ base, light, dark, motif, seed }) {
  const S = 512
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(seed)
  ctx.fillStyle = `rgb(${base})`
  ctx.fillRect(0, 0, S, S)
  // Pinstripes with a small repeating diamond motif between them.
  for (let x = 0; x < S; x += 32) {
    ctx.fillStyle = `rgba(${light},0.35)`
    ctx.fillRect(x, 0, 2, S)
    ctx.fillStyle = `rgba(${dark},0.18)`
    ctx.fillRect(x + 2, 0, 1, S)
    for (let y = 0; y < S; y += 32) {
      ctx.fillStyle = `rgba(${dark},${motif})`
      ctx.beginPath()
      ctx.moveTo(x + 16, y + 10); ctx.lineTo(x + 22, y + 16); ctx.lineTo(x + 16, y + 22); ctx.lineTo(x + 10, y + 16)
      ctx.fill()
    }
  }
  stains(ctx, S, rnd, 14, dark, 0.03)
  for (let i = 0; i < 2; i++) {
    const x = rnd() * S
    const y = rnd() * S
    for (let k = 0; k < 6; k++) blotch(ctx, S, x + (rnd() - 0.5) * 50, y + rnd() * 90, 18 + rnd() * 30, `rgba(${dark},0.06)`)
  }
  addNoise(ctx, S, 14, rnd)
  return toTexture(c)
}

function paint() {
  const S = 256
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(51)
  ctx.fillStyle = 'rgb(200,201,194)'
  ctx.fillRect(0, 0, S, S)
  stains(ctx, S, rnd, 10, '120,120,110', 0.04)
  ctx.fillStyle = 'rgba(90,90,85,0.12)'
  for (let i = 0; i < 6; i++) ctx.fillRect(rnd() * S, rnd() * S, 10 + rnd() * 40, 1)   // scuffs
  addNoise(ctx, S, 10, rnd)
  return toTexture(c)
}

function woodPanel() {
  const S = 512
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(61)
  const plank = S / 8
  for (let p = 0; p < 8; p++) {
    const tone = 0.85 + rnd() * 0.3
    ctx.fillStyle = `rgb(${118 * tone | 0},${76 * tone | 0},${44 * tone | 0})`
    ctx.fillRect(p * plank, 0, plank, S)
    // Grain: long wavy darker lines.
    for (let k = 0; k < 9; k++) {
      ctx.strokeStyle = `rgba(60,34,16,${0.08 + rnd() * 0.12})`
      ctx.lineWidth = 1 + rnd() * 1.5
      ctx.beginPath()
      const x = p * plank + rnd() * plank
      const phase = rnd() * 6
      for (let y = 0; y <= S; y += 16) ctx.lineTo(x + Math.sin(y / 60 + phase) * 3, y)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(30,16,6,0.7)'           // groove between planks
    ctx.fillRect(p * plank, 0, 3, S)
  }
  addNoise(ctx, S, 12, rnd)
  return toTexture(c)
}

// Square ceramic tiles: `n` per texture side.
function tiles({ base, grout, n, seed }) {
  const S = 256
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(seed)
  ctx.fillStyle = `rgb(${grout})`
  ctx.fillRect(0, 0, S, S)
  const t = S / n
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const v = (rnd() - 0.5) * 10
      ctx.fillStyle = `rgb(${base.map((b) => (b + v) | 0).join(',')})`
      ctx.fillRect(x * t + 1.5, y * t + 1.5, t - 3, t - 3)
      ctx.fillStyle = 'rgba(255,255,255,0.18)'    // glaze highlight
      ctx.fillRect(x * t + 2, y * t + 2, t - 6, 2)
    }
  }
  addNoise(ctx, S, 6, rnd)
  return toTexture(c)
}

// ── Floors ───────────────────────────────────────────────────────────────

function carpet({ base, spot, seed, squares = 0 }) {
  const S = 256
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(seed)
  ctx.fillStyle = `rgb(${base})`
  ctx.fillRect(0, 0, S, S)
  if (squares) {
    // Carpet tiles laid with alternating pile direction.
    const t = S / squares
    for (let x = 0; x < squares; x++) {
      for (let y = 0; y < squares; y++) {
        ctx.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
        ctx.fillRect(x * t, y * t, t, t)
        ctx.fillStyle = 'rgba(0,0,0,0.12)'
        ctx.fillRect(x * t, y * t, t, 1)
        ctx.fillRect(x * t, y * t, 1, t)
      }
    }
  }
  for (let i = 0; i < 18; i++) {
    blotch(ctx, S, rnd() * S, rnd() * S, 20 + rnd() * 60, `rgba(${spot},${0.06 + rnd() * 0.1})`)
  }
  addNoise(ctx, S, 34, rnd)
  return toTexture(c)
}

// ── Ceilings ─────────────────────────────────────────────────────────────

function ceilingTiles({ base, seed, stain = 0.3 }) {
  // Covers 2×2 ceiling tiles.
  const S = 256
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(seed)
  const T = S / 2
  for (let tx = 0; tx < 2; tx++) {
    for (let ty = 0; ty < 2; ty++) {
      const v = rnd() * 18
      ctx.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v | 0})`
      ctx.fillRect(tx * T, ty * T, T, T)
      if (rnd() < stain) blotch(ctx, S, tx * T + rnd() * T, ty * T + rnd() * T, 20 + rnd() * 30, 'rgba(150,120,50,0.18)')
    }
  }
  ctx.fillStyle = 'rgba(90,85,70,0.35)'
  for (let i = 0; i < 1400; i++) ctx.fillRect(rnd() * S, rnd() * S, 1, 1)
  ctx.fillStyle = `rgb(${base[0] - 50},${base[1] - 50},${base[2] - 60})`
  for (const p of [0, T]) {
    ctx.fillRect(p, 0, 3, S)
    ctx.fillRect(0, p, S, 3)
  }
  addNoise(ctx, S, 10, rnd)
  return toTexture(c)
}

// ── Mall ─────────────────────────────────────────────────────────────────

function marble() {
  const S = 512
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(71)
  ctx.fillStyle = 'rgb(236,230,224)'
  ctx.fillRect(0, 0, S, S)
  stains(ctx, S, rnd, 10, '200,180,190', 0.08)
  // Soft veins.
  for (let k = 0; k < 14; k++) {
    ctx.strokeStyle = `rgba(150,130,150,${0.08 + rnd() * 0.12})`
    ctx.lineWidth = 0.6 + rnd() * 1.6
    let x = rnd() * S
    let y = rnd() * S
    const a = rnd() * Math.PI * 2
    wrapped(S, 0, 0, (dx, dy) => {
      ctx.beginPath()
      ctx.moveTo(x + dx, y + dy)
      let px = x
      let py = y
      for (let s = 0; s < 30; s++) {
        px += Math.cos(a + Math.sin(s * 0.7) * 0.8) * 9
        py += Math.sin(a + Math.sin(s * 0.7) * 0.8) * 9
        ctx.lineTo(px + dx, py + dy)
      }
      ctx.stroke()
    })
    x += 1
    y += 1
  }
  addNoise(ctx, S, 6, rnd)
  return toTexture(c)
}

function plaster() {
  const S = 256
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(81)
  ctx.fillStyle = 'rgb(232,232,232)'
  ctx.fillRect(0, 0, S, S)
  stains(ctx, S, rnd, 16, '200,200,200', 0.08)
  addNoise(ctx, S, 10, rnd)
  return toTexture(c)
}

// Invented shop names, set in a few neon colors. One sign per atlas row.
export const SIGNS = [
  ['MOONLIGHT VIDEO', '#ff7ad9'], ['AURORA', '#7af0ff'], ['PALM COURT', '#a6ff9e'],
  ['STARLITE', '#ffe27a'], ['CASSETTE CITY', '#ff9a5c'], ['GALAXY ARCADE', '#b78cff'],
  ['DREAMLAND', '#7ad0ff'], ['SUNSET SHOES', '#ff6f8e'], ['ECHO RECORDS', '#6fffd2'],
  ['COSMO CAFE', '#ffb3f2'], ['PASTEL', '#9ee7ff'], ['NIGHT SWIM', '#7affc3'],
]

function signAtlas() {
  const W = 512
  const H = 112
  const [c, ctx] = canvas(W, H * SIGNS.length)
  ctx.fillStyle = 'rgb(18,14,26)'
  ctx.fillRect(0, 0, W, H * SIGNS.length)
  SIGNS.forEach(([name, color], row) => {
    const y = row * H
    // Deco backing panel with a thin border.
    ctx.fillStyle = 'rgb(28,22,40)'
    ctx.fillRect(6, y + 6, W - 12, H - 12)
    ctx.strokeStyle = 'rgba(220,190,120,0.55)'
    ctx.lineWidth = 3
    ctx.strokeRect(10, y + 10, W - 20, H - 20)
    ctx.font = `${row % 3 === 0 ? 'italic ' : ''}bold 54px "Futura", "Avenir Next", "Trebuchet MS", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const size = Math.min(1, (W - 60) / ctx.measureText(name).width)
    ctx.save()
    ctx.translate(W / 2, y + H / 2 + 2)
    ctx.scale(size, 1)
    ctx.shadowColor = color
    for (const blur of [26, 12, 4]) {
      ctx.shadowBlur = blur
      ctx.fillStyle = color
      ctx.fillText(name, 0, 0)
    }
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(name, 0, 0)
    ctx.restore()
  })
  return toTexture(c, false)
}

// ── Sets ─────────────────────────────────────────────────────────────────

export function createTextures() {
  const yellowCeiling = ceilingTiles({ base: [210, 206, 188], seed: 37 })
  const marbleTex = marble()
  const poolTile = tiles({ base: [192, 206, 208], grout: '138,152,156', n: 8, seed: 91 })
  return {
    themes: [
      { // yellow
        wall: wallpaper({ base: '196,180,104', light: '232,218,150', dark: '120,100,40', motif: 0.16, seed: 11 }),
        floor: carpet({ base: '138,124,82', spot: '70,58,30', seed: 23 }),
        ceiling: yellowCeiling,
      },
      { // faded green
        wall: wallpaper({ base: '138,156,118', light: '186,204,160', dark: '70,90,60', motif: 0.22, seed: 13 }),
        floor: carpet({ base: '82,100,92', spot: '40,52,46', seed: 29 }),
        ceiling: yellowCeiling,
      },
      { // office
        wall: paint(),
        floor: carpet({ base: '98,104,116', spot: '50,54,62', seed: 31, squares: 4 }),
        ceiling: ceilingTiles({ base: [226, 226, 222], seed: 41, stain: 0.12 }),
      },
      { // wood paneling
        wall: woodPanel(),
        floor: carpet({ base: '150,88,40', spot: '80,40,14', seed: 33 }),
        ceiling: ceilingTiles({ base: [190, 178, 156], seed: 43, stain: 0.4 }),
      },
      { // pool
        wall: poolTile,
        floor: poolTile,
        ceiling: poolTile,
      },
      { // mall
        wall: plaster(),
        floor: marbleTex,
        ceiling: plaster(),
      },
    ],
    marble: marbleTex,
    signs: signAtlas(),
  }
}

export function disposeTextures(t) {
  const seen = new Set()
  for (const set of t.themes) for (const tex of Object.values(set)) seen.add(tex)
  seen.add(t.marble)
  seen.add(t.signs)
  for (const tex of seen) tex.dispose()
}
