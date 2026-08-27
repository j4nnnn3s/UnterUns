import { useEffect, useState } from 'react'

let offsetMs = 0
const listeners = new Set<() => void>()

export function syncServerNow(serverNowMs: number): void {
  if (!Number.isFinite(serverNowMs)) return
  offsetMs = serverNowMs - Date.now()
  for (const listener of listeners) listener()
}

export function nowMs(): number {
  return Date.now() + offsetMs
}

export function secondsRemaining(endsAtMs: number | null, now: number = nowMs()): number {
  if (endsAtMs === null) return 0
  return Math.max(0, Math.ceil((endsAtMs - now) / 1000))
}

export function useNow(intervalMs = 200): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((tick) => tick + 1)
    const id = window.setInterval(bump, intervalMs)
    listeners.add(bump)
    bump()
    return () => {
      window.clearInterval(id)
      listeners.delete(bump)
    }
  }, [intervalMs])
  return nowMs()
}
