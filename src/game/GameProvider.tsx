import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { playMeetingAlarm, unlockAudio, vibrateForMeeting } from '../audio'
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
  getPlayerId,
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
  const lastMeetingId = useRef<string | null>(null)
  const lastSabotageId = useRef<string | null>(null)

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
    const meeting = game?.meeting
    if (game?.status === 'meeting' && meeting && meeting.id !== lastMeetingId.current) {
      lastMeetingId.current = meeting.id
      if (meeting.triggeredById !== getPlayerId()) {
        playMeetingAlarm()
        vibrateForMeeting()
      }
    }
    if (game?.status !== 'meeting') {
      lastMeetingId.current = meeting?.id ?? lastMeetingId.current
    }
  }, [game?.status, game?.meeting])

  useEffect(() => {
    const sabotage = game?.activeSabotage
    if (sabotage && sabotage.id !== lastSabotageId.current) {
      lastSabotageId.current = sabotage.id
      playMeetingAlarm()
      vibrateForMeeting()
    }
  }, [game?.activeSabotage])

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
      triggerMeeting: (kind) =>
        run(async () => {
          if (!game || !me || game.status === 'meeting') return
          playMeetingAlarm()
          vibrateForMeeting()
          await callMeeting(game.code, kind)
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

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
