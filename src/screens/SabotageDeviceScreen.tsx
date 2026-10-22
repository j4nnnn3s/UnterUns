import { useState } from 'react'
import { Button } from '../components/Button'
import { MuteToggle } from '../components/MuteToggle'
import { Screen } from '../components/Screen'
import { useGame } from '../game/context'
import { secondsRemaining, useNow } from '../game/time'

export function SabotageDeviceScreen() {
  const { device, deactivateFromDevice, leaveDevice, error } = useGame()
  const [busy, setBusy] = useState(false)
  const now = useNow(500)

  if (!device || device.kind !== 'sabotage') return null
  const remaining = secondsRemaining(device.endsAtMs, now)

  return (
    <Screen className="text-center">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-crew">
          Sabotage device
        </p>
        <MuteToggle />
      </div>
      <h1 className="mt-3 font-display text-3xl font-extrabold uppercase">
        {device.name}
      </h1>
      <p className="mt-2 text-sm text-muted">Stationed in {device.room}</p>

      <div className="flex flex-1 flex-col items-center justify-center">
        {device.gameEnded ? (
          <>
            <p
              className={`font-display text-4xl font-extrabold uppercase ${
                device.winner === 'crewmates' ? 'text-crew' : 'text-imposter'
              }`}
            >
              {device.winner === 'crewmates' ? 'Crewmates win' : 'Imposters win'}
            </p>
            <p className="mt-3 text-muted">
              {device.winner === 'crewmates'
                ? device.winReason === 'tasks'
                  ? 'Every crewmate task was finished.'
                  : 'The imposters were voted out.'
                : device.winReason === 'kills'
                  ? 'Everyone except the imposters is dead.'
                  : device.winReason === 'votes'
                    ? 'The crew voted out a crewmate.'
                    : 'The sabotage was not fixed in time.'}
            </p>
          </>
        ) : device.active ? (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-imposter">
              Sabotage active
            </p>
            <p className="mt-4 font-display text-6xl font-extrabold tabular-nums text-warn">
              {formatDuration(remaining)}
            </p>
            <p className="mt-4 max-w-xs text-sm text-muted">
              A living crewmate must reach this device and deactivate the sabotage.
            </p>
          </>
        ) : (
          <>
            <div className="grid h-28 w-28 place-items-center rounded-full border border-ok/30 bg-ok/10 text-4xl text-ok">
              ✓
            </div>
            <p className="mt-6 font-display text-2xl font-extrabold uppercase">
              System ready
            </p>
            <p className="mt-2 text-sm text-muted">Waiting for this sabotage to activate.</p>
          </>
        )}
      </div>

      {error ? <p className="mb-3 text-sm text-imposter">{error}</p> : null}
      {device.active && !device.gameEnded ? (
        <Button
          variant="crew"
          size="xl"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void deactivateFromDevice()
              .catch(() => {
                // The shared error is displayed above the button.
              })
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Deactivating...' : 'Deactivate sabotage'}
        </Button>
      ) : null}
      <div className="mt-3">
        <Button variant="ghost" onClick={leaveDevice}>
          Disconnect device
        </Button>
      </div>
    </Screen>
  )
}

function formatDuration(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
