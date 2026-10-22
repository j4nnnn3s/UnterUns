import { useMemo, useState } from 'react'
import { Button } from '../components/Button'
import { cn } from '../cn'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DeathOverlay } from '../components/DeathOverlay'
import { InfoDialog } from '../components/InfoDialog'
import { MeetingOverlay } from '../components/MeetingOverlay'
import { MuteToggle } from '../components/MuteToggle'
import { RoleReveal } from '../components/RoleReveal'
import { Screen } from '../components/Screen'
import { TaskList } from '../components/TaskList'
import { useGame } from '../game/context'
import { secondsRemaining, useNow } from '../game/time'
import type { Game, KillCandidate, MeetingKind, WinReason } from '../types'

export function PlayScreen() {
  const {
    game,
    players,
    me,
    checkTask,
    getKillCandidates,
    reportKilled,
    activateSabotage,
    deactivateSabotage,
    triggerMeeting,
    startMeeting,
    dismissMeeting,
    voteOut,
    backToLobby,
    leave,
    error,
  } = useGame()
  const [busy, setBusy] = useState(false)
  const [dismissedRevealKey, setDismissedRevealKey] = useState('')
  const [showImposters, setShowImposters] = useState(false)
  const [killCandidates, setKillCandidates] = useState<KillCandidate[] | null>(null)
  const [selectedKillerId, setSelectedKillerId] = useState('')
  const [reportingKill, setReportingKill] = useState(false)
  const [bodyCandidates, setBodyCandidates] = useState<Array<{ id: string; name: string }> | null>(
    null,
  )
  const [selectedBodyId, setSelectedBodyId] = useState('')
  const [reportingBody, setReportingBody] = useState(false)
  const [noBodyFound, setNoBodyFound] = useState(false)
  const [hatMeetingId, setHatMeetingId] = useState('')
  const [deactivationCode, setDeactivationCode] = useState('')
  const [sabotageBusy, setSabotageBusy] = useState(false)
  const [confirm, setConfirm] = useState<'lobby' | 'leave' | null>(null)
  const [info, setInfo] = useState<InfoKey | null>(null)
  const [dismissedEjection, setDismissedEjection] = useState('')
  const [disguiseAsCrew, setDisguiseAsCrew] = useState(false)
  const now = useNow(500)

  const revealKey = useMemo(
    () => (game ? `amonghaus.reveal.${game.code}.${game.roundId}` : ''),
    [game],
  )
  const showReveal =
    Boolean(game && me?.role) &&
    dismissedRevealKey !== revealKey &&
    (revealKey === '' || sessionStorage.getItem(revealKey) !== '1')

  if (!game || !me) return null

  const { done, total } = game.taskProgress
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const imposters = players.filter((player) => player.role === 'imposter')
  const isImposter = me.role === 'imposter'
  const isGhost = me.lifeStatus === 'ghost'
  const canReportKill = me.role === 'crewmate' && me.lifeStatus === 'alive'
  const canCallMeeting = me.lifeStatus === 'alive'
  const emergenciesLeft = Math.max(
    0,
    game.emergencyMeetingsPerPlayer - me.emergencyMeetingsUsed,
  )
  const globalKillRemaining = secondsRemaining(game.globalKillCooldownEndsAtMs, now)
  const personalKillRemaining = secondsRemaining(me.killCooldownEndsAtMs, now)
  const sabotageCooldownRemaining = secondsRemaining(game.sabotageCooldownEndsAtMs, now)
  const emergencyCooldownRemaining = secondsRemaining(game.emergencyCooldownEndsAtMs, now)
  const canCallEmergency =
    canCallMeeting &&
    game.status === 'playing' &&
    emergenciesLeft > 0 &&
    emergencyCooldownRemaining <= 0 &&
    game.activeSabotage === null
  const showHatReminder =
    game.status === 'meeting' &&
    game.meeting !== null &&
    hatMeetingId !== game.meeting.id &&
    (me.lifeStatus === 'ghost' || me.lifeStatus === 'dying') &&
    me.killedInRoundId === game.roundId &&
    me.id !== game.meeting.reportedPlayerId
  const activeSabotageRemaining = secondsRemaining(game.activeSabotage?.endsAtMs ?? null, now)
  const canDeactivateSabotage =
    me.role === 'crewmate' && me.lifeStatus === 'alive' && game.activeSabotage !== null

  function dismissReveal() {
    sessionStorage.setItem(revealKey, '1')
    setDismissedRevealKey(revealKey)
  }

  async function onMeeting(kind: MeetingKind) {
    setBusy(true)
    try {
      await triggerMeeting(kind)
    } finally {
      setBusy(false)
    }
  }

  function openBodyReport() {
    if (!game || !me) return
    const aliveIds = new Set(game.roundAlivePlayerIds)
    const candidates = players
      .filter((player) => aliveIds.has(player.id) && player.id !== me.id)
      .map((player) => ({ id: player.id, name: player.name }))
    setBodyCandidates(candidates)
    setSelectedBodyId(candidates[0]?.id ?? '')
  }

  async function submitBodyReport() {
    if (!selectedBodyId) return
    setReportingBody(true)
    try {
      await triggerMeeting('body', selectedBodyId)
      setBodyCandidates(null)
      setSelectedBodyId('')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message === 'No body found') {
        setBodyCandidates(null)
        setSelectedBodyId('')
        setNoBodyFound(true)
      }
    } finally {
      setReportingBody(false)
    }
  }

  async function openKillReport() {
    setReportingKill(true)
    try {
      const candidates = await getKillCandidates()
      setKillCandidates(candidates)
      setSelectedKillerId(candidates[0]?.id ?? '')
    } catch {
      // The shared error message explains why no kill can be reported.
    } finally {
      setReportingKill(false)
    }
  }

  async function submitKillReport() {
    if (!selectedKillerId) return
    setReportingKill(true)
    try {
      await reportKilled(selectedKillerId)
      setKillCandidates(null)
      setSelectedKillerId('')
    } catch {
      // Keep the dialog open so the shared error remains visible.
    } finally {
      setReportingKill(false)
    }
  }

  async function fixActiveSabotage() {
    setSabotageBusy(true)
    try {
      await deactivateSabotage(deactivationCode || undefined)
      setDeactivationCode('')
    } catch {
      // The shared error is shown with the sabotage controls.
    } finally {
      setSabotageBusy(false)
    }
  }

  return (
    <Screen>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted">
            {game.code} · in play
          </p>
          <h1 className="font-display text-2xl font-extrabold uppercase">
            {me.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isImposter ? (
            disguiseAsCrew ? (
              <button
                type="button"
                onClick={() => setDisguiseAsCrew(false)}
                aria-label="Show imposter identity"
                className="rounded-full bg-crew/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-crew"
              >
                Crewmate
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDisguiseAsCrew(true)}
                  aria-label="Hide imposter identity"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-muted"
                >
                  <EyeOffIcon />
                </button>
                <button
                  type="button"
                  onClick={() => setShowImposters(true)}
                  aria-haspopup="dialog"
                  className="rounded-full bg-imposter/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-imposter"
                >
                  Imposter
                </button>
              </div>
            )
          ) : isGhost ? (
            <span className="rounded-full bg-fog/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted">
              Ghost
            </span>
          ) : (
            <span className="rounded-full bg-crew/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-crew">
              Crewmate
            </span>
          )}
          <MuteToggle />
        </div>
      </header>

      <CooldownStatus
        className="mt-3"
        label="Global cooldown"
        remaining={globalKillRemaining}
        onClick={() => setInfo('globalKill')}
      />

      <button
        type="button"
        onClick={() => setInfo('tasks')}
        aria-haspopup="dialog"
        className="mt-3 w-full rounded-3xl border border-line bg-panel px-4 py-4 text-left"
      >
        <div className="flex items-end justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
            Task progress
          </p>
          <p className="font-display text-3xl font-extrabold text-fog">{percent}%</p>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink">
          <div
            className="h-full rounded-full bg-ok transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {done}/{total} crewmate tasks done · tap for info
        </p>
      </button>

      {isGhost ? (
        <section className="mt-3 rounded-2xl border border-fog/10 bg-fog/5 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
            Ghost
          </p>
          <p className="mt-1 text-sm text-fog">
            Stay silent and attend every meeting. Your remaining tasks still
            count on the bar — 100% is a crewmate win.
          </p>
        </section>
      ) : null}

      {game.activeSabotage ? (
        <section className="mt-4 rounded-3xl border border-imposter/50 bg-imposter/10 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-imposter">
                Sabotage active
              </p>
              <h2 className="mt-1 font-display text-xl font-extrabold uppercase">
                {game.activeSabotage.name}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Deactivate in {game.activeSabotage.room}
              </p>
            </div>
            <p className="font-display text-2xl font-extrabold tabular-nums text-warn">
              {formatDuration(activeSabotageRemaining)}
            </p>
          </div>
          {canDeactivateSabotage && game.activeSabotage.method === 'trust' ? (
            <button
              type="button"
              disabled={sabotageBusy}
              onClick={() => void fixActiveSabotage()}
              className="mt-4 min-h-11 w-full rounded-xl bg-crew px-3 font-bold text-void disabled:opacity-40"
            >
              {sabotageBusy ? 'Deactivating...' : 'I am at the location — deactivate'}
            </button>
          ) : canDeactivateSabotage && game.activeSabotage.method === 'code' ? (
            <div className="mt-4 flex gap-2">
              <input
                value={deactivationCode}
                onChange={(event) =>
                  setDeactivationCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 10),
                  )
                }
                maxLength={10}
                placeholder="DEACTIVATION CODE"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 text-center font-display text-sm font-bold tracking-wider outline-none focus:border-crew"
              />
              <button
                type="button"
                disabled={deactivationCode.length !== 10 || sabotageBusy}
                onClick={() => void fixActiveSabotage()}
                className="rounded-xl bg-crew px-4 font-bold text-void disabled:opacity-40"
              >
                Fix
              </button>
            </div>
          ) : game.activeSabotage.method === 'device' ? (
            <p className="mt-3 text-xs text-muted">
              This sabotage can only be deactivated on its dedicated device.
            </p>
          ) : !isImposter ? (
            <p className="mt-3 text-xs text-muted">
              Only a living crewmate can deactivate this sabotage.
            </p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-imposter">{error}</p> : null}
        </section>
      ) : null}

      <section className="mt-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-muted">
          {isImposter ? 'Fake the tasks' : 'Your tasks'}
        </h2>
        <TaskList tasks={game.tasks} onToggle={(id) => void checkTask(id)} />
      </section>

      <div className="mt-auto space-y-3 pt-6">
        {error ? <p className="text-center text-sm text-imposter">{error}</p> : null}
        {canReportKill ? (
          <Button
            variant="danger"
            disabled={reportingKill}
            onClick={() => void openKillReport()}
          >
            {reportingKill ? 'Checking...' : 'I was killed'}
          </Button>
        ) : isImposter && me.lifeStatus === 'alive' ? (
          <Button
            variant="danger"
            tabIndex={-1}
            aria-disabled="true"
            className="pointer-events-none"
          >
            I was killed
          </Button>
        ) : null}
        {canCallMeeting ? (
          <div className="space-y-2">
            <CooldownStatus
              label="Emergency cooldown"
              remaining={emergencyCooldownRemaining}
              onClick={() => setInfo('emergency')}
            />
            <Button
              variant="report"
              size="xl"
              disabled={busy || !canCallEmergency}
              onClick={() => void onMeeting('emergency')}
            >
              {busy
                ? 'Calling...'
                : game.activeSabotage
                  ? 'Cannot call during sabotage'
                  : emergenciesLeft === 0
                    ? 'No emergency meetings left'
                    : emergencyCooldownRemaining > 0
                      ? `Emergency in ${formatDuration(emergencyCooldownRemaining)}`
                      : `Emergency meeting · ${emergenciesLeft} left`}
            </Button>
            <Button
              variant="emergency"
              size="xl"
              disabled={busy || reportingBody || game.status !== 'playing'}
              onClick={() => openBodyReport()}
            >
              {reportingBody ? 'Checking...' : 'Body found'}
            </Button>
          </div>
        ) : (
          <p className="rounded-2xl border border-line bg-panel px-4 py-3 text-center text-sm text-muted">
            Ghosts attend meetings but cannot call one.
          </p>
        )}
        {me.isHost ? (
          <Button variant="ghost" onClick={() => setConfirm('lobby')}>
            Return to lobby
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setConfirm('leave')}>
            Leave game
          </Button>
        )}
        {isImposter ? (
          <div className="grid grid-cols-2 gap-2">
            <CooldownStatus
              label="Your cooldown"
              remaining={personalKillRemaining}
              readyLabel={
                globalKillRemaining > 0 ? 'Wait for the global cooldown' : undefined
              }
              onClick={() => setInfo('personalKill')}
            />
            <CooldownStatus
              label="Sabotage cooldown"
              remaining={sabotageCooldownRemaining}
              onClick={() => setInfo('sabotage')}
            />
          </div>
        ) : null}
        {isImposter && game.sabotages.length > 0 ? (
          <section className="pt-3">
            <p className="mb-2 text-center text-[0.65rem] font-bold uppercase tracking-[0.25em] text-muted">
              Sabotage
            </p>
            <div className="space-y-2">
              {game.sabotages.map((sabotage) => (
                <button
                  key={sabotage.id}
                  type="button"
                  disabled={
                    sabotageBusy ||
                    game.status !== 'playing' ||
                    game.activeSabotage !== null ||
                    sabotageCooldownRemaining > 0
                  }
                  onClick={() => {
                    setSabotageBusy(true)
                    void activateSabotage(sabotage.id)
                      .catch(() => {
                        // The shared error is displayed above.
                      })
                      .finally(() => setSabotageBusy(false))
                  }}
                  className="min-h-11 w-full rounded-xl border border-imposter/30 bg-imposter/5 px-3 text-sm font-bold text-imposter disabled:opacity-30"
                >
                  Activate {sabotage.name}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {bodyCandidates ? (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-void/80 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="body-title"
        >
          <div className="w-full max-w-sm rounded-3xl border border-imposter/40 bg-panel px-5 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-imposter">
              Report a body
            </p>
            <h2
              id="body-title"
              className="mt-2 font-display text-2xl font-extrabold uppercase"
            >
              Who did you find?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Choose the player, then confirm. Only a kill from this round can
              start a meeting.
            </p>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {bodyCandidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-panel-2 px-3"
                >
                  <input
                    type="radio"
                    name="body"
                    value={candidate.id}
                    checked={selectedBodyId === candidate.id}
                    onChange={() => setSelectedBodyId(candidate.id)}
                    className="accent-imposter"
                  />
                  <span className="font-semibold">{candidate.name}</span>
                </label>
              ))}
            </div>
            {error ? <p className="mt-3 text-sm text-imposter">{error}</p> : null}
            <div className="mt-5 space-y-2">
              <Button
                variant="emergency"
                disabled={!selectedBodyId || reportingBody}
                onClick={() => void submitBodyReport()}
              >
                {reportingBody ? 'Reporting...' : 'Confirm body'}
              </Button>
              <Button variant="ghost" onClick={() => setBodyCandidates(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {killCandidates ? (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-void/80 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="killer-title"
        >
          <div className="w-full max-w-sm rounded-3xl border border-imposter/40 bg-panel px-5 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-imposter">
              Report your death
            </p>
            <h2
              id="killer-title"
              className="mt-2 font-display text-2xl font-extrabold uppercase"
            >
              Who killed you?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Choose the killer, then stay silent. This list is private.
            </p>
            <div className="mt-4 space-y-2">
              {killCandidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-panel-2 px-3"
                >
                  <input
                    type="radio"
                    name="killer"
                    value={candidate.id}
                    checked={selectedKillerId === candidate.id}
                    onChange={() => setSelectedKillerId(candidate.id)}
                    className="accent-imposter"
                  />
                  <span className="font-semibold">{candidate.name}</span>
                </label>
              ))}
            </div>
            {error ? <p className="mt-3 text-sm text-imposter">{error}</p> : null}
            <div className="mt-5 space-y-2">
              <Button
                variant="emergency"
                disabled={!selectedKillerId || reportingKill}
                onClick={() => void submitKillReport()}
              >
                {reportingKill ? 'Reporting...' : 'Confirm killer'}
              </Button>
              <Button variant="ghost" onClick={() => setKillCandidates(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showReveal && me.role ? (
        <RoleReveal me={me} players={players} onDone={dismissReveal} />
      ) : null}

      {showImposters ? (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-void/80 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="imposter-team-title"
        >
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setShowImposters(false)}
            aria-label="Close imposter team"
          />
          <div className="relative w-full max-w-sm rounded-3xl border border-imposter/40 bg-panel px-5 py-5 shadow-[0_0_60px_rgba(255,53,87,0.2)]">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-imposter">
              Your team
            </p>
            <h2
              id="imposter-team-title"
              className="mt-2 font-display text-2xl font-extrabold uppercase"
            >
              Imposters
            </h2>
            <p className="mt-4 text-lg font-semibold">
              {imposters.length === 1
                ? 'You are the only imposter.'
                : imposters.map((player) => player.name).join(' · ')}
            </p>
            <p className="mt-2 text-sm text-muted">
              Blend in. Fake the tasks. Do not get caught.
            </p>
            <div className="mt-5">
              <Button variant="emergency" onClick={() => setShowImposters(false)}>
                Back to tasks
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {me.lifeStatus === 'dying' ? (
        <DeathOverlay player={me} durationSeconds={game.deathSeconds} />
      ) : null}

      {game.status === 'ended' && game.winner === 'imposters' ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-void px-4 py-6">
          <div className="role-imposter pointer-events-none absolute inset-0" />
          <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
            <p className="text-xs font-bold uppercase tracking-[0.4em] text-muted">
              {imposterWinLabel(game.winReason)}
            </p>
            <h2 className="mt-3 font-display text-5xl font-extrabold uppercase text-imposter">
              Imposters win
            </h2>
            <p className="mt-4 text-muted">{imposterWinCopy(game)}</p>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            {me.isHost ? (
              <Button variant="emergency" onClick={() => setConfirm('lobby')}>
                Return to lobby
              </Button>
            ) : (
              <p className="text-center text-xs uppercase tracking-[0.25em] text-muted">
                Waiting for the host
              </p>
            )}
          </div>
        </div>
      ) : null}

      {game.status === 'ended' && game.winner === 'crewmates' ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-void px-4 py-6">
          <div className="role-crew pointer-events-none absolute inset-0" />
          <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
            <p className="text-xs font-bold uppercase tracking-[0.4em] text-muted">
              {game.winReason === 'tasks' ? 'Tasks complete' : 'Voted out'}
            </p>
            <h2 className="mt-3 font-display text-5xl font-extrabold uppercase text-crew">
              Crewmates win
            </h2>
            <p className="mt-4 text-muted">
              {game.winReason === 'tasks'
                ? 'Every crewmate task was finished.'
                : game.ejection
                  ? `${game.ejection.name} was an imposter.`
                  : 'All imposters were voted out.'}
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            {me.isHost ? (
              <Button variant="crew" onClick={() => setConfirm('lobby')}>
                Return to lobby
              </Button>
            ) : (
              <p className="text-center text-xs uppercase tracking-[0.25em] text-muted">
                Waiting for the host
              </p>
            )}
          </div>
        </div>
      ) : null}

      {game.status === 'playing' &&
      game.ejection &&
      dismissedEjection !== `${game.roundId}:${game.ejection.playerId}` ? (
        <div className="fixed inset-0 z-[55] grid place-items-center bg-void/90 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-line bg-panel px-5 py-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted">
              Voted out
            </p>
            <h2 className="mt-3 font-display text-4xl font-extrabold uppercase">
              {game.ejection.name}
            </h2>
            <p
              className={`mt-4 font-display text-2xl font-extrabold uppercase ${
                game.ejection.role === 'imposter' ? 'text-imposter' : 'text-crew'
              }`}
            >
              {game.ejection.role === 'imposter' ? 'Imposter' : 'Crewmate'}
            </p>
            <div className="mt-6">
              <Button
                variant="ghost"
                onClick={() =>
                  setDismissedEjection(`${game.roundId}:${game.ejection!.playerId}`)
                }
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {noBodyFound ? (
        <InfoDialog
          title="No body found"
          message="Play continues. Only a player killed this round can be reported."
          onClose={() => setNoBodyFound(false)}
        />
      ) : null}

      {info ? (
        <InfoDialog
          title={INFO[info].title}
          message={INFO[info].message}
          onClose={() => setInfo(null)}
        />
      ) : null}

      {confirm === 'lobby' ? (
        <ConfirmDialog
          title="Return to lobby?"
          message="This ends the current round for everyone and sends the group back to lobby settings."
          confirmLabel="Yes, return to lobby"
          onConfirm={() => {
            setConfirm(null)
            void backToLobby()
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'leave' ? (
        <ConfirmDialog
          title="Leave the game?"
          message="You will disconnect from this round. The others keep playing."
          confirmLabel="Yes, leave game"
          onConfirm={() => {
            setConfirm(null)
            void leave()
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {game.status === 'meeting' && game.meeting ? (
        <MeetingOverlay
          game={game}
          meeting={game.meeting}
          isHost={me.isHost}
          isCaller={game.meeting.triggeredById === me.id}
          canDeactivateSabotage={canDeactivateSabotage}
          onStart={() => void startMeeting()}
          onDismiss={() => void dismissMeeting()}
          onVote={(targetId) => voteOut(targetId)}
          onDeactivateSabotage={deactivateSabotage}
        />
      ) : null}

      {showHatReminder && game.meeting ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-void/85 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hat-title"
        >
          <div
            className={cn(
              'relative w-full max-w-sm rounded-3xl border bg-panel px-5 py-6',
              game.meeting.kind === 'emergency' ? 'border-warn/50' : 'border-imposter/50',
            )}
          >
            <p
              className={cn(
                'text-xs font-bold uppercase tracking-[0.3em]',
                game.meeting.kind === 'emergency' ? 'text-warn' : 'text-imposter',
              )}
            >
              Meeting called
            </p>
            <h2
              id="hat-title"
              className="mt-2 font-display text-2xl font-extrabold uppercase"
            >
              Bring your hat
            </h2>
            <p className="mt-3 text-sm text-fog">
              You were killed this round, but your body wasn't found. Before you
              go to the meeting, go back to the crime scene and take your hat
              with you to the meeting hall. Leave it there for the rest of the
              game and continue as a ghost.
            </p>
            <div className="mt-5">
              <Button
                variant={game.meeting.kind === 'emergency' ? 'report' : 'emergency'}
                onClick={() => setHatMeetingId(game.meeting!.id)}
              >
                I'll bring my hat
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Screen>
  )
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A10.6 10.6 0 0 1 12 5c7 0 10 7 10 7a13.1 13.1 0 0 1-1.7 2.5" />
      <path d="M6.1 6.1A13.4 13.4 0 0 0 2 12s3 7 10 7a10.4 10.4 0 0 0 4.4-.9" />
    </svg>
  )
}

function CooldownStatus({
  label,
  remaining,
  readyLabel,
  className,
  onClick,
}: {
  label: string
  remaining: number
  readyLabel?: string
  className?: string
  onClick: () => void
}) {
  const ready = remaining <= 0 && !readyLabel
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cn(
        'w-full rounded-xl border border-line bg-panel px-3 py-2 text-left',
        className,
      )}
    >
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted">
        {label}
        <span className="ml-1 font-semibold text-muted/70">· info</span>
      </p>
      <p className={ready ? 'mt-1 font-bold text-ok' : 'mt-1 font-display font-bold text-warn'}>
        {remaining > 0 ? formatDuration(remaining) : readyLabel ?? 'Ready'}
      </p>
    </button>
  )
}

type InfoKey = 'tasks' | 'globalKill' | 'personalKill' | 'sabotage' | 'emergency'

const INFO: Record<InfoKey, { title: string; message: string }> = {
  tasks: {
    title: 'Task progress',
    message:
      'This bar is the same on every phone. It only counts crewmate tasks — imposter fakes do not move it. When it hits 100%, the crewmates win.',
  },
  globalKill: {
    title: 'Global kill cooldown',
    message:
      'Nobody can be killed until this shared timer ends. It starts at the beginning of a round and again after every meeting.',
  },
  personalKill: {
    title: 'Your kill cooldown',
    message:
      'After you kill someone, only you wait this long before you can kill again. Other imposters still have their own timers. This also stays unavailable while the global cooldown is running.',
  },
  sabotage: {
    title: 'Sabotage cooldown',
    message:
      'After a sabotage is repaired, no imposter can start another one until this shared timer ends.',
  },
  emergency: {
    title: 'Emergency meetings',
    message:
      'Each living player has a limited number of emergency meetings per round. They cannot be called during the opening cooldown, during the cooldown after any meeting, or while a sabotage is active. Body found reports ignore those limits and end an active sabotage.',
  },
}

function formatDuration(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function imposterWinLabel(reason: WinReason | null): string {
  if (reason === 'sabotage') return 'Sabotage succeeded'
  if (reason === 'kills') return 'The crew is gone'
  if (reason === 'votes') return 'Wrong ejection'
  return 'Tasks completed'
}

function imposterWinCopy(game: Game): string {
  if (game.winReason === 'sabotage') {
    return `${game.activeSabotage?.name ?? 'The sabotage'} was not fixed in time.`
  }
  if (game.winReason === 'kills') {
    return 'Everyone except the imposters is dead.'
  }
  if (game.winReason === 'votes' && game.ejection) {
    return `${game.ejection.name} was a crewmate.`
  }
  return 'Every crewmate task was finished.'
}
