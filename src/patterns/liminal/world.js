import * as THREE from 'three/webgpu'
import { uniform } from 'three/tsl'
import { CHUNK, CHUNK_SIZE, VIEW_CHUNKS, WINDOW, PLAYER_R } from './constants'
import { getLayout, lightAt, cellInfo, LIGHT_NONE, LIGHT_ON, LIGHT_FLICKER } from './layout'
import { chunkGeometry, ITEM_KINDS } from './geometry'
import { createMaterials } from './materials'

// Streams chunks in and out around the player. Only the (2·VIEW_CHUNKS+1)²
// chunks around the player are drawn; everything else is a pure function of
// coordinates. Drawing uses a fixed set of instanced meshes, one per
// material and shape (each theme's walls / floors / ceilings / trim / light
// panels, plus fixtures and props), refilled when the loaded chunks change.

const tmpMatrix = new THREE.Matrix4()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ')
const identityQuat = new THREE.Quaternion()

// Pooled meshes hold more instances than fit in a uniform buffer (1024), so
// three.js feeds instance matrices as vertex attributes and the shader never
// depends on how many instances are in use.
const POOL_CAPACITY = 1100
const BOX_CAPACITY = 2048       // walls / trim peak around 1150 across 3×3 chunks

// Box lists from geometry.js and the theme material each is drawn with.
const BOX_GROUPS = [['walls', 'wall'], ['floors', 'floor'], ['ceilings', 'ceiling'], ['trim', 'trim']]

// A palm frond: a narrow leaf along +z that rises then droops, with a
// slight crease down the middle.
function frondGeometry() {
  const segs = 8
  const pos = []
  const uvs = []
  const idx = []
  for (let s = 0; s <= segs; s++) {
    const z = s / segs
    const w = 0.34 * Math.sin(Math.PI * Math.min(1, z * 1.1)) + 0.02
    const y = 0.28 * z - 0.85 * z * z
    pos.push(-w / 2, y, z, 0, y + 0.035, z, w / 2, y, z)
    uvs.push(z, 0, z, 0.5, z, 1)
    if (s < segs) {
      const a = s * 3
      const b = a + 3
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

function createShapes() {
  const corner = new THREE.BoxGeometry(1, 1, 1)
  corner.translate(0.5, 0.5, 0.5)                 // unit box spanning [0, 1]³
  const panel = new THREE.PlaneGeometry(1.2, 0.6)
  panel.rotateX(Math.PI / 2)                       // face down
  const up = new THREE.PlaneGeometry(1, 1)
  up.rotateX(-Math.PI / 2)
  const down = new THREE.PlaneGeometry(1, 1)
  down.rotateX(Math.PI / 2)
  return {
    corner,
    panel,
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
    tube: new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, true),
    cone: new THREE.CylinderGeometry(0.4, 0.5, 1, 10),
    frond: frondGeometry(),
    vplane: new THREE.PlaneGeometry(1, 1),
    up,
    down,
  }
}

export class World {
  constructor(scene, textures, time) {
    this.scene = scene
    this.loaded = []          // [cx, cz] of chunks currently drawn
    this.centerKey = null
    this.pool = new Map()     // `${material}|${shape}` → { mesh, used }

    this.lightData = new Uint8Array(WINDOW * WINDOW * 4)
    this.lightTex = new THREE.DataTexture(this.lightData, WINDOW, WINDOW, THREE.RGBAFormat, THREE.UnsignedByteType)
    this.lightTex.magFilter = this.lightTex.minFilter = THREE.NearestFilter
    this.lightTex.generateMipmaps = false
    this.origin = uniform(new THREE.Vector2())

    this.materials = createMaterials({ textures, lightTex: this.lightTex, origin: this.origin, time })
    this.shapes = createShapes()

    // Create every draw up front. The renderer builds shaders per mesh, so
    // streaming must never create meshes, only refill these; building them
    // all now means the cost is paid once, when the mode starts.
    const m = this.materials
    for (let t = 0; t < m.themeCount; t++) {
      const set = m.theme(t)
      for (const [, mat] of BOX_GROUPS) this.entry(`t${t}:${mat}`, 'corner', set[mat], BOX_CAPACITY)
      this.entry(`t${t}:panel`, 'panel', set.panel)
    }
    for (const [mat, shape] of ITEM_KINDS) this.entry(mat, shape, m.item(mat))
  }

  // Pooled instanced mesh for a material + shape, created on first use.
  entry(matKey, shape, material, capacity = POOL_CAPACITY) {
    const key = `${matKey}|${shape}`
    let e = this.pool.get(key)
    if (!e) {
      if (this.loaded.length && import.meta.env.DEV) console.warn(`liminal: draw created while streaming: ${key}; add it to ITEM_KINDS`)
      e = { mesh: this.makeMesh(shape, material, capacity), shape, used: 0 }
      this.pool.set(key, e)
    }
    return e
  }

  makeMesh(shape, material, capacity) {
    const mesh = new THREE.InstancedMesh(this.shapes[shape], material, capacity)
    mesh.count = 0
    mesh.frustumCulled = false   // spans every loaded chunk
    this.scene.add(mesh)
    return mesh
  }

  push(e, matrix) {
    if (e.used === e.mesh.instanceMatrix.count) {
      // Out of room (rare): double the capacity. This one replacement
      // rebuilds a shader, unlike normal streaming.
      const old = e.mesh
      e.mesh = this.makeMesh(e.shape, old.material, e.used * 2)
      e.mesh.instanceMatrix.array.set(old.instanceMatrix.array)
      this.scene.remove(old)
      old.dispose()
    }
    e.mesh.setMatrixAt(e.used++, matrix)
  }

  // Call every frame; only does work when the player crosses a chunk border.
  update(px, pz) {
    const ccx = Math.floor(px / CHUNK_SIZE)
    const ccz = Math.floor(pz / CHUNK_SIZE)
    const key = `${ccx},${ccz}`
    if (key === this.centerKey) return false
    this.centerKey = key
    this.loaded = []
    for (let dx = -VIEW_CHUNKS; dx <= VIEW_CHUNKS; dx++) {
      for (let dz = -VIEW_CHUNKS; dz <= VIEW_CHUNKS; dz++) this.loaded.push([ccx + dx, ccz + dz])
    }
    this.refill()
    this.fillLightMap((ccx - VIEW_CHUNKS) * CHUNK, (ccz - VIEW_CHUNKS) * CHUNK)
    return true
  }

  // Rewrites every pooled mesh's instances from the loaded chunks.
  refill() {
    for (const e of this.pool.values()) e.used = 0
    const m = this.materials
    for (const [cx, cz] of this.loaded) {
      const g = chunkGeometry(cx, cz)
      const t = getLayout(cx, cz).theme
      const set = m.theme(t)
      for (const [list, mat] of BOX_GROUPS) {
        const e = this.entry(`t${t}:${mat}`, 'corner', set[mat])
        for (const [x0, x1, y0, y1, z0, z1] of g[list]) {
          this.push(e, tmpMatrix.compose(tmpPos.set(x0, y0, z0), identityQuat, tmpScale.set(x1 - x0, y1 - y0, z1 - z0)))
        }
      }
      const panels = this.entry(`t${t}:panel`, 'panel', set.panel)
      for (let n = 0; n < g.panels.length; n += 3) {
        this.push(panels, tmpMatrix.makeTranslation(g.panels[n], g.panels[n + 1], g.panels[n + 2]))
      }
      for (const it of g.items) {
        tmpQuat.setFromEuler(tmpEuler.set(it.pitch, it.yaw, 0))
        tmpMatrix.compose(tmpPos.set(it.x, it.y, it.z), tmpQuat, tmpScale.set(it.sx, it.sy, it.sz))
        this.push(this.entry(it.mat, it.shape, m.item(it.mat)), tmpMatrix)
      }
    }
    for (const e of this.pool.values()) {
      const im = e.mesh.instanceMatrix
      if (e.mesh.count === 0 && e.used === 0) continue
      e.mesh.count = e.used
      im.clearUpdateRanges()
      im.addUpdateRange(0, Math.max(1, e.used) * 16)
      im.needsUpdate = true
    }
  }

  // One texel per cell: R = lit | flickers << 1, G = flicker seed,
  // B = ceiling class | floor class << 3, A = dark zone (see layout.cellInfo).
  fillLightMap(gx0, gz0) {
    const d = this.lightData
    for (let z = 0; z < WINDOW; z++) {
      for (let x = 0; x < WINDOW; x++) {
        const l = lightAt(gx0 + x, gz0 + z)
        const state = l & 3
        const [b, a] = cellInfo(gx0 + x, gz0 + z)
        const o = (z * WINDOW + x) * 4
        d[o]     = state === LIGHT_ON ? 1 : state === LIGHT_FLICKER ? 3 : 0
        d[o + 1] = state === LIGHT_NONE ? 0 : l >> 2
        d[o + 2] = b
        d[o + 3] = a
      }
    }
    this.lightTex.needsUpdate = true
    this.origin.value.set(gx0, gz0)
  }

  // Solid boxes near (x, z) that could touch the player this frame.
  nearbyBoxes(x, z, out) {
    out.length = 0
    const reach = PLAYER_R + 1.5
    const cx0 = Math.floor((x - reach) / CHUNK_SIZE)
    const cx1 = Math.floor((x + reach) / CHUNK_SIZE)
    const cz0 = Math.floor((z - reach) / CHUNK_SIZE)
    const cz1 = Math.floor((z + reach) / CHUNK_SIZE)
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        for (const b of chunkGeometry(cx, cz).solid) {
          if (b[1] > x - reach && b[0] < x + reach && b[5] > z - reach && b[4] < z + reach) out.push(b)
        }
      }
    }
    return out
  }

  dispose() {
    for (const e of this.pool.values()) {
      this.scene.remove(e.mesh)
      e.mesh.dispose()
    }
    this.pool.clear()
    for (const geo of Object.values(this.shapes)) geo.dispose()
    this.lightTex.dispose()
    this.materials.dispose()
  }
}
