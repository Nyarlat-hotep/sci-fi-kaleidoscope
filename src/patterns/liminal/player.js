import { CELL, EYE, PLAYER_R, WALK_SPEED, RUN_SPEED } from './constants'
import { floorAt } from './layout'

// First-person controls: arrows / WASD to walk (left/right arrows turn,
// A/D strafe, Shift to hurry), drag with the mouse to look around. On touch
// screens the left half of the screen is a walk stick, the right half looks.

const TURN_RATE = 1.9          // rad/s for arrow-key turning
const LOOK_SENS = 0.0032       // rad per pixel dragged
const PITCH_LIMIT = 1.15
const STICK_RANGE = 70         // px of drag for full touch-stick deflection
const STEP_LENGTH = 0.75       // meters per footstep
const HEAD_BOB = 0.035
const HEADROOM = 1.9           // obstacles starting higher than this above your feet are overhead

const MOVE_KEYS = {
  ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back',
  ArrowLeft: 'turnL', ArrowRight: 'turnR', KeyA: 'left', KeyD: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
}

function isTyping(target) {
  return target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

export class Player {
  constructor(camera, world, canvas) {
    this.camera = camera
    this.world = world
    this.canvas = canvas
    this.x = CELL / 2
    this.z = CELL / 2
    this.vx = 0
    this.vz = 0
    this.y = 0                // smoothed floor height under the player
    this.yaw = 0
    this.pitch = 0
    this.stride = 0           // distance walked, drives head-bob and footsteps
    this.held = new Set()
    this.drag = null          // mouse look drag
    this.touches = new Map()  // pointerId → { mode: 'move' | 'look', x0, y0, x, y }
    this.boxes = []

    this.onKeyDown = (e) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const action = MOVE_KEYS[e.code]
      if (!action) return
      this.held.add(action)
      if (e.code.startsWith('Arrow')) e.preventDefault()   // don't scroll the page
    }
    this.onKeyUp = (e) => {
      const action = MOVE_KEYS[e.code]
      if (action) this.held.delete(action)
    }
    this.onBlur = () => { this.held.clear(); this.touches.clear(); this.drag = null }

    this.onPointerDown = (e) => {
      if (e.pointerType === 'touch') {
        const mode = e.clientX < window.innerWidth / 2 ? 'move' : 'look'
        this.touches.set(e.pointerId, { mode, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY })
      } else if (e.button === 0) {
        this.drag = { x: e.clientX, y: e.clientY }
        canvas.style.cursor = 'grabbing'
      }
      // Keep receiving moves if the drag leaves the canvas. Capture can fail
      // if the pointer was already released; dragging still works without it.
      try { canvas.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
    }
    this.onPointerMove = (e) => {
      const t = this.touches.get(e.pointerId)
      if (t) {
        if (t.mode === 'look') this.look(e.clientX - t.x, e.clientY - t.y)
        t.x = e.clientX
        t.y = e.clientY
      } else if (this.drag) {
        this.look(e.clientX - this.drag.x, e.clientY - this.drag.y)
        this.drag.x = e.clientX
        this.drag.y = e.clientY
      }
    }
    this.onPointerUp = (e) => {
      this.touches.delete(e.pointerId)
      if (e.pointerType !== 'touch') {
        this.drag = null
        canvas.style.cursor = 'grab'
      }
    }

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.style.cursor = 'grab'
  }

  look(dx, dy) {
    this.yaw -= dx * LOOK_SENS
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch - dy * LOOK_SENS))
  }

  // Returns how many footsteps landed this frame (usually 0 or 1).
  update(dt) {
    const k = this.held
    let fwd = (k.has('fwd') ? 1 : 0) - (k.has('back') ? 1 : 0)
    let side = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0)
    this.yaw += ((k.has('turnL') ? 1 : 0) - (k.has('turnR') ? 1 : 0)) * TURN_RATE * dt

    for (const t of this.touches.values()) {
      if (t.mode !== 'move') continue
      fwd += Math.max(-1, Math.min(1, (t.y0 - t.y) / STICK_RANGE))
      side += Math.max(-1, Math.min(1, (t.x - t.x0) / STICK_RANGE))
    }
    const mag = Math.hypot(fwd, side)
    if (mag > 1) { fwd /= mag; side /= mag }

    // Ease velocity toward the target so starts and stops feel weighty.
    const speed = k.has('run') ? RUN_SPEED : WALK_SPEED
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const tx = (-sin * fwd + cos * side) * speed
    const tz = (-cos * fwd - sin * side) * speed
    const ease = Math.min(1, dt * 8)
    this.vx += (tx - this.vx) * ease
    this.vz += (tz - this.vz) * ease

    // Axis-separated moves let you slide along walls instead of sticking.
    const boxes = this.world.nearbyBoxes(this.x, this.z, this.boxes)
    const feet = floorAt(this.x, this.z)
    const nx = this.x + this.vx * dt
    if (!collides(nx, this.z, feet, boxes)) this.x = nx
    else this.vx = 0
    const nz = this.z + this.vz * dt
    if (!collides(this.x, nz, feet, boxes)) this.z = nz
    else this.vz = 0
    // Ease onto stairs and ledges rather than snapping.
    this.y += (floorAt(this.x, this.z) - this.y) * Math.min(1, dt * 14)

    const moved = Math.hypot(this.vx, this.vz) * dt
    const before = Math.floor(this.stride / STEP_LENGTH)
    this.stride += moved
    const steps = Math.floor(this.stride / STEP_LENGTH) - before

    const walking = Math.min(1, Math.hypot(this.vx, this.vz) / WALK_SPEED)
    const phase = (this.stride / STEP_LENGTH) * Math.PI
    const bob = Math.abs(Math.sin(phase)) * HEAD_BOB * walking
    this.camera.position.set(this.x, this.y + EYE + bob - HEAD_BOB * 0.5 * walking, this.z)
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(phase) * 0.004 * walking)
    return steps
  }

  get speed() {
    return Math.hypot(this.vx, this.vz)
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.style.cursor = ''
  }
}

// Circle (player) vs axis-aligned boxes; ignores anything that starts above
// head height relative to the player's feet (door lintels, balconies).
function collides(x, z, feet, boxes) {
  const r2 = PLAYER_R * PLAYER_R
  for (const b of boxes) {
    if (b[2] > feet + HEADROOM) continue
    const qx = x < b[0] ? b[0] : x > b[1] ? b[1] : x
    const qz = z < b[4] ? b[4] : z > b[5] ? b[5] : z
    const dx = x - qx
    const dz = z - qz
    if (dx * dx + dz * dz < r2) return true
  }
  return false
}
