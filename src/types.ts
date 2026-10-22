export type GameStatus = 'lobby' | 'pregame' | 'playing' | 'meeting' | 'ended'
export type Role = 'crewmate' | 'imposter'
export type LifeStatus = 'alive' | 'dying' | 'ghost'
export type MeetingKind = 'emergency' | 'body'
export type SabotageMethod = 'trust' | 'code' | 'device'
export type WinReason = 'tasks' | 'sabotage' | 'kills' | 'votes'

export interface Task {
  id: string
  text: string
  room: string
  details: string
  done: boolean
  doneByName: string | null
}

export interface Meeting {
  id: string
  kind: MeetingKind
  triggeredById: string
  triggeredByName: string
  reportedPlayerId: string | null
  reportedPlayerName: string | null
  startedAtMs: number | null
}

export interface Sabotage {
  id: string
  name: string
  room: string
  timerSeconds: number
  method: SabotageMethod
  deactivationCode: string
  deviceCode: string
}

export interface ActiveSabotage {
  id: string
  sabotageId: string
  name: string
  room: string
  method: SabotageMethod
  endsAtMs: number
}

export interface Ejection {
  playerId: string
  name: string
  role: Role
}

export interface VoteCandidate {
  id: string
  name: string
}

export interface Game {
  code: string
  hostId: string
  status: GameStatus
  impostorCount: number
  discussionSeconds: number
  deathSeconds: number
  killerCooldownSeconds: number
  initialKillCooldownSeconds: number
  postMeetingKillCooldownSeconds: number
  globalKillCooldownEndsAtMs: number | null
  sabotages: Sabotage[]
  sabotageCooldownSeconds: number
  sabotageCooldownEndsAtMs: number | null
  activeSabotage: ActiveSabotage | null
  winner: 'imposters' | 'crewmates' | null
  winReason: WinReason | null
  ejection: Ejection | null
  voteCandidates: VoteCandidate[]
  dashboardCode: string
  emergencyMeetingsPerPlayer: number
  initialEmergencyCooldownSeconds: number
  postMeetingEmergencyCooldownSeconds: number
  emergencyCooldownEndsAtMs: number | null
  tasksPerPlayer: number
  tasks: Task[]
  taskProgress: {
    done: number
    total: number
  }
  meeting: Meeting | null
  roundId: number
  roundAlivePlayerIds: string[]
  createdAtMs: number
  serverNowMs: number
}

export interface Player {
  id: string
  name: string
  isHost: boolean
  role: Role | null
  color: string
  lifeStatus: LifeStatus
  deathEndsAtMs: number | null
  killedByName: string | null
  killedInRoundId: number | null
  killCooldownEndsAtMs: number | null
  emergencyMeetingsUsed: number
}

export interface KillCandidate {
  id: string
  name: string
}

export interface SabotageDeviceSnapshot {
  kind: 'sabotage'
  sabotageId: string
  name: string
  room: string
  active: boolean
  endsAtMs: number | null
  gameEnded: boolean
  winner: 'imposters' | 'crewmates' | null
  winReason: WinReason | null
  serverNowMs: number
}

export interface DashboardPlayer {
  id: string
  name: string
  color: string
  alive: boolean
  role: Role | null
}

export interface DashboardSabotage {
  id: string
  name: string
  room: string
  active: boolean
  endsAtMs: number | null
}

export interface DashboardSnapshot {
  kind: 'dashboard'
  status: GameStatus
  winner: 'imposters' | 'crewmates' | null
  winReason: WinReason | null
  ejection: Ejection | null
  meeting: Meeting | null
  taskProgress: {
    done: number
    total: number
  }
  players: DashboardPlayer[]
  sabotages: DashboardSabotage[]
  serverNowMs: number
}

export type ConnectedDevice = SabotageDeviceSnapshot | DashboardSnapshot

export interface Session {
  code: string
  playerId: string
}
