import { useEffect, useState } from 'react'
import { cn } from '../cn'
import type { Player, Role } from '../types'
import { Button } from './Button'

export function RoleReveal({
  me,
  players,
  onDone,
}: {
  me: Player
  players: Player[]
  onDone: () => void
}) {
  const role = me.role ?? 'crewmate'
  const [phase, setPhase] = useState<'scan' | 'reveal'>('scan')
  const fellows = players.filter(
    (player) => player.role === 'imposter' && player.id !== me.id,
  )

  useEffect(() => {
    const id = window.setTimeout(() => setPhase('reveal'), 1400)
    return () => window.clearTimeout(id)
  }, [])

  const imposter = role === 'imposter'

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-void px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div
        className={cn(
          'pointer-events-none absolute inset-0 transition-opacity duration-700',
          phase === 'reveal' && imposter ? 'role-imposter' : '',
          phase === 'reveal' && !imposter ? 'role-crew' : '',
        )}
      />
      <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col items-center justify-center text-center">
        {phase === 'scan' ? (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.4em] text-muted">
              Role assignment
            </p>
            <h2 className="mt-4 font-display text-3xl font-extrabold uppercase tracking-widest text-fog">
              Scanning...
            </h2>
            <div className="mt-10 h-1 w-40 overflow-hidden rounded-full bg-line">
              <div className="scan-bar h-full w-1/2 bg-crew" />
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.4em] text-muted">
              You are
            </p>
            <h2
              className={cn(
                'mt-3 font-display text-5xl font-extrabold uppercase tracking-wide',
                imposter ? 'text-imposter' : 'text-crew',
              )}
            >
              {imposter ? 'Imposter' : 'Crewmate'}
            </h2>
            <p className="mt-4 max-w-xs text-base text-fog">
              {roleBlurb(role)}
            </p>
            {imposter ? (
              <div className="mt-8 w-full rounded-2xl border border-imposter/40 bg-imposter/10 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-imposter">
                  Your crew
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {fellows.length === 0
                    ? 'You are the only imposter.'
                    : fellows.map((player) => player.name).join(', ')}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className="relative mx-auto w-full max-w-md">
        <Button
          variant={imposter ? 'emergency' : 'crew'}
          disabled={phase !== 'reveal'}
          onClick={onDone}
        >
          {phase === 'reveal'
            ? imposter
              ? 'Start faking the tasks'
              : 'Start the tasks'
            : 'Hold on...'}
        </Button>
      </div>
    </div>
  )
}

function roleBlurb(role: Role): string {
  if (role === 'imposter') {
    return 'Blend in. Sabotage quietly. Do not get caught.'
  }
  return 'Complete the house tasks. Trust carefully. Call a meeting if something feels off.'
}
