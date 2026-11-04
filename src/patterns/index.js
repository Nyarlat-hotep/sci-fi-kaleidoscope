import circuits from './circuits'
import crystals from './crystals'
import plasma from './plasma'
import geo from './geo'
import fractalFlight from './fractalFlight'
import moire from './moire'
import truchet from './truchet'
import turing from './turing'
import tunnel from './tunnel'
import watcher from './watcher'
import wireBox from './wireBox'
import sphere from './sphere'
import wireGrid from './wireGrid'
import hexMesh from './hexMesh'
import nebula from './nebula'
import swarm from './swarm'
import attractor from './attractor'
import morph from './morph'
import warp from './warp'

// Registry of every pattern the engine can render. Each entry:
//   id, label     — identity + button text (mirrored in ./meta.js for the UI)
//   fold          — true: pass through the kaleidoscope mirror fold
//   lowRes        — render the scene below screen resolution (ray-marched)
//   foldAngle     — optional wedge direction for the fold (radians)
//   bloom         — optional { strength, radius, threshold }
//   create(ctx)   — returns { scene, camera, init?, update?, resize?, dispose? }
export const PATTERNS = [
  circuits, crystals, plasma, geo, fractalFlight, moire, truchet, turing, tunnel,
  watcher, wireBox, sphere, wireGrid, hexMesh,
  nebula, swarm, attractor, morph, warp,
]

export function getPattern(id) {
  return PATTERNS.find(p => p.id === id)
}
