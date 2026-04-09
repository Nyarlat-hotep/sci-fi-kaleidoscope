export default function BreathCue({ phase }) {
  if (!phase.label) return null
  return (
    <div className="breath-cue">
      <span className="breath-cue-label">{phase.label}</span>
      <div className="breath-cue-bar-track">
        <div className="breath-cue-bar-fill" style={{ width: `${phase.progress * 100}%` }} />
      </div>
    </div>
  )
}
