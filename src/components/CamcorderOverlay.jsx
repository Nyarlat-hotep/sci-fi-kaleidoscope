import { useEffect, useState, useSyncExternalStore } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { liminalAudio } from '../patterns/liminal/audio'
import './CamcorderOverlay.css'

// On-screen display for Liminal Space: blinking REC, tape counter, a
// camcorder date stamp (stuck in 1996, live clock), a mute toggle and a
// controls hint that fades out.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const pad = (n) => String(n).padStart(2, '0')

function stamp(now) {
  const h = now.getHours() % 12 || 12
  const ampm = now.getHours() < 12 ? 'AM' : 'PM'
  return `${MONTHS[now.getMonth()]} ${pad(now.getDate())} 1996   ${h}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`
}

export default function CamcorderOverlay() {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(() => new Date())
  const muted = useSyncExternalStore(
    (cb) => liminalAudio.subscribe(cb),
    () => liminalAudio.muted,
  )

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = Math.max(0, Math.floor((now.getTime() - start) / 1000))
  const counter = `${pad(Math.floor(elapsed / 3600))}:${pad(Math.floor(elapsed / 60) % 60)}:${pad(elapsed % 60)}`

  return (
    <div className="camcorder">
      <div className="camcorder-rec"><span className="camcorder-dot" />REC</div>
      <div className="camcorder-counter">{counter}</div>
      <button
        className="camcorder-mute"
        onClick={() => liminalAudio.setMuted(!muted)}
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <div className="camcorder-date">{stamp(now)}</div>
      <div className="camcorder-hint">CLICK TO LOOK WITH MOUSE · ARROWS / WASD TO WALK · SHIFT TO HURRY · ESC FREES MOUSE</div>
    </div>
  )
}
