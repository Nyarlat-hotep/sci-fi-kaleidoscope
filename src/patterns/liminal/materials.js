import * as THREE from 'three/webgpu'
import {
  Fn, float, vec2, vec3, texture, floor, step, mix, sin, dot, normalize, clamp, exp, length,
  abs, select, smoothstep, fract, min, mod, positionWorld, normalWorld, cameraPosition, uv,
} from 'three/tsl'
import { CELL, WINDOW, WALL_H, LIGHT_Y, ATRIUM_H, SINK } from './constants'

// Lighting is computed in the shader from a small light-map texture (one
// texel per grid cell around the player: lit / flicker / seed / flags).
// Every surface gathers the 3×3 nearest ceiling panels, so cost is fixed no
// matter how far you walk, and there are no per-light scene objects.

const LIGHT_COLOR = vec3(1.0, 0.95, 0.78)
const AMBIENT = 0.16
const FOG_COLOR = vec3(0.16, 0.14, 0.085)
const FOG_DENSITY = 0.075

// Bit k of a flag byte stored as a normalized texel channel.
const flag = (channel, k) => mod(floor(channel.mul(255).add(0.5).div(2 ** k)), 2)

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

  const lightIntensity = (s, inside) => s.r.mul(mix(float(1), flicker(s.b), s.g)).mul(inside)

  const lighting = Fn(([p, n]) => {
    const base = floor(p.xz.div(CELL))
    const sum = float(0).toVar()
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const c = base.add(vec2(dx, dz))
        const [s, inside] = cellTexel(c)
        // Atrium panels hang high, so they shine harder and fall off slower.
        const tall = flag(s.a, 2)
        const ly = mix(float(LIGHT_Y), float(ATRIUM_H - 0.05), tall)
        const L = vec3(c.x.add(0.5).mul(CELL), ly, c.y.add(0.5).mul(CELL)).sub(p)
        const ndl = clamp(dot(n, normalize(L)).mul(0.65).add(0.35), 0, 1)
        const falloff = mix(float(0.32), float(0.05), tall)
        const gain = mix(float(1), float(1.6), tall)
        sum.addAssign(lightIntensity(s, inside).mul(gain).mul(ndl).div(dot(L, L).mul(falloff).add(1)))
      }
    }
    // Dark zones lose most of the ambient fill too.
    const [own] = cellTexel(base)
    const ambient = mix(float(AMBIENT), float(AMBIENT * 0.3), flag(own.a, 3))
    return sum.mul(1.25).add(ambient)
  })

  const p = positionWorld

  const shade = (albedo, occlusion = float(1)) => {
    const lit = albedo.mul(LIGHT_COLOR).mul(lighting(p, normalWorld)).mul(occlusion)
    const fog = exp(length(cameraPosition.sub(p)).mul(-FOG_DENSITY))
    return mix(FOG_COLOR, lit, fog)
  }

  // Floor and ceiling heights of the cell a vertical face looks into, for
  // contact shadows at the base and top of walls.
  const facing = () => {
    const [s] = cellTexel(floor(p.xz.sub(normalWorld.xz.mul(0.25)).div(CELL)))
    const lowered = clamp(flag(s.a, 0).add(flag(s.a, 1)), 0, 1)
    return {
      base: lowered.mul(-SINK),
      top: mix(float(WALL_H), float(ATRIUM_H), flag(s.a, 2)),
    }
  }

  // Walls & pillars: wallpaper mapped by world position so instanced boxes
  // of any size tile seamlessly; darkened toward the floor and ceiling.
  const wall = new THREE.MeshBasicNodeMaterial()
  const along = select(abs(normalWorld.x).greaterThan(0.5), p.z, p.x)
  const wallAlbedo = texture(textures.wall, vec2(along, p.y).div(1.4)).rgb
  const { base, top } = facing()
  const wallAO = mix(float(0.55), float(1), smoothstep(base, base.add(0.45), p.y))
    .mul(mix(float(0.8), float(1), smoothstep(top, top.sub(0.3), p.y)))
  wall.colorNode = shade(wallAlbedo, wallAO)

  // Carpet on top faces; step risers get the same carpet wrapped vertically.
  const floorMat = new THREE.MeshBasicNodeMaterial()
  const floorUV = select(abs(normalWorld.y).greaterThan(0.5), p.xz, vec2(along, p.y))
  floorMat.colorNode = shade(texture(textures.floor, floorUV.div(2.2)).rgb.mul(0.85))

  const ceilingMat = new THREE.MeshBasicNodeMaterial()
  ceilingMat.colorNode = shade(texture(textures.ceiling, p.xz.div(1.2)).rgb)

  // Railings, drop faces and balcony ledges: worn beige paint.
  const trim = new THREE.MeshBasicNodeMaterial()
  trim.colorNode = shade(vec3(0.5, 0.46, 0.36))

  // Light panels glow with their own cell's state; a diffuser grid on top.
  const panel = new THREE.MeshBasicNodeMaterial()
  const [ownTexel, ownInside] = cellTexel(floor(p.xz.div(CELL)))
  const own = lightIntensity(ownTexel, ownInside)
  const g = fract(uv().mul(vec2(8, 4)))
  const grid = min(min(g.x, float(1).sub(g.x)), min(g.y, float(1).sub(g.y)))
  const diffuser = mix(float(0.82), float(1), smoothstep(0.0, 0.12, grid))
  const glow = vec3(1.0, 0.97, 0.86).mul(own.mul(2.2).add(0.22)).mul(diffuser)
  panel.colorNode = mix(FOG_COLOR, glow, exp(length(cameraPosition.sub(p)).mul(-FOG_DENSITY * 0.8)))

  return { wall, floor: floorMat, ceiling: ceilingMat, trim, panel }
}
