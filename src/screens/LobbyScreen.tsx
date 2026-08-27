import { useState, type ChangeEvent } from 'react'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MuteToggle } from '../components/MuteToggle'
import { PlayerChip } from '../components/PlayerChip'
import { Screen } from '../components/Screen'
import { useGame } from '../game/context'
import { createTask } from '../game/defaults'
import { createId } from '../id'
import type { Sabotage, SabotageMethod, Task } from '../types'

export function LobbyScreen() {
  const {
    game,
    players,
    me,
    setImpostorCount,
    setDiscussionSeconds,
    setDeathSeconds,
    setKillerCooldownSeconds,
    setInitialKillCooldownSeconds,
    setPostMeetingKillCooldownSeconds,
    setSabotageCooldownSeconds,
    setSabotages,
    setEmergencyMeetingsPerPlayer,
    setInitialEmergencyCooldownSeconds,
    setPostMeetingEmergencyCooldownSeconds,
    regenerateDashboardCode,
    setDashboardCode,
    setTasksPerPlayer,
    setTasks,
    startPregame,
    leave,
    error,
  } = useGame()
  const [busy, setBusy] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  if (!game || !me) return null

  const isHost = me.isHost
  const joinCode = game.code
  const canStart =
    players.length >= 3 &&
    game.impostorCount >= 1 &&
    game.impostorCount < players.length / 2

  async function copyCode() {
    const url = `${window.location.origin}${window.location.pathname}?code=${joinCode}`
    try {
      await copyText(url)
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1600)
    } catch {
      setCopyStatus('failed')
    }
  }

  return (
    <Screen>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted">
            Lobby
          </p>
          <h1 className="font-display text-2xl font-extrabold uppercase">UnterUns</h1>
        </div>
        <MuteToggle />
      </header>

      <button
        type="button"
        onClick={() => void copyCode()}
        className="mt-6 rounded-3xl border border-line bg-panel px-4 py-5 text-center"
      >
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted">
          Join code
        </p>
        <p className="mt-2 font-display text-5xl font-extrabold tracking-[0.28em] text-fog">
          {joinCode}
        </p>
        <p className="mt-2 text-xs text-crew">
          {copyStatus === 'copied'
            ? 'Invite link copied'
            : copyStatus === 'failed'
              ? 'Could not copy — use the code above'
              : 'Tap to copy invite link'}
        </p>
      </button>

      {isHost && game.dashboardCode ? (
        <div className="mt-4">
          <SecretCode
            label="Dashboard device code — enter this on a spare phone or TV"
            code={game.dashboardCode}
            onRegenerate={() => void regenerateDashboardCode()}
          />
        </div>
      ) : null}

      <section className="mt-6">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
            Players
          </h2>
          <p className="text-xs text-fog">{players.length} in the house</p>
        </div>
        <div className="space-y-2">
          {players.map((player) => (
            <PlayerChip key={player.id} player={player} you={player.id === me.id} />
          ))}
        </div>
      </section>

      {isHost ? (
        <HostControls
          impostorCount={game.impostorCount}
          discussionSeconds={game.discussionSeconds}
          deathSeconds={game.deathSeconds}
          killerCooldownSeconds={game.killerCooldownSeconds}
          initialKillCooldownSeconds={game.initialKillCooldownSeconds}
          postMeetingKillCooldownSeconds={game.postMeetingKillCooldownSeconds}
          sabotageCooldownSeconds={game.sabotageCooldownSeconds}
          sabotages={game.sabotages}
          emergencyMeetingsPerPlayer={game.emergencyMeetingsPerPlayer}
          initialEmergencyCooldownSeconds={game.initialEmergencyCooldownSeconds}
          postMeetingEmergencyCooldownSeconds={game.postMeetingEmergencyCooldownSeconds}
          dashboardCode={game.dashboardCode}
          tasksPerPlayer={game.tasksPerPlayer}
          tasks={game.tasks}
          playerCount={players.length}
          onImpostors={setImpostorCount}
          onTimer={setDiscussionSeconds}
          onDeathTimer={setDeathSeconds}
          onKillerCooldown={setKillerCooldownSeconds}
          onInitialKillCooldown={setInitialKillCooldownSeconds}
          onPostMeetingKillCooldown={setPostMeetingKillCooldownSeconds}
          onSabotageCooldown={setSabotageCooldownSeconds}
          onSabotages={setSabotages}
          onEmergencyMeetingsPerPlayer={setEmergencyMeetingsPerPlayer}
          onInitialEmergencyCooldown={setInitialEmergencyCooldownSeconds}
          onPostMeetingEmergencyCooldown={setPostMeetingEmergencyCooldownSeconds}
          onDashboardCode={setDashboardCode}
          onTasksPerPlayer={setTasksPerPlayer}
          onTasks={setTasks}
        />
      ) : (
        <p className="mt-8 rounded-2xl border border-line bg-panel/70 px-4 py-4 text-center text-sm text-muted">
          Waiting for {players.find((player) => player.isHost)?.name ?? 'the host'} to
          start the game.
        </p>
      )}

      {error ? <p className="mt-4 text-sm text-imposter">{error}</p> : null}

      <div className="mt-auto space-y-3 pt-8">
        {isHost ? (
          <Button
            variant="crew"
            disabled={!canStart || busy}
            onClick={() => {
              setBusy(true)
              void startPregame().finally(() => setBusy(false))
            }}
          >
            {busy ? 'Opening review...' : 'Review setup with everyone'}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => setConfirmLeave(true)}>
          {isHost ? 'Close lobby' : 'Leave lobby'}
        </Button>
      </div>

      {confirmLeave ? (
        <ConfirmDialog
          title={isHost ? 'Close the lobby?' : 'Leave the lobby?'}
          message={
            isHost
              ? 'This removes the room for everyone currently connected.'
              : 'You will disconnect. The others stay in the lobby.'
          }
          confirmLabel={isHost ? 'Yes, close lobby' : 'Yes, leave lobby'}
          onConfirm={() => {
            setConfirmLeave(false)
            void leave()
          }}
          onCancel={() => setConfirmLeave(false)}
        />
      ) : null}
    </Screen>
  )
}

function HostControls({
  impostorCount,
  discussionSeconds,
  deathSeconds,
  killerCooldownSeconds,
  initialKillCooldownSeconds,
  postMeetingKillCooldownSeconds,
  sabotageCooldownSeconds,
  sabotages,
  emergencyMeetingsPerPlayer,
  initialEmergencyCooldownSeconds,
  postMeetingEmergencyCooldownSeconds,
  dashboardCode,
  tasksPerPlayer,
  tasks,
  playerCount,
  onImpostors,
  onTimer,
  onDeathTimer,
  onKillerCooldown,
  onInitialKillCooldown,
  onPostMeetingKillCooldown,
  onSabotageCooldown,
  onSabotages,
  onEmergencyMeetingsPerPlayer,
  onInitialEmergencyCooldown,
  onPostMeetingEmergencyCooldown,
  onDashboardCode,
  onTasksPerPlayer,
  onTasks,
}: {
  impostorCount: number
  discussionSeconds: number
  deathSeconds: number
  killerCooldownSeconds: number
  initialKillCooldownSeconds: number
  postMeetingKillCooldownSeconds: number
  sabotageCooldownSeconds: number
  sabotages: Sabotage[]
  emergencyMeetingsPerPlayer: number
  initialEmergencyCooldownSeconds: number
  postMeetingEmergencyCooldownSeconds: number
  dashboardCode: string
  tasksPerPlayer: number
  tasks: Task[]
  playerCount: number
  onImpostors: (count: number) => Promise<void>
  onTimer: (seconds: number) => Promise<void>
  onDeathTimer: (seconds: number) => Promise<void>
  onKillerCooldown: (seconds: number) => Promise<void>
  onInitialKillCooldown: (seconds: number) => Promise<void>
  onPostMeetingKillCooldown: (seconds: number) => Promise<void>
  onSabotageCooldown: (seconds: number) => Promise<void>
  onSabotages: (sabotages: Sabotage[]) => Promise<void>
  onEmergencyMeetingsPerPlayer: (count: number) => Promise<void>
  onInitialEmergencyCooldown: (seconds: number) => Promise<void>
  onPostMeetingEmergencyCooldown: (seconds: number) => Promise<void>
  onDashboardCode: (code: string) => Promise<void>
  onTasksPerPlayer: (count: number) => Promise<void>
  onTasks: (tasks: Task[]) => Promise<void>
}) {
  const maxImpostors = Math.floor((playerCount - 1) / 2)

  return (
    <section className="mt-8 space-y-4">
      <Stepper
        label={`Imposters (max ${maxImpostors})`}
        value={`${impostorCount}`}
        onMinus={() => void onImpostors(Math.max(1, impostorCount - 1))}
        onPlus={() => void onImpostors(Math.min(maxImpostors, impostorCount + 1))}
        canMinus={impostorCount > 1}
        canPlus={impostorCount < maxImpostors}
      />
      <DurationSetting
        key={`meeting-${discussionSeconds}`}
        label="Meeting timer"
        seconds={discussionSeconds}
        onChange={onTimer}
      />
      <div className="rounded-2xl border border-line bg-ink/60 p-2">
        <p className="px-1 pb-2 text-xs font-bold uppercase tracking-[0.2em] text-muted">
          Killing
        </p>
        <div className="space-y-2">
          <DurationSetting
            key={`death-${deathSeconds}`}
            label="Become a ghost"
            seconds={deathSeconds}
            onChange={onDeathTimer}
          />
          <DurationSetting
            key={`killer-${killerCooldownSeconds}`}
            label="Killer cooldown"
            seconds={killerCooldownSeconds}
            onChange={onKillerCooldown}
          />
          <DurationSetting
            key={`initial-${initialKillCooldownSeconds}`}
            label="Initial global cooldown"
            seconds={initialKillCooldownSeconds}
            onChange={onInitialKillCooldown}
          />
          <DurationSetting
            key={`post-meeting-${postMeetingKillCooldownSeconds}`}
            label="Post-meeting cooldown"
            seconds={postMeetingKillCooldownSeconds}
            onChange={onPostMeetingKillCooldown}
          />
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-ink/60 p-2">
        <p className="px-1 pb-2 text-xs font-bold uppercase tracking-[0.2em] text-muted">
          Sabotage
        </p>
        <DurationSetting
          key={`sabotage-${sabotageCooldownSeconds}`}
          label="Cooldown after repair"
          seconds={sabotageCooldownSeconds}
          onChange={onSabotageCooldown}
        />
        <div className="mt-2">
          <SabotageEditor sabotages={sabotages} onChange={onSabotages} />
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-ink/60 p-2">
        <p className="px-1 pb-2 text-xs font-bold uppercase tracking-[0.2em] text-muted">
          Meetings
        </p>
        <div className="space-y-2">
          <Stepper
            label="Emergency meetings per player"
            value={`${emergencyMeetingsPerPlayer}`}
            onMinus={() =>
              void onEmergencyMeetingsPerPlayer(Math.max(0, emergencyMeetingsPerPlayer - 1))
            }
            onPlus={() =>
              void onEmergencyMeetingsPerPlayer(Math.min(9, emergencyMeetingsPerPlayer + 1))
            }
            canMinus={emergencyMeetingsPerPlayer > 0}
            canPlus={emergencyMeetingsPerPlayer < 9}
          />
          <DurationSetting
            key={`initial-emergency-${initialEmergencyCooldownSeconds}`}
            label="Initial emergency cooldown"
            seconds={initialEmergencyCooldownSeconds}
            onChange={onInitialEmergencyCooldown}
          />
          <DurationSetting
            key={`post-meeting-emergency-${postMeetingEmergencyCooldownSeconds}`}
            label="Cooldown after any meeting"
            seconds={postMeetingEmergencyCooldownSeconds}
            onChange={onPostMeetingEmergencyCooldown}
          />
        </div>
      </div>
      <Stepper
        label="Tasks per player"
        value={`${tasksPerPlayer}`}
        onMinus={() => void onTasksPerPlayer(Math.max(1, tasksPerPlayer - 1))}
        onPlus={() => void onTasksPerPlayer(Math.min(tasks.length, tasksPerPlayer + 1))}
        canMinus={tasksPerPlayer > 1}
        canPlus={tasksPerPlayer < tasks.length}
      />
      <TaskEditor tasks={tasks} onChange={onTasks} />
      <SettingsTransfer
        impostorCount={impostorCount}
        discussionSeconds={discussionSeconds}
        deathSeconds={deathSeconds}
        killerCooldownSeconds={killerCooldownSeconds}
        initialKillCooldownSeconds={initialKillCooldownSeconds}
        postMeetingKillCooldownSeconds={postMeetingKillCooldownSeconds}
        sabotageCooldownSeconds={sabotageCooldownSeconds}
        sabotages={sabotages}
        emergencyMeetingsPerPlayer={emergencyMeetingsPerPlayer}
        initialEmergencyCooldownSeconds={initialEmergencyCooldownSeconds}
        postMeetingEmergencyCooldownSeconds={postMeetingEmergencyCooldownSeconds}
        dashboardCode={dashboardCode}
        tasksPerPlayer={tasksPerPlayer}
        tasks={tasks}
        onImport={async (preset) => {
          if (preset.impostorCount !== impostorCount) {
            await onImpostors(preset.impostorCount)
          }
          await onTimer(preset.discussionSeconds)
          await onDeathTimer(preset.deathSeconds)
          await onKillerCooldown(preset.killerCooldownSeconds)
          await onInitialKillCooldown(preset.initialKillCooldownSeconds)
          await onPostMeetingKillCooldown(preset.postMeetingKillCooldownSeconds)
          await onSabotageCooldown(preset.sabotageCooldownSeconds)
          await onSabotages(preset.sabotages)
          await onEmergencyMeetingsPerPlayer(preset.emergencyMeetingsPerPlayer)
          await onInitialEmergencyCooldown(preset.initialEmergencyCooldownSeconds)
          await onPostMeetingEmergencyCooldown(preset.postMeetingEmergencyCooldownSeconds)
          if (preset.dashboardCode) await onDashboardCode(preset.dashboardCode)
          await onTasks(preset.tasks)
          await onTasksPerPlayer(Math.min(preset.tasksPerPlayer, preset.tasks.length))
        }}
      />
    </section>
  )
}

function DurationSetting({
  label,
  seconds,
  onChange,
}: {
  label: string
  seconds: number
  onChange: (seconds: number) => Promise<void>
}) {
  const [draft, setDraft] = useState(String(seconds))

  function commit() {
    const parsed = Number(draft)
    const next = Number.isFinite(parsed) ? Math.max(30, Math.round(parsed / 30) * 30) : seconds
    setDraft(String(next))
    if (next !== seconds) {
      void onChange(next).catch(() => setDraft(String(seconds)))
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-3 py-3">
      <div>
        <p className="text-sm font-semibold text-fog">{label}</p>
        <p className="mt-0.5 text-xs text-muted">Seconds · 30-second steps</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onChange(Math.max(30, seconds - 30))}
          disabled={seconds <= 30}
          className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-xl disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
        <input
          type="number"
          min="30"
          step="30"
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          aria-label={`${label} in seconds`}
          className="h-11 w-20 rounded-xl border border-line bg-ink px-2 text-center font-display text-lg font-bold outline-none focus:border-crew"
        />
        <button
          type="button"
          onClick={() => void onChange(seconds + 30)}
          className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-xl"
        >
          +
        </button>
      </div>
    </div>
  )
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  canMinus = true,
  canPlus = true,
}: {
  label: string
  value: string
  onMinus: () => void
  onPlus: () => void
  canMinus?: boolean
  canPlus?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-panel px-3 py-3">
      <p className="text-sm font-semibold text-fog">{label}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMinus}
          disabled={!canMinus}
          className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-xl disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
        <span className="min-w-12 text-center font-display text-lg font-bold">
          {value}
        </span>
        <button
          type="button"
          onClick={onPlus}
          disabled={!canPlus}
          className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-xl disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  )
}

function SabotageEditor({
  sabotages,
  onChange,
}: {
  sabotages: Sabotage[]
  onChange: (sabotages: Sabotage[]) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [room, setRoom] = useState('')
  const [method, setMethod] = useState<SabotageMethod>('trust')

  function addSabotage() {
    if (!name.trim() || !room.trim()) return
    void onChange([
      ...sabotages,
      {
        id: createId(),
        name: name.trim(),
        room: room.trim(),
        timerSeconds: 120,
        method,
        deactivationCode: method === 'code' ? generateLocalCode(10) : '',
        deviceCode: method === 'device' ? generateLocalCode(8) : '',
      },
    ])
    setName('')
    setRoom('')
    setMethod('trust')
  }

  return (
    <div className="rounded-2xl border border-line bg-panel px-3 py-3">
      <p className="text-sm font-semibold text-fog">Sabotages</p>
      <p className="mt-1 text-xs text-muted">
        Codes are only shown here. Write them down or connect the dedicated device.
      </p>
      <ul className="mt-3 space-y-2">
        {sabotages.map((sabotage) => (
          <EditableSabotage
            key={sabotage.id}
            sabotage={sabotage}
            onSave={(next) =>
              onChange(sabotages.map((item) => (item.id === sabotage.id ? next : item)))
            }
            onRemove={() => onChange(sabotages.filter((item) => item.id !== sabotage.id))}
            onRegenerate={(field, length) =>
              onChange(
                sabotages.map((item) =>
                  item.id === sabotage.id
                    ? { ...item, [field]: generateLocalCode(length) }
                    : item,
                ),
              )
            }
          />
        ))}
      </ul>
      <div className="mt-3 rounded-xl border border-dashed border-line p-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Sabotage name"
          className="min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm outline-none placeholder:text-muted/50 focus:border-crew"
        />
        <input
          value={room}
          onChange={(event) => setRoom(event.target.value)}
          maxLength={40}
          placeholder="Deactivation room"
          className="mt-2 min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm outline-none placeholder:text-muted/50 focus:border-crew"
        />
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value as SabotageMethod)}
          className="mt-2 min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm outline-none focus:border-crew"
        >
          <option value="trust">Trust — press on own phone</option>
          <option value="code">Written deactivation code</option>
          <option value="device">Dedicated device</option>
        </select>
        <button
          type="button"
          disabled={!name.trim() || !room.trim()}
          onClick={addSabotage}
          className="mt-2 min-h-11 w-full rounded-xl bg-panel-2 px-3 text-sm font-bold disabled:opacity-40"
        >
          Add sabotage
        </button>
      </div>
    </div>
  )
}

function EditableSabotage({
  sabotage,
  onSave,
  onRemove,
  onRegenerate,
}: {
  sabotage: Sabotage
  onSave: (sabotage: Sabotage) => Promise<void>
  onRemove: () => Promise<void>
  onRegenerate: (
    field: 'deactivationCode' | 'deviceCode',
    length: number,
  ) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState(sabotage.name)
  const [room, setRoom] = useState(sabotage.room)
  const [timer, setTimer] = useState(String(sabotage.timerSeconds))
  const [method, setMethod] = useState<SabotageMethod>(sabotage.method)

  async function save() {
    const parsed = Number(timer)
    const timerSeconds = Number.isFinite(parsed)
      ? Math.max(30, Math.round(parsed / 30) * 30)
      : sabotage.timerSeconds
    await onSave({
      ...sabotage,
      name: name.trim(),
      room: room.trim(),
      timerSeconds,
      method,
      deactivationCode:
        method === 'code'
          ? sabotage.deactivationCode || generateLocalCode(10)
          : '',
      deviceCode:
        method === 'device' ? sabotage.deviceCode || generateLocalCode(8) : '',
    })
    setTimer(String(timerSeconds))
    setExpanded(false)
  }

  return (
    <li className="overflow-hidden rounded-xl bg-ink">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{sabotage.name}</span>
          <span className="block truncate text-xs text-crew">
            {sabotage.room} · {sabotageMethodLabel(sabotage.method)}
          </span>
        </span>
        <span className="text-lg text-muted">{expanded ? '−' : '+'}</span>
      </button>
      {expanded ? (
        <div className="border-t border-line/70 p-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Sabotage name"
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-crew"
          />
          <input
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            maxLength={40}
            placeholder="Deactivation room"
            className="mt-2 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-crew"
          />
          <label className="mt-2 block text-xs font-bold uppercase tracking-wider text-muted">
            Timer in seconds
            <input
              type="number"
              min="30"
              step="30"
              value={timer}
              onChange={(event) => setTimer(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm font-normal text-fog outline-none focus:border-crew"
            />
          </label>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as SabotageMethod)}
            className="mt-2 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-crew"
          >
            <option value="trust">Trust — press on own phone</option>
            <option value="code">Written deactivation code</option>
            <option value="device">Dedicated device</option>
          </select>
          {method === 'code' ? (
            <SecretCode
              label="Write this deactivation code at the location"
              code={sabotage.deactivationCode}
              onRegenerate={() => void onRegenerate('deactivationCode', 10)}
            />
          ) : method === 'device' ? (
            <SecretCode
              label="Enter this code on the dedicated device"
              code={sabotage.deviceCode}
              onRegenerate={() => void onRegenerate('deviceCode', 8)}
            />
          ) : null}
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              disabled={!name.trim() || !room.trim()}
              onClick={() => void save()}
              className="min-h-10 rounded-lg border border-line bg-panel-2 px-3 text-xs font-bold text-crew disabled:opacity-30"
            >
              Save sabotage
            </button>
            <button
              type="button"
              onClick={() => void onRemove()}
              className="min-h-10 rounded-lg border border-imposter/40 px-3 text-xs font-bold text-imposter"
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function SecretCode({
  label,
  code,
  onRegenerate,
}: {
  label: string
  code: string
  onRegenerate: () => void
}) {
  return (
    <div className="mt-2 rounded-xl border border-warn/30 bg-warn/10 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 break-all font-display text-xl font-bold tracking-[0.18em] text-warn">
        {code || 'Generated after saving'}
      </p>
      {code ? (
        <button
          type="button"
          onClick={onRegenerate}
          className="mt-2 text-xs font-bold text-warn underline underline-offset-2"
        >
          Regenerate code
        </button>
      ) : null}
    </div>
  )
}

function TaskEditor({
  tasks,
  onChange,
}: {
  tasks: Task[]
  onChange: (tasks: Task[]) => Promise<void>
}) {
  const [draftText, setDraftText] = useState('')
  const [draftRoom, setDraftRoom] = useState('')
  const [draftDetails, setDraftDetails] = useState('')

  function addTask() {
    if (!draftText.trim() || !draftRoom.trim()) return
    void onChange([
      ...tasks,
      createTask({ text: draftText, room: draftRoom, details: draftDetails }),
    ])
    setDraftText('')
    setDraftRoom('')
    setDraftDetails('')
  }

  return (
    <div className="rounded-2xl border border-line bg-panel px-3 py-3">
      <p className="text-sm font-semibold text-fog">House tasks</p>
      <p className="mt-1 text-xs text-muted">
        Add a room and optional instructions. Players can expand details during play.
      </p>
      <ul className="mt-3 space-y-2">
        {tasks.map((task) => (
          <EditableTask
            key={task.id}
            task={task}
            onSave={(next) =>
              onChange(tasks.map((item) => (item.id === task.id ? next : item)))
            }
            onRemove={() => onChange(tasks.filter((item) => item.id !== task.id))}
          />
        ))}
      </ul>
      <div className="mt-3 rounded-xl border border-dashed border-line p-3">
        <input
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          maxLength={80}
          placeholder="Task name"
          className="min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm outline-none placeholder:text-muted/50 focus:border-crew"
        />
        <input
          value={draftRoom}
          onChange={(event) => setDraftRoom(event.target.value)}
          maxLength={40}
          placeholder="Room"
          onKeyDown={(event) => {
            if (event.key === 'Enter') addTask()
          }}
          className="mt-2 min-h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm outline-none placeholder:text-muted/50 focus:border-crew"
        />
        <textarea
          value={draftDetails}
          onChange={(event) => setDraftDetails(event.target.value)}
          maxLength={240}
          placeholder="Optional details or instructions"
          className="mt-2 min-h-20 w-full resize-y rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none placeholder:text-muted/50 focus:border-crew"
        />
        <button
          type="button"
          disabled={!draftText.trim() || !draftRoom.trim()}
          className="mt-2 min-h-11 w-full rounded-xl bg-panel-2 px-3 text-sm font-bold text-fog disabled:opacity-40"
          onClick={addTask}
        >
          Add task
        </button>
      </div>
    </div>
  )
}

function EditableTask({
  task,
  onSave,
  onRemove,
}: {
  task: Task
  onSave: (task: Task) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState(task.text)
  const [room, setRoom] = useState(task.room)
  const [details, setDetails] = useState(task.details)
  const changed =
    text.trim() !== task.text || room.trim() !== task.room || details.trim() !== task.details

  async function save() {
    await onSave({
      ...task,
      text: text.trim(),
      room: room.trim(),
      details: details.trim(),
    })
    setExpanded(false)
  }

  return (
    <li className="overflow-hidden rounded-xl bg-ink">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fog">{task.text}</span>
          <span className="block truncate text-xs text-crew">{task.room}</span>
        </span>
        <span className="text-lg text-muted" aria-hidden="true">
          {expanded ? '−' : '+'}
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-line/70 p-3">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={80}
            aria-label={`Task name for ${task.text}`}
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-crew"
          />
          <input
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            maxLength={40}
            aria-label={`Room for ${task.text}`}
            placeholder="Room"
            className="mt-2 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm outline-none placeholder:text-muted/50 focus:border-crew"
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={240}
            aria-label={`Details for ${task.text}`}
            placeholder="Optional details or instructions"
            className="mt-2 min-h-20 w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none placeholder:text-muted/50 focus:border-crew"
          />
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              disabled={!changed || !text.trim() || !room.trim()}
              onClick={() => void save()}
              className="min-h-10 rounded-lg border border-line bg-panel-2 px-3 text-xs font-bold text-crew disabled:opacity-30"
            >
              Save task
            </button>
            <button
              type="button"
              className="min-h-10 rounded-lg border border-imposter/40 px-3 text-xs font-bold text-imposter"
              onClick={() => void onRemove()}
              aria-label={`Remove ${task.text}`}
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

interface GamePreset {
  version: 1 | 2 | 3 | 4 | 5 | 6
  impostorCount: number
  discussionSeconds: number
  deathSeconds: number
  killerCooldownSeconds: number
  initialKillCooldownSeconds: number
  postMeetingKillCooldownSeconds: number
  sabotageCooldownSeconds: number
  sabotages: Sabotage[]
  emergencyMeetingsPerPlayer: number
  initialEmergencyCooldownSeconds: number
  postMeetingEmergencyCooldownSeconds: number
  dashboardCode: string
  tasksPerPlayer: number
  tasks: Task[]
}

function SettingsTransfer({
  impostorCount,
  discussionSeconds,
  deathSeconds,
  killerCooldownSeconds,
  initialKillCooldownSeconds,
  postMeetingKillCooldownSeconds,
  sabotageCooldownSeconds,
  sabotages,
  emergencyMeetingsPerPlayer,
  initialEmergencyCooldownSeconds,
  postMeetingEmergencyCooldownSeconds,
  dashboardCode,
  tasksPerPlayer,
  tasks,
  onImport,
}: {
  impostorCount: number
  discussionSeconds: number
  deathSeconds: number
  killerCooldownSeconds: number
  initialKillCooldownSeconds: number
  postMeetingKillCooldownSeconds: number
  sabotageCooldownSeconds: number
  sabotages: Sabotage[]
  emergencyMeetingsPerPlayer: number
  initialEmergencyCooldownSeconds: number
  postMeetingEmergencyCooldownSeconds: number
  dashboardCode: string
  tasksPerPlayer: number
  tasks: Task[]
  onImport: (preset: GamePreset) => Promise<void>
}) {
  const [message, setMessage] = useState<string | null>(null)

  function exportPreset() {
    const preset = {
      version: 6,
      impostorCount,
      discussionSeconds,
      deathSeconds,
      killerCooldownSeconds,
      initialKillCooldownSeconds,
      postMeetingKillCooldownSeconds,
      sabotageCooldownSeconds,
      sabotages,
      emergencyMeetingsPerPlayer,
      initialEmergencyCooldownSeconds,
      postMeetingEmergencyCooldownSeconds,
      dashboardCode,
      tasksPerPlayer,
      tasks: tasks.map(({ text, room, details }) => ({ text, room, details })),
    }
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'unteruns-settings.json'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setMessage('Settings exported')
  }

  async function importPreset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    try {
      const raw = JSON.parse(await file.text()) as unknown
      const preset = parsePreset(raw)
      await onImport(preset)
      setMessage(`Imported ${preset.tasks.length} tasks`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not import settings')
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-panel px-3 py-3">
      <p className="text-sm font-semibold text-fog">Saved settings</p>
      <p className="mt-1 text-xs text-muted">
        Export this lobby setup or import it on another host PC.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={exportPreset}
          className="min-h-11 rounded-xl border border-line bg-panel-2 px-3 text-sm font-bold"
        >
          Export JSON
        </button>
        <label className="grid min-h-11 cursor-pointer place-items-center rounded-xl border border-line bg-panel-2 px-3 text-sm font-bold">
          Import JSON
          <input type="file" accept="application/json,.json" onChange={importPreset} hidden />
        </label>
      </div>
      {message ? <p className="mt-2 text-xs text-crew">{message}</p> : null}
    </div>
  )
}

function parsePreset(raw: unknown): GamePreset {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid settings file')
  const input = raw as Record<string, unknown>
  if (
    input.version !== 1 &&
    input.version !== 2 &&
    input.version !== 3 &&
    input.version !== 4 &&
    input.version !== 5 &&
    input.version !== 6
  ) {
    throw new Error('Unsupported settings version')
  }
  if (!Number.isInteger(input.impostorCount) || Number(input.impostorCount) < 1) {
    throw new Error('Invalid imposter count')
  }
  if (
    !Number.isInteger(input.discussionSeconds) ||
    Number(input.discussionSeconds) < 30
  ) {
    throw new Error('Invalid meeting timer')
  }
  if (!Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > 30) {
    throw new Error('Settings must contain between 1 and 30 tasks')
  }
  const tasks = input.tasks.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid task in settings')
    const task = entry as Record<string, unknown>
    if (typeof task.text !== 'string' || !task.text.trim()) {
      throw new Error('Every imported task needs a name')
    }
    if (typeof task.room !== 'string' || !task.room.trim()) {
      throw new Error('Every imported task needs a room')
    }
    if (task.details !== undefined && typeof task.details !== 'string') {
      throw new Error('Task details must be text')
    }
    return createTask({
      text: task.text.slice(0, 80),
      room: task.room.slice(0, 40),
      details: typeof task.details === 'string' ? task.details.slice(0, 240) : '',
    })
  })
  const sabotages = parsePresetSabotages(
    input.sabotages,
    input.version === 4 || input.version === 5 || input.version === 6,
  )
  return {
    version: input.version,
    impostorCount: Number(input.impostorCount),
    discussionSeconds: Math.max(
      30,
      Math.round(Number(input.discussionSeconds) / 30) * 30,
    ),
    deathSeconds: parseImportedDuration(input.deathSeconds, 30),
    killerCooldownSeconds: parseImportedDuration(input.killerCooldownSeconds, 120),
    initialKillCooldownSeconds: parseImportedDuration(
      input.initialKillCooldownSeconds,
      60,
    ),
    postMeetingKillCooldownSeconds: parseImportedDuration(
      input.postMeetingKillCooldownSeconds,
      60,
    ),
    sabotageCooldownSeconds: parseImportedDuration(
      input.sabotageCooldownSeconds,
      60,
    ),
    sabotages,
    emergencyMeetingsPerPlayer: parseImportedCount(
      input.emergencyMeetingsPerPlayer,
      1,
      0,
      9,
    ),
    initialEmergencyCooldownSeconds: parseImportedDuration(
      input.initialEmergencyCooldownSeconds,
      60,
    ),
    postMeetingEmergencyCooldownSeconds: parseImportedDuration(
      input.postMeetingEmergencyCooldownSeconds,
      60,
    ),
    dashboardCode:
      typeof input.dashboardCode === 'string' &&
      /^[A-HJ-NP-Z2-9]{8}$/.test(input.dashboardCode)
        ? input.dashboardCode
        : '',
    tasksPerPlayer:
      input.version !== 1 &&
      Number.isInteger(input.tasksPerPlayer) &&
      Number(input.tasksPerPlayer) >= 1
        ? Math.min(Number(input.tasksPerPlayer), tasks.length)
        : Math.min(3, tasks.length),
    tasks,
  }
}

function parsePresetSabotages(value: unknown, required: boolean): Sabotage[] {
  if (value === undefined && !required) return []
  if (!Array.isArray(value) || value.length > 30) {
    throw new Error('Invalid sabotages in settings')
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid sabotage')
    const sabotage = entry as Record<string, unknown>
    if (typeof sabotage.name !== 'string' || !sabotage.name.trim()) {
      throw new Error('Every sabotage needs a name')
    }
    if (typeof sabotage.room !== 'string' || !sabotage.room.trim()) {
      throw new Error('Every sabotage needs a room')
    }
    if (
      sabotage.method !== 'trust' &&
      sabotage.method !== 'code' &&
      sabotage.method !== 'device'
    ) {
      throw new Error('Invalid sabotage method')
    }
    return {
      id: typeof sabotage.id === 'string' && sabotage.id ? sabotage.id : createId(),
      name: sabotage.name.slice(0, 80),
      room: sabotage.room.slice(0, 40),
      timerSeconds: parseImportedDuration(sabotage.timerSeconds, 120),
      method: sabotage.method,
      deactivationCode:
        sabotage.method === 'code' && typeof sabotage.deactivationCode === 'string'
          ? sabotage.deactivationCode
          : sabotage.method === 'code'
            ? generateLocalCode(10)
            : '',
      deviceCode:
        sabotage.method === 'device' && typeof sabotage.deviceCode === 'string'
          ? sabotage.deviceCode
          : sabotage.method === 'device'
            ? generateLocalCode(8)
            : '',
    }
  })
}

function parseImportedCount(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error('Invalid emergency meeting count')
  }
  return Number(value)
}

function parseImportedDuration(value: unknown, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || Number(value) < 30) {
    throw new Error('Invalid cooldown duration')
  }
  return Math.max(30, Math.round(Number(value) / 30) * 30)
}

function sabotageMethodLabel(method: SabotageMethod): string {
  if (method === 'code') return 'written code'
  if (method === 'device') return 'dedicated device'
  return 'trust'
}

function generateLocalCode(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Plain HTTP LAN pages often cannot use the Clipboard API.
    }
  }

  const input = document.createElement('textarea')
  input.value = text
  input.readOnly = true
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  if (!copied) throw new Error('Clipboard access is unavailable')
}
