import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { cn } from '../cn'
import { useGame } from '../game/context'
import { secondsRemaining, useNow } from '../game/time'
import type { DashboardPlayer, WinReason } from '../types'

export function DashboardScreen() {
  const { dashboard, leaveDevice, error } = useGame()
  const now = useNow(500)

  if (!dashboard) return null

  const { done, total } = dashboard.taskProgress
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const ended = dashboard.status === 'ended'
  const meeting = dashboard.meeting

  return (
    <Screen className="!max-w-5xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-crew">
            House dashboard
          </p>
          <h1 className="font-display text-3xl font-extrabold uppercase">UnterUns</h1>
        </div>
        <StatusBadge
          status={dashboard.status}
          winner={dashboard.winner}
          meetingKind={meeting?.kind ?? null}
        />
      </header>

      {ended ? (
        <WinBanner winner={dashboard.winner} reason={dashboard.winReason} />
      ) : meeting ? (
        <p className="mt-4 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-center text-sm font-semibold text-warn">
          {meeting.kind === 'emergency'
            ? 'Emergency meeting'
            : meeting.reportedPlayerName
              ? `Body found: ${meeting.reportedPlayerName}`
              : 'Body found'}{' '}
          · called by {meeting.triggeredByName}
        </p>
      ) : dashboard.ejection ? (
        <p className="mt-4 rounded-2xl border border-line bg-panel px-4 py-3 text-center text-sm text-fog">
          Last ejected: <span className="font-bold">{dashboard.ejection.name}</span> was{' '}
          <span
            className={
              dashboard.ejection.role === 'imposter' ? 'text-imposter' : 'text-crew'
            }
          >
            {dashboard.ejection.role === 'imposter' ? 'an imposter' : 'a crewmate'}
          </span>
        </p>
      ) : null}

      <section className="mt-5 rounded-3xl border border-line bg-panel px-4 py-4">
        <div className="flex items-end justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
            Task progress
          </p>
          <p className="font-display text-4xl font-extrabold text-fog">{percent}%</p>
        </div>
        <div className="mt-3 h-4 overflow-hidden rounded-full bg-ink">
          <div
            className="h-full rounded-full bg-ok transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {done}/{total} crewmate tasks done · 100% is a crewmate win
        </p>
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
            Players
          </h2>
          <p className="text-xs text-muted">
            {dashboard.players.filter((player) => player.alive).length} alive
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {dashboard.players.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
            Sabotages
          </h2>
          <p className="text-xs text-muted">{dashboard.sabotages.length}</p>
        </div>
        {dashboard.sabotages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-center text-sm text-muted">
            No sabotages configured.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {dashboard.sabotages.map((sabotage) => {
              const remaining = secondsRemaining(sabotage.endsAtMs, now)
              return (
                <div
                  key={sabotage.id}
                  className={cn(
                    'rounded-2xl border px-4 py-3',
                    sabotage.active
                      ? 'border-imposter/50 bg-imposter/10'
                      : 'border-line bg-panel',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{sabotage.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{sabotage.room}</p>
                    </div>
                    {sabotage.active ? (
                      <p className="font-display text-xl font-extrabold tabular-nums text-warn">
                        {formatDuration(remaining)}
                      </p>
                    ) : (
                      <p className="text-xs font-bold uppercase tracking-wider text-muted">
                        Idle
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {error ? <p className="mt-4 text-sm text-imposter">{error}</p> : null}

      <div className="mt-auto pt-8">
        <Button variant="ghost" onClick={leaveDevice}>
          Disconnect dashboard
        </Button>
      </div>
    </Screen>
  )
}

function PlayerCard({ player }: { player: DashboardPlayer }) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-3 py-3',
        player.alive ? 'border-line bg-panel' : 'border-imposter/30 bg-imposter/5 opacity-80',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 text-sm font-extrabold text-void"
          style={{ backgroundColor: player.color, borderColor: '#ffffff55' }}
        >
          {player.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{player.name}</p>
          {player.alive ? (
            <p className="text-xs font-bold uppercase tracking-wider text-ok">Alive</p>
          ) : (
            <p
              className={cn(
                'text-xs font-bold uppercase tracking-wider',
                player.role === 'imposter' ? 'text-imposter' : 'text-crew',
              )}
            >
              Dead · {player.role === 'imposter' ? 'Imposter' : 'Crewmate'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  winner,
  meetingKind,
}: {
  status: string
  winner: 'imposters' | 'crewmates' | null
  meetingKind: 'emergency' | 'body' | null
}) {
  if (status === 'ended') {
    return (
      <span
        className={cn(
          'rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider',
          winner === 'crewmates'
            ? 'bg-crew/15 text-crew'
            : 'bg-imposter/15 text-imposter',
        )}
      >
        {winner === 'crewmates' ? 'Crew wins' : 'Imposters win'}
      </span>
    )
  }
  if (status === 'meeting') {
    return (
      <span className="rounded-full bg-warn/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-warn">
        {meetingKind === 'emergency' ? 'Emergency' : 'Meeting'}
      </span>
    )
  }
  if (status === 'playing') {
    return (
      <span className="rounded-full bg-ok/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-ok">
        In play
      </span>
    )
  }
  return (
    <span className="rounded-full bg-fog/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted">
      {status === 'pregame' ? 'Briefing' : 'Lobby'}
    </span>
  )
}

function WinBanner({
  winner,
  reason,
}: {
  winner: 'imposters' | 'crewmates' | null
  reason: WinReason | null
}) {
  const crew = winner === 'crewmates'
  return (
    <div
      className={cn(
        'mt-4 rounded-3xl border px-4 py-5 text-center',
        crew ? 'border-crew/40 bg-crew/10' : 'border-imposter/40 bg-imposter/10',
      )}
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted">
        {winReasonLabel(reason, crew)}
      </p>
      <p
        className={cn(
          'mt-2 font-display text-4xl font-extrabold uppercase',
          crew ? 'text-crew' : 'text-imposter',
        )}
      >
        {crew ? 'Crewmates win' : 'Imposters win'}
      </p>
    </div>
  )
}

function winReasonLabel(reason: WinReason | null, crew: boolean): string {
  if (crew) return reason === 'tasks' ? 'Tasks completed' : 'The imposters were voted out'
  if (reason === 'sabotage') return 'Sabotage succeeded'
  if (reason === 'kills') return 'The crew is gone'
  if (reason === 'votes') return 'The crew voted out a crewmate'
  return 'Tasks completed'
}

function formatDuration(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
