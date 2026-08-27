import { secondsRemaining, useNow } from '../game/time'
import type { Player } from '../types'

export function DeathOverlay({
  player,
  durationSeconds,
}: {
  player: Player
  durationSeconds: number
}) {
  const remaining = useRemaining(player.deathEndsAtMs)
  const total = Math.max(1, durationSeconds)
  const progress = Math.max(0, Math.min(1, remaining / total))

  return (
    <div className="fixed inset-0 z-[45] flex flex-col bg-void px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="alert-pulse pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
        <p className="text-xs font-bold uppercase tracking-[0.4em] text-muted">
          You were killed
        </p>
        <h2 className="mt-3 font-display text-5xl font-extrabold uppercase text-imposter">
          Stay silent
        </h2>
        <p className="mt-4 max-w-xs text-sm text-muted">
          {player.killedByName ? `${player.killedByName} killed you. ` : ''}
          Do not reveal anything. You become a ghost when the countdown ends.
        </p>
        <div
          className="relative mt-10 grid h-44 w-44 shrink-0 place-items-center"
          role="timer"
          aria-label={`${remaining} seconds until you become a ghost`}
        >
          <svg
            className="absolute inset-0 h-full w-full -rotate-90"
            viewBox="0 0 120 120"
            aria-hidden="true"
          >
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="8"
            />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="#ff3557"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 54}`}
              strokeDashoffset={`${(1 - progress) * 2 * Math.PI * 54}`}
            />
          </svg>
          <p className="relative z-10 font-display text-5xl font-extrabold tabular-nums">
            {remaining}
          </p>
        </div>
      </div>
      <p className="relative text-center text-xs font-bold uppercase tracking-[0.3em] text-imposter">
        No talking from now on
      </p>
    </div>
  )
}

function useRemaining(endsAtMs: number | null): number {
  return secondsRemaining(endsAtMs, useNow(200))
}
