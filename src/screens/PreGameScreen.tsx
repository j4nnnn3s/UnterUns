import { useState } from 'react'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MuteToggle } from '../components/MuteToggle'
import { Screen } from '../components/Screen'
import { useGame } from '../game/context'
import type { SabotageMethod } from '../types'

export function PreGameScreen() {
  const { game, players, me, start, backToLobby, leave, error } = useGame()
  const [busy, setBusy] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'lobby' | 'leave' | null>(null)

  if (!game || !me) return null

  return (
    <Screen>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-crew">
            Pre-game briefing
          </p>
          <h1 className="font-display text-2xl font-extrabold uppercase">
            Walk through the house
          </h1>
        </div>
        <MuteToggle />
      </header>

      <p className="mt-4 rounded-2xl border border-crew/30 bg-crew/10 px-4 py-3 text-sm text-fog">
        Review every location together. Roles and personal tasks are assigned only
        after the host starts the round.
      </p>

      <section className="mt-6">
        <div className="flex items-end justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
            Players
          </h2>
          <span className="text-xs text-muted">{players.length} ready</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {players.map((player) => (
            <span
              key={player.id}
              className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm"
            >
              {player.name}
              {player.id === me.id ? <span className="ml-1 text-muted">· you</span> : null}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
            All house tasks
          </h2>
          <span className="text-xs text-muted">{game.tasks.length}</span>
        </div>
        <ul className="mt-2 space-y-2">
          {game.tasks.map((task) => (
            <li
              key={task.id}
              className="overflow-hidden rounded-xl border border-line bg-panel"
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedTaskId(expandedTaskId === task.id ? null : task.id)
                }
                aria-expanded={expandedTaskId === task.id}
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left"
              >
                <span className="shrink-0 rounded-full bg-crew/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-crew">
                  {task.room}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {task.text}
                </span>
                <span className="text-muted">{expandedTaskId === task.id ? '−' : '+'}</span>
              </button>
              {expandedTaskId === task.id ? (
                <p className="border-t border-line px-3 py-2 text-sm text-muted">
                  {task.details || 'No additional instructions.'}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
            Sabotages
          </h2>
          <span className="text-xs text-muted">{game.sabotages.length}</span>
        </div>
        {game.sabotages.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {game.sabotages.map((sabotage) => (
              <li
                key={sabotage.id}
                className="rounded-xl border border-imposter/25 bg-imposter/5 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{sabotage.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Deactivate in {sabotage.room} · {methodLabel(sabotage.method)}
                    </p>
                  </div>
                  <span className="shrink-0 font-display text-sm font-bold text-warn">
                    {formatDuration(sabotage.timerSeconds)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
            No sabotages configured.
          </p>
        )}
      </section>

      {error ? <p className="mt-4 text-sm text-imposter">{error}</p> : null}

      <div className="mt-auto space-y-3 pt-8">
        {me.isHost ? (
          <>
            <Button
              variant="emergency"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void start().finally(() => setBusy(false))
              }}
            >
              {busy ? 'Assigning roles...' : 'Everyone is ready — start round'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm('lobby')}>
              Back to lobby settings
            </Button>
          </>
        ) : (
          <>
            <p className="text-center text-xs uppercase tracking-[0.2em] text-muted">
              Waiting for the host to start the round
            </p>
            <Button variant="ghost" onClick={() => setConfirm('leave')}>
              Leave briefing
            </Button>
          </>
        )}
      </div>

      {confirm === 'lobby' ? (
        <ConfirmDialog
          title="Back to lobby?"
          message="This cancels the briefing and returns everyone to lobby settings."
          confirmLabel="Yes, back to lobby"
          onConfirm={() => {
            setConfirm(null)
            void backToLobby()
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'leave' ? (
        <ConfirmDialog
          title="Leave the briefing?"
          message="You will disconnect. The others stay in the briefing."
          confirmLabel="Yes, leave"
          onConfirm={() => {
            setConfirm(null)
            void leave()
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </Screen>
  )
}

function methodLabel(method: SabotageMethod): string {
  if (method === 'code') return 'written code'
  if (method === 'device') return 'dedicated device'
  return 'trust confirmation'
}

function formatDuration(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
