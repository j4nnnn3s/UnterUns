import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { startAlarm, stopAlarm, unlockAudio, type AlarmKind } from '../audio'
import { SabotageStrobe } from '../components/SabotageStrobe'
import type { ConnectedDevice, DashboardSnapshot, Game, Player, SabotageDeviceSnapshot } from '../types'
import { releaseWakeLock, requestWakeLock } from '../wakelock'
import {
  callMeeting,
  clearDeviceSession,
  clearSession,
  connectSabotageDevice,
  createGame,
  deactivateFromDevice as deactivateOnDevice,
  deactivateSabotage as fixSabotage,
  endMeeting,
  getKillCandidates as loadKillCandidates,
  getSavedName,
  joinGame,
  leaveGame,
  loadDeviceSession,
  loadSession,
  activateSabotage as startSabotage,
  returnToLobby,
  reportKilled as reportPlayerKilled,
  startMeeting as startMeetingTimer,
  startGame,
  startPregame,
  subscribeToGame,
  subscribeToDevice,
  toggleTask,
  updateSettings,
  voteOut as votePlayerOut,
} from './api'
import { GameContext, type GameContextValue } from './context'

export function GameProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(() => Boolean(loadSession() || loadDeviceSession()))
  const [error, setError] = useState<string | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState(() => loadSession())
  const [deviceSession, setDeviceSession] = useState(() => loadDeviceSession())
  const [device, setDevice] = useState<SabotageDeviceSnapshot | null>(null)
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null)
  const [savedName] = useState(() => getSavedName())

  const me = useMemo(
    () => players.find((player) => player.id === session?.playerId) ?? null,
    [players, session],
  )

  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    const unsub = subscribeToGame(
      session.code,
      (nextGame) => {
        setGame(nextGame)
        setLoading(false)
        if (!nextGame) {
          clearSession()
          setSession(null)
          setPlayers([])
        }
      },
      (nextPlayers) => setPlayers(nextPlayers),
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [session])

  useEffect(() => {
    if (!deviceSession) return
    const unsub = subscribeToDevice(
      deviceSession,
      (nextDevice: ConnectedDevice | null) => {
        setLoading(false)
        if (!nextDevice) {
          clearDeviceSession()
          setDeviceSession(null)
          setDevice(null)
          setDashboard(null)
          return
        }
        if (nextDevice.kind === 'dashboard') {
          setDashboard(nextDevice)
          setDevice(null)
        } else {
          setDevice(nextDevice)
          setDashboard(null)
        }
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [deviceSession])

  useEffect(() => {
    const kind = desiredAlarm(game, dashboard, device)
    if (kind) startAlarm(kind)
    else stopAlarm()
  }, [game, dashboard, device])

  useEffect(() => () => stopAlarm(), [])

  useEffect(() => {
    if (game?.status === 'playing' || game?.status === 'meeting') {
      void requestWakeLock()
    } else {
      void releaseWakeLock()
    }
    return () => {
      void releaseWakeLock()
    }
  }, [game?.status])

  const run = useCallback(async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      throw err
    }
  }, [])

  const value = useMemo<GameContextValue>(
    () => ({
      loading,
      error,
      game,
      players,
      me,
      device,
      dashboard,
      deviceMode: deviceSession !== null,
      savedName,
      clearError: () => setError(null),
      create: (name, hostPassword) =>
        run(async () => {
          clearDeviceSession()
          setDeviceSession(null)
          setDevice(null)
          setDashboard(null)
          const next = await createGame(name, hostPassword)
          unlockAudio()
          setLoading(true)
          setSession(next)
        }),
      join: (code, name) =>
        run(async () => {
          clearDeviceSession()
          setDeviceSession(null)
          setDevice(null)
          setDashboard(null)
          const next = await joinGame(code, name)
          unlockAudio()
          setLoading(true)
          setSession(next)
        }),
      leave: () =>
        run(async () => {
          if (!session || !game) {
            clearSession()
            setSession(null)
            return
          }
          await leaveGame(game.code)
          setSession(null)
          setGame(null)
          setPlayers([])
        }),
      setImpostorCount: (count) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { impostorCount: count })
        }),
      setDiscussionSeconds: (seconds) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { discussionSeconds: seconds })
        }),
      setDeathSeconds: (seconds) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { deathSeconds: seconds })
        }),
      setKillerCooldownSeconds: (seconds) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { killerCooldownSeconds: seconds })
        }),
      setInitialKillCooldownSeconds: (seconds) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { initialKillCooldownSeconds: seconds })
        }),
      setPostMeetingKillCooldownSeconds: (seconds) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { postMeetingKillCooldownSeconds: seconds })
        }),
      setSabotageCooldownSeconds: (seconds) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { sabotageCooldownSeconds: seconds })
        }),
      setSabotages: (sabotages) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { sabotages })
        }),
      setEmergencyMeetingsPerPlayer: (count) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { emergencyMeetingsPerPlayer: count })
        }),
      setInitialEmergencyCooldownSeconds: (seconds) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { initialEmergencyCooldownSeconds: seconds })
        }),
      setPostMeetingEmergencyCooldownSeconds: (seconds) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, {
            postMeetingEmergencyCooldownSeconds: seconds,
          })
        }),
      regenerateDashboardCode: () =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { regenerateDashboardCode: true })
        }),
      setDashboardCode: (code) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { dashboardCode: code })
        }),
      setTasksPerPlayer: (count) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { tasksPerPlayer: count })
        }),
      setTasks: (tasks) =>
        run(async () => {
          if (!game) return
          await updateSettings(game.code, { tasks })
        }),
      startPregame: () =>
        run(async () => {
          if (!game) return
          await startPregame(game.code)
        }),
      start: () =>
        run(async () => {
          if (!game) return
          await startGame(game.code)
        }),
      backToLobby: () =>
        run(async () => {
          if (!game) return
          await returnToLobby(game.code)
        }),
      checkTask: (taskId) =>
        run(async () => {
          if (!game || !me) return
          await toggleTask(game.code, taskId)
        }),
      getKillCandidates: async () => {
        if (!game || !me) return []
        setError(null)
        try {
          return await loadKillCandidates(game.code)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Something went wrong')
          throw err
        }
      },
      reportKilled: (killerId) =>
        run(async () => {
          if (!game || !me) return
          await reportPlayerKilled(game.code, killerId)
        }),
      activateSabotage: (sabotageId) =>
        run(async () => {
          if (!game || !me) return
          await startSabotage(game.code, sabotageId)
        }),
      deactivateSabotage: (code) =>
        run(async () => {
          if (!game || !me) return
          await fixSabotage(game.code, code)
        }),
      connectDevice: (deviceCode) =>
        run(async () => {
          const next = await connectSabotageDevice(deviceCode)
          setSession(null)
          setGame(null)
          setPlayers([])
          setDevice(next.device.kind === 'sabotage' ? next.device : null)
          setDashboard(next.device.kind === 'dashboard' ? next.device : null)
          setDeviceSession(next.deviceCode)
          unlockAudio()
        }),
      leaveDevice: () => {
        clearDeviceSession()
        setDeviceSession(null)
        setDevice(null)
        setDashboard(null)
      },
      deactivateFromDevice: () =>
        run(async () => {
          if (!deviceSession) return
          await deactivateOnDevice()
        }),
      triggerMeeting: (kind, reportedPlayerId) =>
        run(async () => {
          if (!game || !me || game.status === 'meeting') return
          await callMeeting(game.code, kind, reportedPlayerId)
        }),
      startMeeting: () =>
        run(async () => {
          if (!game?.meeting || game.meeting.startedAtMs !== null) return
          await startMeetingTimer(game.code)
        }),
      dismissMeeting: () =>
        run(async () => {
          if (!game) return
          await endMeeting(game.code)
        }),
      voteOut: (targetId) =>
        run(async () => {
          if (!game) return
          await votePlayerOut(game.code, targetId)
        }),
    }),
    [
      device,
      dashboard,
      deviceSession,
      error,
      game,
      loading,
      me,
      players,
      run,
      savedName,
      session,
    ],
  )

  const strobeActive = sabotageStrobeActive(game, dashboard, device)

  return (
    <GameContext.Provider value={value}>
      {children}
      <SabotageStrobe active={strobeActive} />
    </GameContext.Provider>
  )
}

function desiredAlarm(
  game: Game | null,
  dashboard: DashboardSnapshot | null,
  device: SabotageDeviceSnapshot | null,
): AlarmKind | null {
  const status = game?.status ?? dashboard?.status ?? device?.status ?? null
  const meeting = game?.meeting ?? dashboard?.meeting ?? device?.meeting ?? null
  if (status === 'meeting' && meeting && meeting.startedAtMs === null) {
    return meeting.kind
  }
  if (status === 'meeting' || status === 'ended') return null
  if (game?.activeSabotage) return 'sabotage'
  if (device?.active) return 'sabotage'
  if (dashboard?.sabotages.some((item) => item.active)) return 'sabotage'
  return null
}

function sabotageStrobeActive(
  game: Game | null,
  dashboard: DashboardSnapshot | null,
  device: SabotageDeviceSnapshot | null,
): boolean {
  if (game?.status === 'ended' || dashboard?.status === 'ended' || device?.gameEnded) {
    return false
  }
  return Boolean(
    game?.activeSabotage ||
      device?.active ||
      dashboard?.sabotages.some((item) => item.active),
  )
}
