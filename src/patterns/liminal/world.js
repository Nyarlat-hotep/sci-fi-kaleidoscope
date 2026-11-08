import * as THREE from 'three/webgpu'
import { uniform } from 'three/tsl'
import { CHUNK, CHUNK_SIZE, VIEW_CHUNKS, WINDOW, PLAYER_R } from './constants'
import { lightAt, cellFlags, LIGHT_NONE, LIGHT_ON, LIGHT_FLICKER } from './layout'
import { chunkGeometry } from './geometry'
import { createMaterials } from './materials'

// Streams chunks in and out around the player. Only the (2·VIEW_CHUNKS+1)²
// chunks around the player exist as meshes; everything else is just a
// deterministic function of coordinates. Each chunk is at most five
// instanced draws (walls, floors, ceilings, trim, light panels), all built
// from one shared unit box / panel geometry.

const tmpMatrix = new THREE.Matrix4()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const identityQuat = new THREE.Quaternion()

export class World {
  constructor(scene, textures, time) {
    this.scene = scene
    this.chunks = new Map()
    this.centerKey = null

    this.lightData = new Uint8Array(WINDOW * WINDOW * 4)
    this.lightTex = new THREE.DataTexture(this.lightData, WINDOW, WINDOW, THREE.RGBAFormat, THREE.UnsignedByteType)
    this.lightTex.magFilter = this.lightTex.minFilter = THREE.NearestFilter
    this.lightTex.generateMipmaps = false
    this.origin = uniform(new THREE.Vector2())

    this.materials = createMaterials({ textures, lightTex: this.lightTex, origin: this.origin, time })

    this.boxGeo = new THREE.BoxGeometry(1, 1, 1)
    this.boxGeo.translate(0.5, 0.5, 0.5)            // unit box spanning [0, 1]³
    this.panelGeo = new THREE.PlaneGeometry(1.2, 0.6)
    this.panelGeo.rotateX(Math.PI / 2)               // face down
  }

  // Call every frame; only does work when the player crosses a chunk border.
  update(px, pz) {
    const ccx = Math.floor(px / CHUNK_SIZE)
    const ccz = Math.floor(pz / CHUNK_SIZE)
    const key = `${ccx},${ccz}`
    if (key === this.centerKey) return false
    this.centerKey = key

    const wanted = new Set()
    for (let dx = -VIEW_CHUNKS; dx <= VIEW_CHUNKS; dx++) {
      for (let dz = -VIEW_CHUNKS; dz <= VIEW_CHUNKS; dz++) {
        const k = `${ccx + dx},${ccz + dz}`
        wanted.add(k)
        if (!this.chunks.has(k)) this.chunks.set(k, this.buildChunk(ccx + dx, ccz + dz))
      }
    }
    for (const [k, meshes] of this.chunks) {
      if (!wanted.has(k)) { this.disposeChunk(meshes); this.chunks.delete(k) }
    }
    this.fillLightMap((ccx - VIEW_CHUNKS) * CHUNK, (ccz - VIEW_CHUNKS) * CHUNK)
    return true
  }

  boxMesh(boxes, material) {
    const mesh = new THREE.InstancedMesh(this.boxGeo, material, boxes.length)
    boxes.forEach(([x0, x1, y0, y1, z0, z1], i) => {
      tmpMatrix.compose(tmpPos.set(x0, y0, z0), identityQuat, tmpScale.set(x1 - x0, y1 - y0, z1 - z0))
      mesh.setMatrixAt(i, tmpMatrix)
    })
    return mesh
  }

  buildChunk(cx, cz) {
    const g = chunkGeometry(cx, cz)
    const m = this.materials
    const meshes = [
      this.boxMesh(g.walls, m.wall),
      this.boxMesh(g.floors, m.floor),
      this.boxMesh(g.ceilings, m.ceiling),
    ]
    if (g.trim.length) meshes.push(this.boxMesh(g.trim, m.trim))
    if (g.panels.length) {
      const panels = new THREE.InstancedMesh(this.panelGeo, m.panel, g.panels.length / 3)
      for (let n = 0; n < g.panels.length; n += 3) {
        tmpMatrix.makeTranslation(g.panels[n], g.panels[n + 1], g.panels[n + 2])
        panels.setMatrixAt(n / 3, tmpMatrix)
      }
      meshes.push(panels)
    }
    for (const mesh of meshes) mesh.computeBoundingSphere()
    this.scene.add(...meshes)
    return meshes
  }

  disposeChunk(meshes) {
    this.scene.remove(...meshes)
    for (const mesh of meshes) mesh.dispose()
  }

  // One texel per cell: R = lit, G = flickers, B = flicker seed,
  // A = cell flags (sunken / stair / tall ceiling / dark zone; see cellFlags).
  fillLightMap(gx0, gz0) {
    const d = this.lightData
    for (let z = 0; z < WINDOW; z++) {
      for (let x = 0; x < WINDOW; x++) {
        const l = lightAt(gx0 + x, gz0 + z)
        const state = l & 3
        const o = (z * WINDOW + x) * 4
        d[o]     = state === LIGHT_ON || state === LIGHT_FLICKER ? 255 : 0
        d[o + 1] = state === LIGHT_FLICKER ? 255 : 0
        d[o + 2] = state === LIGHT_NONE ? 0 : l >> 2
        d[o + 3] = cellFlags(gx0 + x, gz0 + z)
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
    for (const meshes of this.chunks.values()) this.disposeChunk(meshes)
    this.chunks.clear()
    this.boxGeo.dispose()
    this.panelGeo.dispose()
    this.lightTex.dispose()
    for (const m of Object.values(this.materials)) m.dispose()
  }
}
