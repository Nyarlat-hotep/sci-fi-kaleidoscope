import * as THREE from 'three/webgpu'
import { mulberry32 } from './rng'

// Procedurally painted, seamlessly tiling textures (no image assets):
// mono-yellow wallpaper, damp carpet and drop-ceiling tiles.

function canvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
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

function toTexture(c) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

function wallpaper() {
  const S = 512
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(11)
  ctx.fillStyle = 'rgb(196,180,104)'
  ctx.fillRect(0, 0, S, S)
  // Faint pinstripes with a small repeating diamond motif between them.
  for (let x = 0; x < S; x += 32) {
    ctx.fillStyle = 'rgba(232,218,150,0.35)'
    ctx.fillRect(x, 0, 2, S)
    ctx.fillStyle = 'rgba(150,132,64,0.18)'
    ctx.fillRect(x + 2, 0, 1, S)
    for (let y = 0; y < S; y += 32) {
      ctx.fillStyle = 'rgba(160,142,70,0.16)'
      ctx.beginPath()
      ctx.moveTo(x + 16, y + 10); ctx.lineTo(x + 22, y + 16); ctx.lineTo(x + 16, y + 22); ctx.lineTo(x + 10, y + 16)
      ctx.fill()
    }
  }
  // Uneven fading and the odd water stain.
  for (let i = 0; i < 14; i++) {
    blotch(ctx, S, rnd() * S, rnd() * S, 60 + rnd() * 140, `rgba(120,100,40,${0.02 + rnd() * 0.03})`)
  }
  for (let i = 0; i < 2; i++) {
    const x = rnd() * S
    const y = rnd() * S
    for (let k = 0; k < 6; k++) {
      blotch(ctx, S, x + (rnd() - 0.5) * 50, y + rnd() * 90, 18 + rnd() * 30, 'rgba(110,84,30,0.06)')
    }
  }
  addNoise(ctx, S, 14, rnd)
  return toTexture(c)
}

function carpet() {
  const S = 256
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(23)
  ctx.fillStyle = 'rgb(138,124,82)'
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 18; i++) {
    blotch(ctx, S, rnd() * S, rnd() * S, 20 + rnd() * 60, `rgba(70,58,30,${0.06 + rnd() * 0.1})`)
  }
  addNoise(ctx, S, 34, rnd)
  return toTexture(c)
}

function ceiling() {
  // Covers 2×2 ceiling tiles.
  const S = 256
  const [c, ctx] = canvas(S)
  const rnd = mulberry32(37)
  const T = S / 2
  for (let tx = 0; tx < 2; tx++) {
    for (let ty = 0; ty < 2; ty++) {
      const shade = 200 + rnd() * 18
      ctx.fillStyle = `rgb(${shade + 10},${shade + 6},${shade - 12})`
      ctx.fillRect(tx * T, ty * T, T, T)
      if (rnd() < 0.3) blotch(ctx, S, tx * T + rnd() * T, ty * T + rnd() * T, 20 + rnd() * 30, 'rgba(150,120,50,0.18)')
    }
  }
  // Pinhole speckle of acoustic tiles.
  ctx.fillStyle = 'rgba(90,85,70,0.35)'
  for (let i = 0; i < 1400; i++) ctx.fillRect(rnd() * S, rnd() * S, 1, 1)
  // Metal grid between tiles.
  ctx.fillStyle = 'rgb(160,155,138)'
  for (const p of [0, T]) {
    ctx.fillRect(p, 0, 3, S)
    ctx.fillRect(0, p, S, 3)
  }
  addNoise(ctx, S, 10, rnd)
  return toTexture(c)
}

export function createTextures() {
  return { wall: wallpaper(), floor: carpet(), ceiling: ceiling() }
}
