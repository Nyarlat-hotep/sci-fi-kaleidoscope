import { useEffect, useLayoutEffect, useRef } from 'react'
import { Engine } from './Engine'

// Mounts the WebGPU engine and feeds it the latest control values each render.
export default function EngineView({ pattern, onBreathPhase, onStatus, onError, ...params }) {
  const containerRef = useRef(null)
  const engineRef    = useRef(null)
  const paramsRef    = useRef(params)
  const cbRef        = useRef({ onBreathPhase, onStatus, onError })
  const patternRef   = useRef(pattern)

  // Sync the latest props into refs the engine reads from its frame loop.
  useLayoutEffect(() => {
    paramsRef.current  = params
    cbRef.current      = { onBreathPhase, onStatus, onError }
    patternRef.current = pattern
  })

  useEffect(() => {
    const engine = new Engine(containerRef.current, {
      paramsRef,
      onBreathPhase: (c) => cbRef.current.onBreathPhase?.(c),
      onStatus:      (s) => cbRef.current.onStatus?.(s),
      onError:       (e) => cbRef.current.onError?.(e),
    })
    engineRef.current = engine
    engine.setPattern(patternRef.current)
    engine.init().catch((err) => {
      console.error(err)
      cbRef.current.onError?.(err)
    })
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setPattern(pattern)
  }, [pattern])

  return <div ref={containerRef} />
}
