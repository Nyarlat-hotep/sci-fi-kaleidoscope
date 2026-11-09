import * as THREE from 'three/webgpu'
import {
  Fn, float, vec2, vec3, texture, floor, step, mix, sin, cos, dot, normalize, clamp, exp, length,
  abs, select, smoothstep, fract, min, max, mod, pow, hash, positionWorld, normalWorld, attribute,
  cameraPosition, uv,
} from 'three/tsl'
import { CELL, WINDOW, SINK, POOL_D, MALL_H1, ESC_SPEED } from './constants'
import { CEIL_Y, THEME_YELLOW, THEME_POOL, THEME_MALL, THEME_COUNT } from './layout'
import { SIGNS } from './textures'

// Lighting is computed in the shader from a small light-map texture (one
// texel per grid cell around the player). Every surface gathers the 3×3
// nearest ceiling lights, so cost is fixed no matter how far you walk, and
// there are no per-light scene objects.
//
// Texel bytes: R = lit (bit 0) | flickers (bit 1), G = flicker seed,
//              B = ceiling class (bits 0–2) | floor class (bits 3–4), A = dark zone.

// Per-theme look: light color, ambient fill, fog, texture scales (meters per
// texture repeat) and trim color.
const THEMES = [
  { light: [1.0, 0.95, 0.78], ambient: 0.16, fog: [0.16, 0.14, 0.085], fogK: 0.088, wall: 1.4, floor: 2.2, ceil: 1.2, floorTint: 0.85, trim: [0.5, 0.46, 0.36] },
  { light: [0.94, 1.0, 0.84], ambient: 0.15, fog: [0.1, 0.13, 0.095], fogK: 0.088, wall: 1.4, floor: 2.2, ceil: 1.2, floorTint: 0.9, trim: [0.42, 0.47, 0.38] },
  { light: [0.93, 0.97, 1.04], ambient: 0.2, fog: [0.14, 0.15, 0.16], fogK: 0.085, wall: 2.0, floor: 2.0, ceil: 1.2, floorTint: 0.9, trim: [0.55, 0.56, 0.56] },
  { light: [1.0, 0.84, 0.6], ambient: 0.12, fog: [0.11, 0.075, 0.045], fogK: 0.09, wall: 2.4, floor: 2.0, ceil: 1.2, floorTint: 0.8, trim: [0.3, 0.19, 0.1] },
  { light: [0.92, 0.97, 1.0], ambient: 0.1, fog: [0.24, 0.29, 0.3], fogK: 0.08, wall: 1.2, floor: 1.2, ceil: 1.2, floorTint: 0.9, trim: [0.68, 0.72, 0.73], gain: 0.62 },
  { light: [1.0, 0.95, 0.92], ambient: 0.2, fog: [0.46, 0.4, 0.5], fogK: 0.065, wall: 1.6, floor: 2.5, ceil: 1.6, floorTint: 0.9, trim: [0.82, 0.64, 0.3], gain: 0.14 },
]

// Fog color per theme; index.js also uses it as the background, so space
// beyond the loaded chunks reads as haze rather than black.
export const THEME_FOG = THEMES.map((t) => t.fog)

// Bits [shift, shift + count) of a byte stored in a normalized channel.
const bits = (ch, shift, count) => mod(floor(ch.mul(255).add(0.5).div(2 ** shift)), 2 ** count)

const pick = (cls, values) => {
  let out = float(values[values.length - 1])
  for (let k = values.length - 2; k >= 0; k--) out = select(cls.lessThan(k + 0.5), float(values[k]), out)
  return out
}
const ceilHeight = (cls) => pick(cls, CEIL_Y)
const floorHeight = (cls) => pick(cls, [0, -SINK, -POOL_D, MALL_H1])

export function createMaterials({ textures, lightTex, origin, time }) {
  // Same curve as layout.flicker() so audio and visuals agree.
  const flicker = (seed) => {
    const n = sin(time.mul(7.3).add(seed.mul(31)))
      .add(sin(time.mul(13.1).add(seed.mul(17))).mul(0.5))
      .add(sin(time.mul(2.1).add(seed.mul(5))))
    return select(n.greaterThan(1.25), float(0.12), float(1))
  }

  const cellTexel = (cell) => {
    const local = cell.sub(origin)
    const inside = step(0, local.x).mul(step(0, local.y))
      .mul(step(local.x, WINDOW - 1)).mul(step(local.y, WINDOW - 1))
    return [texture(lightTex, local.add(0.5).div(WINDOW)), inside]
  }

  const lightIntensity = (s, inside) =>
    bits(s.r, 0, 1).mul(mix(float(1), flicker(s.g), bits(s.r, 1, 1))).mul(inside)

  const p = positionWorld
  const viewDist = length(cameraPosition.sub(p))
  const own = cellTexel(floor(p.xz.div(CELL)))

  // Diffuse light (scalar) at p with normal n.
  const lighting = Fn(([pos, n]) => {
    const base = floor(pos.xz.div(CELL))
    const sum = float(0).toVar()
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const c = base.add(vec2(dx, dz))
        const [s, inside] = cellTexel(c)
        // High lights (atriums, skylights) shine harder and fall off slower.
        const ly = ceilHeight(bits(s.b, 0, 3)).sub(0.05)
        const tall = smoothstep(3.5, 7, ly)
        const L = vec3(c.x.add(0.5).mul(CELL), ly, c.y.add(0.5).mul(CELL)).sub(pos)
        const ndl = clamp(dot(n, normalize(L)).mul(0.65).add(0.35), 0, 1)
        const falloff = mix(float(0.32), float(0.045), tall)
        const gain = mix(float(1), float(1.7), tall)
        sum.addAssign(lightIntensity(s, inside).mul(gain).mul(ndl).div(dot(L, L).mul(falloff).add(1)))
      }
    }
    return sum.mul(1.25)
  })

  // Lit, fogged color for an albedo under a theme's lighting.
  const shaders = THEMES.map((cfg) => {
    const fogColor = vec3(...cfg.fog)
    const lightColor = vec3(...cfg.light)
    const fogMix = (col, k = 1) => mix(fogColor, col, exp(viewDist.mul(cfg.fogK * k).pow(2).negate()))
    const ambient = mix(float(cfg.ambient), float(cfg.ambient * 0.3), bits(own[0].a, 0, 1))
    const shade = (albedo, occlusion = float(1), emissive = vec3(0)) =>
      fogMix(albedo.mul(lightColor).mul(lighting(p, normalWorld).mul(cfg.gain ?? 1).add(ambient)).mul(occlusion).add(emissive))
    return { cfg, shade, fogMix, lightColor }
  })

  const along = select(abs(normalWorld.x).greaterThan(0.5), p.z, p.x)
  const across = select(abs(normalWorld.x).greaterThan(0.5), p.x, p.z)
  const planarUV = select(abs(normalWorld.y).greaterThan(0.5), p.xz, vec2(along, p.y))
  const fresnel = pow(float(1).sub(abs(dot(normalize(cameraPosition.sub(p)), normalWorld))), 3)

  // Floor and ceiling heights of the cell a vertical face looks into, for
  // contact shadows at the base and top of walls.
  const [facingTexel] = cellTexel(floor(p.xz.sub(normalWorld.xz.mul(0.25)).div(CELL)))
  const faceBase = floorHeight(bits(facingTexel.b, 3, 2))
  const faceTop = ceilHeight(bits(facingTexel.b, 0, 3))
  const wallAO = mix(float(0.55), float(1), smoothstep(faceBase, faceBase.add(0.45), p.y))
    .mul(mix(float(0.8), float(1), smoothstep(faceTop, faceTop.sub(0.3), p.y)))

  const make = (colorNode, opts = {}) => {
    const m = new THREE.MeshBasicNodeMaterial()
    m.colorNode = colorNode
    if (opts.side) m.side = opts.side
    return m
  }

  // ── Theme surfaces ──────────────────────────────────────────────────────

  const mallWallColor = () => {
    // Pastel deco banding, repeated on each level: teal wainscot, a brass
    // line, pink plaster, and a teal frieze high up.
    const y = select(p.y.greaterThan(MALL_H1), p.y.sub(MALL_H1), p.y)
    const teal = vec3(0.45, 0.78, 0.76)
    const pink = vec3(0.97, 0.77, 0.81)
    const brass = vec3(0.86, 0.68, 0.36)
    let col = select(y.lessThan(1.05), teal, pink)
    col = select(y.greaterThan(1.05).and(y.lessThan(1.13)), brass, col)
    col = select(y.greaterThan(2.9).and(y.lessThan(3.15)), teal, col)
    col = select(y.greaterThan(3.15).and(y.lessThan(3.2)), brass, col)
    return col
  }

  const mallFloorColor = () => {
    const q = floor(p.xz.div(0.75))
    const checker = mod(q.x.add(q.y), 2)
    let col = mix(vec3(0.95, 0.9, 0.86), vec3(0.94, 0.64, 0.72), checker)
    const edge = min(fract(p.x.div(CELL)), fract(p.z.div(CELL)))
    col = select(edge.lessThan(0.035), vec3(0.32, 0.68, 0.68), col)
    return col
  }

  const themeSets = new Map()
  const theme = (t) => {
    if (themeSets.has(t)) return themeSets.get(t)
    const { cfg, shade, fogMix, lightColor } = shaders[t]
    const tex = textures.themes[t]
    const mall = t === THEME_MALL
    const wallAlbedo = texture(tex.wall, vec2(along, p.y).div(cfg.wall)).rgb
    const floorAlbedo = texture(tex.floor, planarUV.div(cfg.floor)).rgb.mul(cfg.floorTint)
    const ceilAlbedo = texture(tex.ceiling, p.xz.div(cfg.ceil)).rgb

    // Light panels glow with their own cell's state; a diffuser grid on top.
    const g = fract(uv().mul(vec2(8, 4)))
    const grid = min(min(g.x, float(1).sub(g.x)), min(g.y, float(1).sub(g.y)))
    const diffuser = mix(float(0.82), float(1), smoothstep(0.0, 0.12, grid))
    const glow = lightColor.mul(0.3).add(0.7).mul(lightIntensity(...own).mul(2.2).add(0.22)).mul(diffuser)

    const set = {
      wall: make(shade(mall ? wallAlbedo.mul(mallWallColor()) : wallAlbedo, wallAO)),
      floor: make(shade(mall ? floorAlbedo.mul(mallFloorColor()) : floorAlbedo)),
      ceiling: make(shade(mall ? ceilAlbedo.mul(vec3(0.97, 0.93, 0.96)) : ceilAlbedo)),
      trim: make(shade(vec3(...cfg.trim))),
      panel: make(fogMix(glow, 0.8)),
    }
    themeSets.set(t, set)
    return set
  }

  // ── Items ───────────────────────────────────────────────────────────────

  const mall = shaders[THEME_MALL]
  const backrooms = shaders[THEME_YELLOW]
  const pool = shaders[THEME_POOL]

  // Shallow water over tile: refracted floor, moving caustics and a sheen.
  const water = (s, tint) => {
    const wob = vec2(
      sin(p.x.mul(2.3).add(p.z.mul(1.1)).add(time.mul(1.3))),
      cos(p.z.mul(2.1).add(p.x.mul(0.7)).sub(time.mul(1.1))),
    ).mul(0.05)
    const bed = texture(textures.themes[THEME_POOL].floor, p.xz.add(wob).div(1.2)).rgb.mul(vec3(...tint))
    const caustic = pow(abs(sin(p.x.mul(3.1).add(time.mul(0.9)).add(sin(p.z.mul(2.3))))
      .mul(sin(p.z.mul(2.7).sub(time.mul(0.7)).add(sin(p.x.mul(1.9)))))), 6).mul(0.12)
    return s.shade(bed.add(caustic), float(1), s.lightColor.mul(fresnel.mul(0.1)))
  }

  // Bay identity for storefronts and signs: a stable integer per shop
  // (offset positive, since hash() works on unsigned integers).
  const bay = floor(along.div(CELL)).mul(73).add(floor(across.div(CELL).add(0.5)).mul(151))
    .add(floor(p.y.div(MALL_H1)).mul(17)).add(1e6)
  const bayHash = (salt) => hash(bay.mul(5).add(salt))
  const bayId = bayHash(1)

  const storefront = () => {
    const u = uv()
    const variant = bayId
    const steelRibs = smoothstep(0.32, 0.5, abs(fract(u.y.mul(46)).sub(0.5)))
    const grate = mall.shade(mix(vec3(0.42, 0.47, 0.5), vec3(0.62, 0.68, 0.7), steelRibs))
    const hue = bayHash(2)
    const tintA = mix(vec3(1.0, 0.62, 0.82), vec3(0.55, 0.92, 0.95), hue)
    const shelves = mix(float(0.75), float(1), smoothstep(0.0, 0.04, abs(fract(u.y.mul(3)).sub(0.5))))
    const litWindow = mall.fogMix(tintA.mul(u.y.mul(0.45).add(0.35)).mul(shelves).add(vec3(0.05)))
    const streak = smoothstep(0.06, 0.0, abs(fract(u.x.add(u.y.mul(0.6)).mul(1.3)).sub(0.5)))
    const darkWindow = mall.fogMix(vec3(0.05, 0.08, 0.1).add(streak.mul(0.12)).add(fresnel.mul(0.15)))
    let col = select(variant.lessThan(0.4), grate, select(variant.lessThan(0.75), litWindow, darkWindow))
    // Half-raised grate on some lit shops.
    col = select(variant.greaterThan(0.6).and(variant.lessThan(0.75)).and(u.y.greaterThan(0.62)), grate, col)
    const frame = max(step(u.x, 0.012).add(step(0.988, u.x)), step(u.y, 0.02).add(step(0.98, u.y)))
    return mix(col, mall.shade(vec3(0.86, 0.68, 0.36)), clamp(frame, 0, 1))
  }

  const sign = () => {
    const u = uv()
    const rows = SIGNS.length
    const row = floor(bayHash(3).mul(rows))
    // Canvas row r (top-down) spans v ∈ [1 − (r + 1) / rows, 1 − r / rows].
    const sample = texture(textures.signs, vec2(u.x, float(1).sub(row.add(1).sub(u.y).div(rows)))).rgb
    // A few signs are dead or buzzing.
    const state = bayHash(4)
    const buzz = select(state.lessThan(0.12), float(0.18),
      select(state.lessThan(0.22), select(sin(time.mul(23).add(state.mul(40))).greaterThan(0.6), float(0.3), float(1)), float(1)))
    return mall.fogMix(sample.mul(buzz).mul(1.7), 0.7)
  }

  const sky = () => {
    // Skylight panes: soft dreamy sky through brass mullions.
    const n = sin(p.x.mul(0.21).add(time.mul(0.03))).mul(sin(p.z.mul(0.17).sub(time.mul(0.02)))).mul(0.5).add(0.5)
    const col = mix(vec3(0.74, 0.88, 1.0), vec3(1.0, 0.84, 0.93), n).mul(0.95)
    const m = min(fract(p.x.div(1.5)), fract(p.z.div(1.5)))
    const mullion = step(m, 0.03).add(step(0.97, fract(p.x.div(1.5)))).add(step(0.97, fract(p.z.div(1.5))))
    return mall.fogMix(mix(col, vec3(0.3, 0.24, 0.16), clamp(mullion, 0, 1)), 0.5)
  }

  // Untransformed vertex position (positionLocal already includes the
  // instance matrix on instanced meshes).
  const vertex = attribute('position', 'vec3')

  const escalatorTreads = (dir) => {
    const lp = vertex
    const stripes = fract(lp.z.mul(18).sub(time.mul((ESC_SPEED / 7) * 18 * dir)))
    const groove = smoothstep(0.0, 0.08, stripes).mul(smoothstep(1.0, 0.85, stripes))
    let col = mix(vec3(0.22, 0.23, 0.25), vec3(0.6, 0.62, 0.64), groove)
    col = select(abs(lp.x).greaterThan(0.43), vec3(0.9, 0.76, 0.24), col)
    return mall.shade(col)
  }

  const vending = () => {
    const u = uv()
    const cellUV = fract(u.mul(vec2(5, 7)))
    const id = hash(floor(u.mul(vec2(5, 7))).dot(vec2(17.1, 3.7)))
    const can = step(0.15, cellUV.x).mul(step(cellUV.x, 0.85)).mul(step(0.12, cellUV.y)).mul(step(cellUV.y, 0.8))
    const label = mix(vec3(0.9, 0.2, 0.2), mix(vec3(0.2, 0.5, 0.95), vec3(0.95, 0.8, 0.2), step(0.5, id)), step(0.33, id))
    const col = mix(vec3(0.75, 0.82, 0.86), label, can)
    return backrooms.fogMix(col.mul(0.95))
  }

  const tv = () => {
    const u = uv()
    const snow = hash(floor(u.mul(vec2(150, 110))).dot(vec2(1, 157)).add(floor(time.mul(30)).mul(311.7)))
    const roll = sin(u.y.mul(9).add(time.mul(3))).mul(0.08)
    const vig = smoothstep(0.75, 0.3, length(u.sub(0.5)))
    return backrooms.fogMix(vec3(snow.mul(0.55).add(roll).add(0.1)).mul(vec3(0.85, 0.92, 1.0)).mul(vig))
  }

  const fall = () => {
    const u = uv()
    const streaks = hash(floor(u.x.mul(90)).mul(7.7))
    const flow = fract(u.y.mul(2).add(time.mul(1.6)).add(streaks))
    const a = smoothstep(0.0, 0.5, flow).mul(streaks.mul(0.6).add(0.4))
    return mall.fogMix(mix(vec3(0.32, 0.5, 0.56), vec3(0.75, 0.9, 0.95), a.mul(0.7)))
  }

  const marble = () => texture(textures.marble, planarUV.div(1.5)).rgb

  const ITEMS = {
    sky: () => make(sky()),
    water: () => make(water(pool, [0.42, 0.68, 0.72])),
    fountainWater: () => make(water(mall, [0.5, 0.85, 0.9])),
    fall: () => make(fall(), { side: THREE.DoubleSide }),
    storefront: () => make(storefront()),
    sign: () => make(sign()),
    marble: () => make(mall.shade(marble())),
    basin: () => make(mall.shade(marble().mul(vec3(0.95, 0.9, 0.92))), { side: THREE.DoubleSide }),
    brass: () => make(mall.shade(vec3(0.82, 0.64, 0.3), float(1), vec3(0.4, 0.3, 0.12).mul(fresnel))),
    glass: () => make(mall.shade(vec3(0.6, 0.84, 0.82).mul(0.8), float(1), vec3(0.5, 0.7, 0.7).mul(fresnel.mul(0.6)))),
    handrail: () => make(mall.shade(vec3(0.07, 0.07, 0.08))),
    escUp: () => make(escalatorTreads(1)),
    escDown: () => make(escalatorTreads(-1)),
    escStill: () => make(escalatorTreads(0)),
    escBody: () => make(mall.shade(vec3(0.55, 0.57, 0.6))),
    benchWood: () => make(mall.shade(vec3(0.55, 0.36, 0.22))),
    planter: () => make(mall.shade(marble().mul(vec3(1.0, 0.72, 0.74)))),
    soil: () => make(mall.shade(vec3(0.12, 0.09, 0.06))),
    trunk: () => make(mall.shade(vec3(0.66, 0.53, 0.38).mul(sin(vertex.y.mul(40)).mul(0.12).add(0.9)))),
    frond: () => make(mall.shade(vec3(0.24, 0.5, 0.26).mul(abs(sin(uv().x.mul(60))).mul(0.25).add(0.75))), { side: THREE.DoubleSide }),
    chair: () => make(backrooms.shade(vec3(0.17, 0.19, 0.25))),
    steel: () => make(backrooms.shade(vec3(0.5, 0.52, 0.54))),
    cardboard: () => make(backrooms.shade(vec3(0.56, 0.42, 0.26))),
    vendingBody: () => make(backrooms.shade(vec3(0.55, 0.1, 0.1))),
    vending: () => make(vending()),
    wood: () => make(backrooms.shade(vec3(0.36, 0.22, 0.12))),
    tvBody: () => make(backrooms.shade(vec3(0.12, 0.11, 0.1))),
    tv: () => make(tv()),
    exit: () => make(backrooms.fogMix(vec3(1.0, 0.18, 0.12).mul(1.4), 0.6)),
  }
  const items = new Map()
  const item = (name) => {
    if (!items.has(name)) {
      if (!ITEMS[name]) throw new Error(`Unknown liminal material: ${name}`)
      items.set(name, ITEMS[name]())
    }
    return items.get(name)
  }

  return {
    theme,
    item,
    itemNames: Object.keys(ITEMS),
    themeCount: THEME_COUNT,
    dispose() {
      for (const set of themeSets.values()) for (const m of Object.values(set)) m.dispose()
      for (const m of items.values()) m.dispose()
      themeSets.clear()
      items.clear()
    },
  }
}
