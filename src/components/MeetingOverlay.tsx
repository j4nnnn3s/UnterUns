import { useState } from 'react'
import { cn } from '../cn'
import type { Game, Meeting, VoteCandidate } from '../types'
import { secondsRemaining, useNow } from '../game/time'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'

export function MeetingOverlay({
  game,
  meeting,
  isHost,
  isCaller,
  canDeactivateSabotage,
  onStart,
  onDismiss,
  onVote,
  onDeactivateSabotage,
}: {
  game: Game
  meeting: Meeting
  isHost: boolean
  isCaller: boolean
  canDeactivateSabotage: boolean
  onStart: () => void
  onDismiss: () => void
  onVote: (targetId: string) => Promise<void>
  onDeactivateSabotage: (code?: string) => Promise<void>
}) {
  const remaining = useRemaining(meeting.startedAtMs, game.discussionSeconds)
  const gathering = meeting.startedAtMs === null
  const total = game.discussionSeconds
  const progress = total <= 0 ? 0 : Math.max(0, remaining / total)
  const sabotageRemaining = useEndsRemaining(game.activeSabotage?.endsAtMs ?? null)
  const [sabotageCode, setSabotageCode] = useState('')
  const [fixingSabotage, setFixingSabotage] = useState(false)
  const [sabotageError, setSabotageError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmVote, setConfirmVote] = useState(false)
  const [voting, setVoting] = useState(false)
  const candidates = game.voteCandidates ?? []

  function fixSabotage(code?: string) {
    setSabotageError(null)
    setFixingSabotage(true)
    void onDeactivateSabotage(code)
      .then(() => setSabotageCode(''))
      .catch((error: unknown) => {
        setSabotageError(error instanceof Error ? error.message : 'Could not deactivate')
      })
      .finally(() => setFixingSabotage(false))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void/95 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div
        className={cn(
          'pointer-events-none absolute inset-0 opacity-40',
          meeting.kind === 'emergency' ? 'alert-pulse' : 'body-pulse',
        )}
      />
      <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col items-center justify-center overflow-y-auto py-4 text-center">
        {game.activeSabotage ? (
          <div className="mb-6 w-full rounded-2xl border border-imposter/50 bg-imposter/10 px-3 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-imposter">
              {game.activeSabotage.name} still active
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-warn">
              {formatTime(sabotageRemaining)}
            </p>
            {canDeactivateSabotage && game.activeSabotage.method === 'trust' ? (
              <button
                type="button"
                disabled={fixingSabotage}
                onClick={() => fixSabotage()}
                className="mt-2 min-h-10 w-full rounded-xl bg-crew px-3 text-sm font-bold text-void disabled:opacity-40"
              >
                Deactivate at location
              </button>
            ) : canDeactivateSabotage && game.activeSabotage.method === 'code' ? (
              <div className="mt-2 flex gap-2">
                <input
                  value={sabotageCode}
                  onChange={(event) =>
                    setSabotageCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 10),
                    )
                  }
                  placeholder="CODE"
                  className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-ink px-2 text-center font-display text-sm font-bold outline-none"
                />
                <button
                  type="button"
                  disabled={sabotageCode.length !== 10 || fixingSabotage}
                  onClick={() => fixSabotage(sabotageCode)}
                  className="rounded-xl bg-crew px-3 text-sm font-bold text-void disabled:opacity-40"
                >
                  Fix
                </button>
              </div>
            ) : game.activeSabotage.method === 'device' ? (
              <p className="mt-2 text-xs text-muted">Use the dedicated device to deactivate.</p>
            ) : null}
            {sabotageError ? (
              <p className="mt-2 text-xs text-imposter">{sabotageError}</p>
            ) : null}
          </div>
        ) : null}
        <p
          className={cn(
            'text-xs font-bold uppercase tracking-[0.35em]',
            meeting.kind === 'emergency' ? 'text-imposter' : 'text-warn',
          )}
        >
          {meeting.kind === 'emergency' ? 'Emergency meeting' : 'Body found'}
        </p>
        <h2
          className={cn(
            'mt-3 font-display text-4xl font-extrabold uppercase leading-none tracking-wide',
            meeting.kind === 'emergency' ? 'text-imposter' : 'text-warn',
          )}
        >
          {gathering ? 'Everyone gather' : 'Discussion'}
        </h2>
        <p className="mt-4 text-fog">
          Called by <span className="font-bold">{meeting.triggeredByName}</span>
        </p>
        <p className="mt-2 max-w-xs text-sm text-muted">
          {gathering
            ? `${meeting.triggeredByName} starts the timer when everyone is together.`
            : isCaller
              ? 'Discuss, then vote someone out. Their role is revealed and play continues.'
              : 'Discuss in person. The caller votes someone out when you are ready.'}
        </p>

        {gathering ? (
          <div className="mt-10 grid h-36 w-36 place-items-center rounded-full border-8 border-warn/30 bg-warn/10 font-display text-6xl font-black text-warn">
            !
          </div>
        ) : (
          <div
            className="relative mt-10 grid h-44 w-44 shrink-0 place-items-center"
            role="timer"
            aria-label={`${formatTime(remaining)} remaining`}
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
                stroke={meeting.kind === 'emergency' ? '#ff3557' : '#ffb020'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 54}`}
                strokeDashoffset={`${(1 - progress) * 2 * Math.PI * 54}`}
              />
            </svg>
            <p
              className="relative z-10 font-display text-5xl font-extrabold tabular-nums"
              aria-hidden="true"
            >
              {formatTime(remaining)}
            </p>
          </div>
        )}
      </div>

      {gathering && isCaller ? (
        <div className="relative mx-auto w-full max-w-md">
          <Button
            variant={meeting.kind === 'emergency' ? 'emergency' : 'report'}
            onClick={onStart}
          >
            Everyone is here — start timer
          </Button>
        </div>
      ) : gathering ? (
        <p className="relative text-center text-xs uppercase tracking-[0.25em] text-muted">
          Waiting for {meeting.triggeredByName} to start
        </p>
      ) : isCaller ? (
        <div className="relative mx-auto w-full max-w-md space-y-2">
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {candidates.map((candidate: VoteCandidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setSelectedId(candidate.id)}
                className={cn(
                  'flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-sm font-semibold',
                  selectedId === candidate.id
                    ? 'border-imposter bg-imposter/15 text-fog'
                    : 'border-line bg-panel-2',
                )}
              >
                {candidate.name}
                {selectedId === candidate.id ? (
                  <span className="text-xs uppercase tracking-wider text-imposter">
                    Selected
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <Button
            variant="emergency"
            disabled={!selectedId || voting}
            onClick={() => setConfirmVote(true)}
          >
            {voting ? 'Voting...' : 'Vote out'}
          </Button>
          <Button variant="ghost" disabled={voting} onClick={onDismiss}>
            Skip — resume play
          </Button>
        </div>
      ) : isHost ? (
        <div className="relative mx-auto w-full max-w-md">
          <Button variant="ghost" onClick={onDismiss}>
            Skip — resume play
          </Button>
        </div>
      ) : (
        <p className="relative text-center text-xs uppercase tracking-[0.25em] text-muted">
          Waiting for {meeting.triggeredByName} to vote
        </p>
      )}

      {confirmVote && selectedId ? (
        <ConfirmDialog
          title={`Vote out ${candidates.find((candidate) => candidate.id === selectedId)?.name}?`}
          message="Their role is revealed to everyone and they become a ghost."
          confirmLabel="Yes, vote them out"
          onConfirm={() => {
            setConfirmVote(false)
            setVoting(true)
            void onVote(selectedId).finally(() => setVoting(false))
          }}
          onCancel={() => setConfirmVote(false)}
        />
      ) : null}
    </div>
  )
}

function useRemaining(startedAtMs: number | null, durationSeconds: number): number {
  const now = useNow(200)
  if (startedAtMs === null) return durationSeconds
  return secondsRemaining(startedAtMs + durationSeconds * 1000, now)
}

function formatTime(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function useEndsRemaining(endsAtMs: number | null): number {
  return secondsRemaining(endsAtMs, useNow(200))
}
