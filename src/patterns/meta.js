// Lightweight list of patterns for the controls UI. Kept separate from the
// pattern modules so the sidebar doesn't pull three/webgpu into the initial
// bundle. Order here is the button order.
//   group  — '3d' (geometry / ray-marched scenes) or 'particles'
//   accent — optional button style ('wire' | 'watcher')
export const PATTERN_META = [
  { id: 'circuits',       label: 'Circuits',  group: '3d', fold: true },
  { id: 'crystals',       label: 'Crystals',  group: '3d', fold: true },
  { id: 'plasma',         label: 'Plasma',    group: '3d', fold: true },
  { id: 'geo',            label: 'Geo',       group: '3d', fold: true },
  { id: 'fractal-flight', label: 'Fractal',   group: '3d', fold: true },
  { id: 'moire',          label: 'Moire',     group: '3d', fold: true },
  { id: 'truchet',        label: 'Truchet',   group: '3d', fold: true },
  { id: 'turing',         label: 'Turing',    group: '3d', fold: true },
  { id: 'tunnel',         label: 'Tunnel',    group: '3d', fold: true },
  { id: 'watcher',        label: 'Watcher',   group: '3d', fold: true, accent: 'watcher' },
  { id: 'wire-box',       label: 'Wire Box',  group: '3d', fold: true, accent: 'wire' },
  { id: 'sphere',         label: 'Sphere',    group: '3d', fold: false, accent: 'wire' },
  { id: 'wire-grid',      label: 'Wire Grid', group: '3d', fold: false, accent: 'wire' },
  { id: 'hex-mesh',       label: 'Hex Mesh',  group: '3d', fold: false, accent: 'wire' },
  { id: 'nebula',         label: 'Nebula',    group: 'particles', fold: false },
  { id: 'swarm',          label: 'Swarm',     group: 'particles', fold: false },
  { id: 'attractor',      label: 'Attractor', group: 'particles', fold: false },
  { id: 'morph',          label: 'Morph',     group: 'particles', fold: false },
  { id: 'warp',           label: 'Warp',      group: 'particles', fold: false },
]
