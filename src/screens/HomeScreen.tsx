import { useState } from 'react'
import { normalizeCode } from '../game/codes'
import { useGame } from '../game/context'
import { Button } from '../components/Button'
import { MuteToggle } from '../components/MuteToggle'
import { Screen } from '../components/Screen'

export function HomeScreen() {
  const { create, join, connectDevice, savedName, error, clearError } = useGame()
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('code')
    return fromQuery ? normalizeCode(fromQuery) : ''
  })
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [deviceCode, setDeviceCode] = useState('')
  const [deviceBusy, setDeviceBusy] = useState(false)

  async function onCreate() {
    clearError()
    setBusy('create')
    try {
      await create(name)
    } catch {
      // shown via context
    } finally {
      setBusy(null)
    }
  }

  async function onJoin() {
    clearError()
    setBusy('join')
    try {
      await join(code, name)
    } catch {
      // shown via context
    } finally {
      setBusy(null)
    }
  }

  async function onConnectDevice() {
    clearError()
    setDeviceBusy(true)
    try {
      await connectDevice(deviceCode)
    } catch {
      // shown via context
    } finally {
      setDeviceBusy(false)
    }
  }

  return (
    <Screen>
      <div className="flex items-start justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-imposter">
          Live house game
        </p>
        <MuteToggle />
      </div>

      <div className="mt-10 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-imposter/40 bg-imposter/10 font-display text-2xl font-black text-imposter">
          UU
        </div>
        <h1 className="mt-5 font-display text-4xl font-extrabold uppercase tracking-wide">
          UnterUns
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted">
          A house. A traitor. Real chores. Trust no one — especially whoever
          just emptied the dishwasher.
        </p>
      </div>

      <label className="mt-10 text-xs font-bold uppercase tracking-[0.2em] text-muted">
        Your name
      </label>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={16}
        autoComplete="nickname"
        placeholder="e.g. Jannes"
        className="mt-2 min-h-14 w-full rounded-2xl border border-line bg-panel px-4 text-lg text-fog outline-none placeholder:text-muted/50 focus:border-crew"
      />

      <div className="mt-6">
        <Button onClick={() => void onCreate()} disabled={busy !== null || name.trim().length < 1}>
          {busy === 'create' ? 'Creating...' : 'Create game'}
        </Button>
      </div>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-muted">
        <span className="h-px flex-1 bg-line" />
        or join
        <span className="h-px flex-1 bg-line" />
      </div>

      <label className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
        Join code
      </label>
      <input
        value={code}
        onChange={(event) => setCode(normalizeCode(event.target.value))}
        maxLength={4}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder="K7PX"
        className="mt-2 min-h-14 w-full rounded-2xl border border-line bg-panel px-4 text-center font-display text-2xl font-bold tracking-[0.4em] text-fog outline-none placeholder:tracking-[0.2em] placeholder:text-muted/40 focus:border-crew"
      />
      <div className="mt-4">
        <Button
          variant="crew"
          onClick={() => void onJoin()}
          disabled={busy !== null || name.trim().length < 1 || code.length < 4}
        >
          {busy === 'join' ? 'Joining...' : 'Join game'}
        </Button>
      </div>

      {error ? <p className="mt-4 text-center text-sm text-imposter">{error}</p> : null}

      <section className="mt-8 rounded-2xl border border-line bg-panel/70 px-3 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
          Device code
        </p>
        <p className="mt-1 text-xs text-muted">
          Connect a spare phone as a sabotage device or house dashboard.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={deviceCode}
            onChange={(event) =>
              setDeviceCode(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, 8),
              )
            }
            maxLength={8}
            placeholder="DEVICE CODE"
            autoCapitalize="characters"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 text-center font-display font-bold tracking-[0.15em] outline-none placeholder:text-muted/40 focus:border-crew"
          />
          <button
            type="button"
            disabled={deviceCode.length !== 8 || deviceBusy}
            onClick={() => void onConnectDevice()}
            className="min-h-12 rounded-xl border border-line bg-panel-2 px-4 text-sm font-bold disabled:opacity-40"
          >
            {deviceBusy ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </section>

      <div className="mt-auto pt-8 text-center">
        <p className="text-xs text-muted">Everyone uses their own phone. No accounts.</p>
        <p className="mt-2 text-xs text-muted">Game data stays on the host PC.</p>
      </div>
    </Screen>
  )
}
