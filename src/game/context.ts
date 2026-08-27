import { createContext, useContext } from 'react'
import type {
  DashboardSnapshot,
  Game,
  KillCandidate,
  Player,
  Sabotage,
  SabotageDeviceSnapshot,
  Task,
} from '../types'

export interface GameContextValue {
  loading: boolean
  error: string | null
  game: Game | null
  players: Player[]
  me: Player | null
  device: SabotageDeviceSnapshot | null
  dashboard: DashboardSnapshot | null
  deviceMode: boolean
  savedName: string
  clearError: () => void
  create: (name: string) => Promise<void>
  join: (code: string, name: string) => Promise<void>
  leave: () => Promise<void>
  setImpostorCount: (count: number) => Promise<void>
  setDiscussionSeconds: (seconds: number) => Promise<void>
  setDeathSeconds: (seconds: number) => Promise<void>
  setKillerCooldownSeconds: (seconds: number) => Promise<void>
  setInitialKillCooldownSeconds: (seconds: number) => Promise<void>
  setPostMeetingKillCooldownSeconds: (seconds: number) => Promise<void>
  setSabotageCooldownSeconds: (seconds: number) => Promise<void>
  setSabotages: (sabotages: Sabotage[]) => Promise<void>
  setEmergencyMeetingsPerPlayer: (count: number) => Promise<void>
  setInitialEmergencyCooldownSeconds: (seconds: number) => Promise<void>
  setPostMeetingEmergencyCooldownSeconds: (seconds: number) => Promise<void>
  regenerateDashboardCode: () => Promise<void>
  setDashboardCode: (code: string) => Promise<void>
  setTasksPerPlayer: (count: number) => Promise<void>
  setTasks: (tasks: Task[]) => Promise<void>
  startPregame: () => Promise<void>
  start: () => Promise<void>
  backToLobby: () => Promise<void>
  checkTask: (taskId: string) => Promise<void>
  getKillCandidates: () => Promise<KillCandidate[]>
  reportKilled: (killerId: string) => Promise<void>
  activateSabotage: (sabotageId: string) => Promise<void>
  deactivateSabotage: (code?: string) => Promise<void>
  connectDevice: (deviceCode: string) => Promise<void>
  leaveDevice: () => void
  deactivateFromDevice: () => Promise<void>
  triggerMeeting: (kind: 'emergency' | 'body') => Promise<void>
  startMeeting: () => Promise<void>
  dismissMeeting: () => Promise<void>
  voteOut: (targetId: string) => Promise<void>
}

export const GameContext = createContext<GameContextValue | null>(null)

export function useGame(): GameContextValue {
  const value = useContext(GameContext)
  if (!value) {
    throw new Error('useGame must be used within GameProvider')
  }
  return value
}
