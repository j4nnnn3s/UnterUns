import { randomBytes, randomUUID } from 'node:crypto'
import { ROOM_FULL, TOO_MANY_ROOMS } from './limits.js'

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
  serverNowMs?: number
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

export interface GameSnapshot {
  game: Game
  players: Player[]
}

export interface SettingsPatch {
  impostorCount?: number
  discussionSeconds?: number
  deathSeconds?: number
  killerCooldownSeconds?: number
  initialKillCooldownSeconds?: number
  postMeetingKillCooldownSeconds?: number
  sabotages?: Sabotage[]
  sabotageCooldownSeconds?: number
  emergencyMeetingsPerPlayer?: number
  initialEmergencyCooldownSeconds?: number
  postMeetingEmergencyCooldownSeconds?: number
  dashboardCode?: string
  regenerateDashboardCode?: boolean
  tasksPerPlayer?: number
  tasks?: Task[]
}

interface Room {
  game: Game
  players: Map<string, Player>
  assignments: Map<string, Task[]>
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DEFAULT_TASKS = [
  { text: 'Water the plants', room: 'Kitchen', details: 'Use the small green watering can.' },
  { text: 'Sort the recycling', room: 'Hallway', details: 'Separate paper, plastic, and glass.' },
  { text: 'Wipe down the sink', room: 'Bathroom', details: 'Use the cloth under the sink.' },
  { text: 'Take out the trash', room: 'Kitchen', details: 'Bring it to the outside bins.' },
  { text: 'Load or unload the dishwasher', room: 'Kitchen', details: '' },
  { text: 'Sweep the floor', room: 'Hallway', details: 'The broom is next to the coat rack.' },
  { text: 'Check that the stove is off', room: 'Kitchen', details: 'Check every control knob.' },
  { text: 'Fold one load of laundry', room: 'Laundry room', details: '' },
]
const CREW_COLORS = [
  '#c51111',
  '#132ed1',
  '#117f2d',
  '#ed54ba',
  '#ef7d0d',
  '#f6f658',
  '#3f474e',
  '#d6e0f0',
  '#6b2fbb',
  '#71491e',
  '#38fedc',
  '#50ef39',
]

export interface EngineOptions {
  maxRooms?: number
  maxPlayers?: number
  maxNameLength?: number
}

export class GameEngine {
  private readonly rooms = new Map<string, Room>()
  private readonly sessions = new Map<string, { code: string; playerId: string }>()
  private readonly maxRooms: number
  private readonly maxPlayers: number
  private readonly maxNameLength: number

  constructor(options: EngineOptions = {}) {
    this.maxRooms = options.maxRooms ?? 100
    this.maxPlayers = options.maxPlayers ?? 24
    this.maxNameLength = options.maxNameLength ?? 16
  }

  createGame(playerId: string, rawName: string): GameSnapshot {
    if (this.rooms.size >= this.maxRooms) throw new Error(TOO_MANY_ROOMS)
    const name = sanitizeName(rawName, this.maxNameLength)
    let code = ''
    for (let attempt = 0; attempt < 8; attempt++) {
      code = generateCode()
      if (!this.rooms.has(code)) break
      code = ''
    }
    if (!code) throw new Error('Could not create a join code. Try again.')

    const game: Game = {
      code,
      hostId: playerId,
      status: 'lobby',
      impostorCount: 1,
      discussionSeconds: 90,
      deathSeconds: 30,
      killerCooldownSeconds: 120,
      initialKillCooldownSeconds: 60,
      postMeetingKillCooldownSeconds: 60,
      globalKillCooldownEndsAtMs: null,
      sabotages: [],
      sabotageCooldownSeconds: 60,
      sabotageCooldownEndsAtMs: null,
      activeSabotage: null,
      winner: null,
      winReason: null,
      ejection: null,
      voteCandidates: [],
      dashboardCode: '',
      emergencyMeetingsPerPlayer: 1,
      initialEmergencyCooldownSeconds: 60,
      postMeetingEmergencyCooldownSeconds: 60,
      emergencyCooldownEndsAtMs: null,
      tasksPerPlayer: 3,
      tasks: tasksFromTemplates(DEFAULT_TASKS),
      taskProgress: { done: 0, total: 0 },
      meeting: null,
      roundId: 0,
      roundAlivePlayerIds: [],
      createdAtMs: Date.now(),
    }
    const host: Player = {
      id: playerId,
      name,
      isHost: true,
      role: null,
      color: CREW_COLORS[0]!,
      lifeStatus: 'alive',
      deathEndsAtMs: null,
      killedByName: null,
      killedInRoundId: null,
      killCooldownEndsAtMs: null,
      emergencyMeetingsUsed: 0,
    }
    this.rooms.set(code, {
      game,
      players: new Map([[playerId, host]]),
      assignments: new Map(),
    })
    game.dashboardCode = this.generateUniqueDeviceCode()
    return this.snapshot(code, playerId)
  }

  joinGame(playerId: string, rawCode: string, rawName: string): GameSnapshot {
    const code = normalizeCode(rawCode)
    if (!isValidCode(code)) throw new Error('Enter a 4-character join code')
    const room = this.getRoom(code)
    const name = sanitizeName(rawName, this.maxNameLength)
    const existing = room.players.get(playerId)

    if (room.game.status !== 'lobby' && room.game.status !== 'pregame' && !existing) {
      throw new Error('That game already started')
    }
    if (!existing && room.players.size >= this.maxPlayers) throw new Error(ROOM_FULL)
    if (
      [...room.players.values()].some(
        (player) => player.id !== playerId && player.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new Error('That name is already in the lobby')
    }

    const usedColors = new Set([...room.players.values()].map((player) => player.color))
    const player: Player = {
      id: playerId,
      name,
      isHost: room.game.hostId === playerId,
      role: existing?.role ?? null,
      color:
        existing?.color ??
        CREW_COLORS.find((color) => !usedColors.has(color)) ??
        CREW_COLORS[room.players.size % CREW_COLORS.length]!,
      lifeStatus: existing?.lifeStatus ?? 'alive',
      deathEndsAtMs: existing?.deathEndsAtMs ?? null,
      killedByName: existing?.killedByName ?? null,
      killedInRoundId: existing?.killedInRoundId ?? null,
      killCooldownEndsAtMs: existing?.killCooldownEndsAtMs ?? null,
      emergencyMeetingsUsed: existing?.emergencyMeetingsUsed ?? 0,
    }
    room.players.set(playerId, player)
    return this.snapshot(code, playerId)
  }

  resumeGame(code: string, playerId: string): GameSnapshot {
    const room = this.getRoom(normalizeCode(code))
    if (!room.players.has(playerId)) throw new Error('Your session is no longer active')
    return this.snapshot(room.game.code, playerId)
  }

  openSession(code: string, playerId: string): string {
    const room = this.playerRoom(code, playerId)
    const token = randomBytes(32).toString('base64url')
    this.sessions.set(token, { code: room.game.code, playerId })
    return token
  }

  sessionFor(token: string): { code: string; playerId: string } | null {
    const session = this.sessions.get(token)
    if (!session) return null
    const room = this.rooms.get(session.code)
    if (!room?.players.has(session.playerId)) {
      this.sessions.delete(token)
      return null
    }
    return { code: session.code, playerId: session.playerId }
  }

  resumeByToken(token: string, rawCode: string): GameSnapshot {
    const session = this.sessionFor(token)
    const code = normalizeCode(rawCode)
    if (!session || session.code !== code) throw new Error('Your session is no longer active')
    return this.resumeGame(session.code, session.playerId)
  }

  leaveGame(code: string, playerId: string): { closed: boolean } {
    const room = this.getRoom(code)
    const player = this.getPlayer(room, playerId)
    const roomCode = room.game.code
    if (player.isHost) {
      this.revokeRoom(roomCode)
      this.rooms.delete(roomCode)
      return { closed: true }
    }
    this.revokePlayer(roomCode, playerId)
    room.players.delete(playerId)
    room.assignments.delete(playerId)
    return { closed: false }
  }

  updateSettings(code: string, playerId: string, patch: SettingsPatch): void {
    const room = this.hostRoom(code, playerId)
    if (room.game.status !== 'lobby') throw new Error('Settings can only change in the lobby')

    if (patch.impostorCount !== undefined) {
      const maxImpostors = Math.floor((room.players.size - 1) / 2)
      if (
        !Number.isInteger(patch.impostorCount) ||
        patch.impostorCount < 1 ||
        patch.impostorCount > maxImpostors
      ) {
        throw new Error('Imposter count must be strictly lower than half the player count')
      }
      room.game.impostorCount = patch.impostorCount
    }
    if (patch.discussionSeconds !== undefined) {
      validateDuration(patch.discussionSeconds, 'Discussion time')
      room.game.discussionSeconds = patch.discussionSeconds
    }
    if (patch.deathSeconds !== undefined) {
      validateDuration(patch.deathSeconds, 'Ghost delay')
      room.game.deathSeconds = patch.deathSeconds
    }
    if (patch.killerCooldownSeconds !== undefined) {
      validateDuration(patch.killerCooldownSeconds, 'Killer cooldown')
      room.game.killerCooldownSeconds = patch.killerCooldownSeconds
    }
    if (patch.initialKillCooldownSeconds !== undefined) {
      validateDuration(patch.initialKillCooldownSeconds, 'Initial kill cooldown')
      room.game.initialKillCooldownSeconds = patch.initialKillCooldownSeconds
    }
    if (patch.postMeetingKillCooldownSeconds !== undefined) {
      validateDuration(patch.postMeetingKillCooldownSeconds, 'Post-meeting kill cooldown')
      room.game.postMeetingKillCooldownSeconds = patch.postMeetingKillCooldownSeconds
    }
    if (patch.sabotageCooldownSeconds !== undefined) {
      validateDuration(patch.sabotageCooldownSeconds, 'Sabotage cooldown')
      room.game.sabotageCooldownSeconds = patch.sabotageCooldownSeconds
    }
    if (patch.emergencyMeetingsPerPlayer !== undefined) {
      if (
        !Number.isInteger(patch.emergencyMeetingsPerPlayer) ||
        patch.emergencyMeetingsPerPlayer < 0 ||
        patch.emergencyMeetingsPerPlayer > 9
      ) {
        throw new Error('Emergency meetings per player must be between 0 and 9')
      }
      room.game.emergencyMeetingsPerPlayer = patch.emergencyMeetingsPerPlayer
    }
    if (patch.initialEmergencyCooldownSeconds !== undefined) {
      validateDuration(patch.initialEmergencyCooldownSeconds, 'Initial emergency cooldown')
      room.game.initialEmergencyCooldownSeconds = patch.initialEmergencyCooldownSeconds
    }
    if (patch.postMeetingEmergencyCooldownSeconds !== undefined) {
      validateDuration(
        patch.postMeetingEmergencyCooldownSeconds,
        'Post-meeting emergency cooldown',
      )
      room.game.postMeetingEmergencyCooldownSeconds =
        patch.postMeetingEmergencyCooldownSeconds
    }
    if (patch.regenerateDashboardCode) {
      room.game.dashboardCode = this.generateUniqueDeviceCode()
    }
    if (patch.dashboardCode !== undefined) {
      const dashboardCode = validSecretCode(patch.dashboardCode, 8)
      if (!dashboardCode) throw new Error('Dashboard codes must be 8 characters')
      if (this.isDeviceCodeUsed(dashboardCode, { room, ignoreDashboard: true })) {
        throw new Error('That dashboard code is already in use')
      }
      room.game.dashboardCode = dashboardCode
    }
    if (patch.sabotages !== undefined) {
      if (!Array.isArray(patch.sabotages) || patch.sabotages.length > 30) {
        throw new Error('Use at most 30 sabotages')
      }
      const existing = new Map(room.game.sabotages.map((sabotage) => [sabotage.id, sabotage]))
      const nextSabotages = patch.sabotages.map((sabotage) => {
        const previous = existing.get(sabotage.id)
        const method = sanitizeSabotageMethod(sabotage.method)
        return {
          id: typeof sabotage.id === 'string' && sabotage.id ? sabotage.id : randomUUID(),
          name: sanitizeSabotageName(sabotage.name),
          room: sanitizeTaskRoom(sabotage.room),
          timerSeconds: validatedDuration(sabotage.timerSeconds, 'Sabotage timer'),
          method,
          deactivationCode:
            method === 'code'
              ? validSecretCode(sabotage.deactivationCode, 10) ??
                previous?.deactivationCode ??
                generateSecretCode(10)
              : '',
          deviceCode:
            method === 'device'
              ? validSecretCode(sabotage.deviceCode, 8) ??
                previous?.deviceCode ??
                this.generateUniqueDeviceCode()
              : '',
        }
      })
      const deviceCodes = nextSabotages
        .filter((sabotage) => sabotage.method === 'device')
        .map((sabotage) => sabotage.deviceCode)
      if (new Set(deviceCodes).size !== deviceCodes.length) {
        throw new Error('Every sabotage device needs a unique login code')
      }
      for (const deviceCode of deviceCodes) {
        if (this.isDeviceCodeUsed(deviceCode, { room, ignoreSabotages: true })) {
          throw new Error('That sabotage device code is already in use')
        }
      }
      room.game.sabotages = nextSabotages
    }
    if (patch.tasksPerPlayer !== undefined) {
      if (
        !Number.isInteger(patch.tasksPerPlayer) ||
        patch.tasksPerPlayer < 1 ||
        patch.tasksPerPlayer > 30
      ) {
        throw new Error('Tasks per player must be between 1 and 30')
      }
      room.game.tasksPerPlayer = patch.tasksPerPlayer
    }
    if (patch.tasks !== undefined) {
      if (!Array.isArray(patch.tasks) || patch.tasks.length > 30) {
        throw new Error('Use at most 30 tasks')
      }
      room.game.tasks = patch.tasks.map((task) => ({
        id: typeof task.id === 'string' && task.id ? task.id : randomUUID(),
        text: sanitizeTaskText(task.text),
        room: sanitizeTaskRoom(task.room),
        details: sanitizeTaskDetails(task.details),
        done: false,
        doneByName: null,
      }))
      room.game.tasksPerPlayer = Math.min(
        room.game.tasksPerPlayer,
        Math.max(room.game.tasks.length, 1),
      )
    }
  }

  startPregame(code: string, playerId: string): void {
    const room = this.hostRoom(code, playerId)
    if (room.game.status !== 'lobby') throw new Error('The game has already started')
    this.assertCanStart(room)
    room.game.status = 'pregame'
  }

  startGame(code: string, playerId: string): void {
    const room = this.hostRoom(code, playerId)
    if (room.game.status !== 'pregame') throw new Error('Review the setup before starting')
    this.assertCanStart(room)
    const players = [...room.players.values()]

    const shuffled = shuffle(players.map((player) => player.id))
    const imposters = new Set(shuffled.slice(0, room.game.impostorCount))
    for (const player of players) {
      player.role = imposters.has(player.id) ? 'imposter' : 'crewmate'
      player.lifeStatus = 'alive'
      player.deathEndsAtMs = null
      player.killedByName = null
      player.killedInRoundId = null
      player.killCooldownEndsAtMs = null
      player.emergencyMeetingsUsed = 0
      room.assignments.set(
        player.id,
        shuffle(room.game.tasks)
          .slice(0, room.game.tasksPerPlayer)
          .map((task) => ({
            ...task,
            id: randomUUID(),
            done: false,
            doneByName: null,
          })),
      )
    }
    room.game.status = 'playing'
    room.game.meeting = null
    room.game.ejection = null
    room.game.winReason = null
    room.game.globalKillCooldownEndsAtMs =
      Date.now() + room.game.initialKillCooldownSeconds * 1000
    room.game.emergencyCooldownEndsAtMs =
      Date.now() + room.game.initialEmergencyCooldownSeconds * 1000
    room.game.activeSabotage = null
    room.game.sabotageCooldownEndsAtMs = null
    room.game.winner = null
    this.beginRound(room)
    room.game.tasks = room.game.tasks.map((task) => ({
      ...task,
      done: false,
      doneByName: null,
    }))
  }

  returnToLobby(code: string, playerId: string): void {
    const room = this.hostRoom(code, playerId)
    room.game.status = 'lobby'
    room.game.meeting = null
    room.game.globalKillCooldownEndsAtMs = null
    room.game.emergencyCooldownEndsAtMs = null
    room.game.activeSabotage = null
    room.game.sabotageCooldownEndsAtMs = null
    room.game.winner = null
    room.game.winReason = null
    room.game.ejection = null
    room.game.roundAlivePlayerIds = []
    for (const player of room.players.values()) {
      player.role = null
      player.lifeStatus = 'alive'
      player.deathEndsAtMs = null
      player.killedByName = null
      player.killedInRoundId = null
      player.killCooldownEndsAtMs = null
      player.emergencyMeetingsUsed = 0
    }
    room.assignments.clear()
  }

  toggleTask(code: string, playerId: string, taskId: string): void {
    const room = this.playerRoom(code, playerId)
    if (room.game.status !== 'playing') throw new Error('Tasks can only change during play')
    const player = this.getPlayer(room, playerId)
    if (player.lifeStatus === 'dying') throw new Error('Tasks are unavailable during the ghost countdown')
    const task = room.assignments.get(playerId)?.find((item) => item.id === taskId)
    if (!task) throw new Error('Task not found')
    task.done = !task.done
    task.doneByName = task.done ? player.name : null
    this.maybeWinFromTasks(room)
  }

  killCandidates(code: string, playerId: string): Array<{ id: string; name: string }> {
    const room = this.playerRoom(code, playerId)
    const victim = this.getPlayer(room, playerId)
    if (
      room.game.status !== 'playing' ||
      victim.role !== 'crewmate' ||
      victim.lifeStatus !== 'alive'
    ) {
      throw new Error('You cannot report a kill right now')
    }
    const now = Date.now()
    if ((room.game.globalKillCooldownEndsAtMs ?? 0) > now) {
      throw new Error('The global kill cooldown is still active')
    }
    const candidates = [...room.players.values()]
      .filter(
        (player) =>
          player.role === 'imposter' && (player.killCooldownEndsAtMs ?? 0) <= now,
      )
      .map((player) => ({ id: player.id, name: player.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
    if (candidates.length === 0) throw new Error('No imposter can kill yet')
    return candidates
  }

  reportKilled(code: string, victimId: string, killerId: string): number {
    const room = this.playerRoom(code, victimId)
    const victim = this.getPlayer(room, victimId)
    const killer = this.getPlayer(room, killerId)
    if (
      room.game.status !== 'playing' ||
      victim.role !== 'crewmate' ||
      victim.lifeStatus !== 'alive'
    ) {
      throw new Error('You cannot report a kill right now')
    }
    if (killer.role !== 'imposter') throw new Error('That player is not an imposter')
    const now = Date.now()
    if ((room.game.globalKillCooldownEndsAtMs ?? 0) > now) {
      throw new Error('The global kill cooldown is still active')
    }
    if ((killer.killCooldownEndsAtMs ?? 0) > now) {
      throw new Error(`${killer.name}'s kill cooldown is still active`)
    }

    victim.lifeStatus = 'dying'
    victim.deathEndsAtMs = now + room.game.deathSeconds * 1000
    victim.killedByName = killer.name
    victim.killedInRoundId = room.game.roundId
    killer.killCooldownEndsAtMs = now + room.game.killerCooldownSeconds * 1000
    this.maybeWinFromLives(room)
    return victim.deathEndsAtMs
  }

  makeGhost(code: string, playerId: string): void {
    const room = this.playerRoom(code, playerId)
    const player = this.getPlayer(room, playerId)
    if (player.lifeStatus !== 'dying') return
    player.lifeStatus = 'ghost'
    player.deathEndsAtMs = null
    this.maybeWinFromLives(room)
  }

  activateSabotage(code: string, playerId: string, sabotageId: string): ActiveSabotage {
    const room = this.playerRoom(code, playerId)
    const player = this.getPlayer(room, playerId)
    if (room.game.status !== 'playing') {
      throw new Error('Sabotages cannot be started during a meeting')
    }
    if (player.role !== 'imposter') throw new Error('Only imposters can sabotage')
    if (room.game.activeSabotage) throw new Error('A sabotage is already active')
    if ((room.game.sabotageCooldownEndsAtMs ?? 0) > Date.now()) {
      throw new Error('The sabotage cooldown is still active')
    }
    const sabotage = room.game.sabotages.find((item) => item.id === sabotageId)
    if (!sabotage) throw new Error('Sabotage not found')
    const active: ActiveSabotage = {
      id: randomUUID(),
      sabotageId: sabotage.id,
      name: sabotage.name,
      room: sabotage.room,
      method: sabotage.method,
      endsAtMs: Date.now() + sabotage.timerSeconds * 1000,
    }
    room.game.activeSabotage = active
    return active
  }

  deactivateSabotage(
    code: string,
    playerId: string,
    deactivationCode?: string,
  ): void {
    const room = this.playerRoom(code, playerId)
    const player = this.getPlayer(room, playerId)
    const active = room.game.activeSabotage
    if (!active || (room.game.status !== 'playing' && room.game.status !== 'meeting')) {
      throw new Error('There is no active sabotage')
    }
    if (player.role !== 'crewmate' || player.lifeStatus !== 'alive') {
      throw new Error('Only living crewmates can deactivate sabotages')
    }
    const sabotage = room.game.sabotages.find((item) => item.id === active.sabotageId)
    if (!sabotage) throw new Error('Sabotage not found')
    if (sabotage.method === 'device') {
      throw new Error('This sabotage must be deactivated on its dedicated device')
    }
    if (
      sabotage.method === 'code' &&
      normalizeSecretCode(deactivationCode ?? '') !== sabotage.deactivationCode
    ) {
      throw new Error('Incorrect deactivation code')
    }
    this.finishSabotage(room)
  }

  deactivateSabotageFromDevice(code: string, sabotageId: string): void {
    const room = this.getRoom(code)
    const active = room.game.activeSabotage
    if (!active || active.sabotageId !== sabotageId || active.method !== 'device') {
      throw new Error('This device has no active sabotage')
    }
    this.finishSabotage(room)
  }

  expireSabotage(code: string, activeId: string): boolean {
    const room = this.getRoom(code)
    if (room.game.activeSabotage?.id !== activeId) return false
    room.game.status = 'ended'
    room.game.winner = 'imposters'
    room.game.winReason = 'sabotage'
    room.game.meeting = null
    return true
  }

  connectDevice(
    rawDeviceCode: string,
  ): { kind: 'dashboard'; code: string } | { kind: 'sabotage'; code: string; sabotageId: string } {
    const deviceCode = normalizeSecretCode(rawDeviceCode)
    for (const room of this.rooms.values()) {
      if (room.game.dashboardCode === deviceCode) {
        return { kind: 'dashboard', code: room.game.code }
      }
      const sabotage = room.game.sabotages.find((item) => item.deviceCode === deviceCode)
      if (sabotage) return { kind: 'sabotage', code: room.game.code, sabotageId: sabotage.id }
    }
    throw new Error('No device found for that code')
  }

  snapshotDevice(
    code: string,
    sabotageId: string,
  ): {
    kind: 'sabotage'
    sabotageId: string
    name: string
    room: string
    active: boolean
    endsAtMs: number | null
    status: GameStatus
    meeting: Meeting | null
    gameEnded: boolean
    winner: 'imposters' | 'crewmates' | null
    winReason: WinReason | null
    serverNowMs: number
  } {
    const room = this.getRoom(code)
    const sabotage = room.game.sabotages.find((item) => item.id === sabotageId)
    if (!sabotage || sabotage.method !== 'device') throw new Error('Sabotage device not found')
    const active =
      room.game.activeSabotage?.sabotageId === sabotageId
        ? room.game.activeSabotage
        : null
    return {
      kind: 'sabotage',
      sabotageId,
      name: sabotage.name,
      room: sabotage.room,
      active: active !== null,
      endsAtMs: active?.endsAtMs ?? null,
      status: room.game.status,
      meeting: room.game.meeting,
      gameEnded: room.game.status === 'ended',
      winner: room.game.winner,
      winReason: room.game.winReason,
      serverNowMs: Date.now(),
    }
  }

  snapshotDashboard(code: string): {
    kind: 'dashboard'
    status: GameStatus
    winner: 'imposters' | 'crewmates' | null
    winReason: WinReason | null
    ejection: Ejection | null
    meeting: Meeting | null
    taskProgress: { done: number; total: number }
    players: Array<{
      id: string
      name: string
      color: string
      alive: boolean
      role: Role | null
    }>
    sabotages: Array<{
      id: string
      name: string
      room: string
      active: boolean
      endsAtMs: number | null
    }>
    serverNowMs: number
  } {
    const room = this.getRoom(code)
    const playing =
      room.game.status === 'playing' ||
      room.game.status === 'meeting' ||
      room.game.status === 'ended'
    const crewTasks = playing
      ? [...room.players.values()]
          .filter((player) => player.role === 'crewmate')
          .flatMap((player) => room.assignments.get(player.id) ?? [])
      : []
    return {
      kind: 'dashboard',
      status: room.game.status,
      winner: room.game.winner,
      winReason: room.game.winReason,
      ejection: room.game.ejection,
      meeting: room.game.meeting,
      taskProgress: playing
        ? {
            done: crewTasks.filter((task) => task.done).length,
            total: crewTasks.length,
          }
        : { done: 0, total: 0 },
      players: [...room.players.values()]
        .map((player) => {
          const dead = player.lifeStatus === 'ghost'
          return {
            id: player.id,
            name: player.name,
            color: player.color,
            alive: !dead,
            role: dead ? player.role : null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      sabotages: room.game.sabotages.map((sabotage) => ({
        id: sabotage.id,
        name: sabotage.name,
        room: sabotage.room,
        active: room.game.activeSabotage?.sabotageId === sabotage.id,
        endsAtMs:
          room.game.activeSabotage?.sabotageId === sabotage.id
            ? room.game.activeSabotage.endsAtMs
            : null,
      })),
      serverNowMs: Date.now(),
    }
  }

  callMeeting(
    code: string,
    playerId: string,
    kind: MeetingKind,
    reportedPlayerId?: string,
  ): Meeting {
    const room = this.playerRoom(code, playerId)
    if (room.game.status !== 'playing') throw new Error('A meeting cannot be called right now')
    const player = this.getPlayer(room, playerId)
    if (player.lifeStatus !== 'alive') throw new Error('Ghosts cannot call meetings')
    if (kind !== 'emergency' && kind !== 'body') {
      throw new Error('Unknown meeting type')
    }
    if (kind === 'emergency') {
      if (room.game.activeSabotage) {
        throw new Error('Emergency meetings cannot be called during a sabotage')
      }
      if (player.emergencyMeetingsUsed >= room.game.emergencyMeetingsPerPlayer) {
        throw new Error('You have no emergency meetings left')
      }
      if ((room.game.emergencyCooldownEndsAtMs ?? 0) > Date.now()) {
        throw new Error('Emergency meetings are still on cooldown')
      }
      player.emergencyMeetingsUsed += 1
    }
    let reportedPlayer: Player | null = null
    if (kind === 'body') {
      reportedPlayer = this.bodyFoundThisRound(room, reportedPlayerId)
      if (!reportedPlayer) throw new Error('No body found')
    }
    if (room.game.activeSabotage) this.finishSabotage(room)
    const meeting: Meeting = {
      id: randomUUID(),
      kind,
      triggeredById: player.id,
      triggeredByName: player.name,
      reportedPlayerId: reportedPlayer?.id ?? null,
      reportedPlayerName: reportedPlayer?.name ?? null,
      startedAtMs: null,
    }
    room.game.status = 'meeting'
    room.game.meeting = meeting
    return meeting
  }

  voteOut(code: string, playerId: string, targetId: string): Ejection {
    const room = this.playerRoom(code, playerId)
    const meeting = room.game.meeting
    if (room.game.status !== 'meeting' || !meeting) throw new Error('There is no meeting')
    if (meeting.triggeredById !== playerId) {
      throw new Error('Only the player who called the meeting can vote someone out')
    }
    const target = this.getPlayer(room, targetId)
    if (target.lifeStatus !== 'alive' || !target.role) {
      throw new Error('That player cannot be voted out')
    }
    target.lifeStatus = 'ghost'
    target.deathEndsAtMs = null
    const ejection: Ejection = {
      playerId: target.id,
      name: target.name,
      role: target.role,
    }
    room.game.ejection = ejection
    this.endMeeting(code)
    this.maybeWinFromLives(room)
    return ejection
  }

  startMeeting(code: string, playerId: string): void {
    const room = this.playerRoom(code, playerId)
    const meeting = room.game.meeting
    if (room.game.status !== 'meeting' || !meeting) throw new Error('There is no meeting')
    if (meeting.triggeredById !== playerId) {
      throw new Error('Only the player who called the meeting can start the timer')
    }
    if (meeting.startedAtMs !== null) return
    meeting.startedAtMs = Date.now()
  }

  endMeeting(code: string, playerId?: string): void {
    const room = this.getRoom(code)
    if (
      playerId !== undefined &&
      room.game.hostId !== playerId &&
      room.game.meeting?.triggeredById !== playerId
    ) {
      throw new Error('Only the host or meeting caller can resume play')
    }
    if (room.game.status !== 'meeting') return
    room.game.status = 'playing'
    room.game.meeting = null
    this.beginRound(room)
    room.game.globalKillCooldownEndsAtMs =
      Date.now() + room.game.postMeetingKillCooldownSeconds * 1000
    room.game.emergencyCooldownEndsAtMs =
      Date.now() + room.game.postMeetingEmergencyCooldownSeconds * 1000
  }

  snapshot(code: string, viewerId: string): GameSnapshot {
    const room = this.getRoom(code)
    const viewer = this.getPlayer(room, viewerId)
    const canSeeImposters = viewer.role === 'imposter'
    const players = [...room.players.values()]
      .map((player) => ({
        ...player,
        role:
          player.id === viewerId || (canSeeImposters && player.role === 'imposter')
            ? player.role
            : null,
        lifeStatus: player.id === viewerId ? player.lifeStatus : 'alive',
        deathEndsAtMs: player.id === viewerId ? player.deathEndsAtMs : null,
        killedByName: player.id === viewerId ? player.killedByName : null,
        killedInRoundId: player.id === viewerId ? player.killedInRoundId : null,
        killCooldownEndsAtMs:
          player.id === viewerId && player.role === 'imposter'
            ? player.killCooldownEndsAtMs
            : null,
        emergencyMeetingsUsed:
          player.id === viewerId ? player.emergencyMeetingsUsed : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const game = structuredClone(room.game)
    if (viewer.role !== 'imposter') game.globalKillCooldownEndsAtMs = null
    if (viewer.role !== 'imposter') game.sabotageCooldownEndsAtMs = null
    if (!viewer.isHost) game.dashboardCode = ''
    game.voteCandidates =
      game.status === 'meeting'
        ? [...room.players.values()]
            .filter((player) => player.lifeStatus === 'alive')
            .map((player) => ({ id: player.id, name: player.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : []
    if (game.status === 'lobby') {
      if (!viewer.isHost) game.sabotages = []
    } else if (game.status === 'pregame') {
      game.sabotages = game.sabotages.map((sabotage) => ({
        ...sabotage,
        deactivationCode: '',
        deviceCode: '',
      }))
    } else if (viewer.role === 'imposter') {
      game.sabotages = game.sabotages.map((sabotage) => ({
        ...sabotage,
        deactivationCode: '',
        deviceCode: '',
      }))
    } else {
      game.sabotages = []
    }
    if (
      game.status === 'playing' ||
      game.status === 'meeting' ||
      game.status === 'ended'
    ) {
      game.tasks = structuredClone(room.assignments.get(viewerId) ?? [])
      const crewTasks = [...room.players.values()]
        .filter((player) => player.role === 'crewmate')
        .flatMap((player) => room.assignments.get(player.id) ?? [])
      game.taskProgress = {
        done: crewTasks.filter((task) => task.done).length,
        total: crewTasks.length,
      }
    }
    game.serverNowMs = Date.now()
    return { game, players }
  }

  hasRoom(code: string): boolean {
    return this.rooms.has(normalizeCode(code))
  }

  playerIds(code: string): string[] {
    return [...this.getRoom(code).players.keys()]
  }

  private beginRound(room: Room): void {
    room.game.roundId += 1
    room.game.roundAlivePlayerIds = [...room.players.values()]
      .filter((player) => player.lifeStatus === 'alive')
      .map((player) => player.id)
  }

  private bodyFoundThisRound(room: Room, reportedPlayerId: string | undefined): Player | null {
    if (!reportedPlayerId) return null
    if (!room.game.roundAlivePlayerIds.includes(reportedPlayerId)) return null
    const reported = room.players.get(reportedPlayerId)
    if (!reported) return null
    if (reported.killedInRoundId !== room.game.roundId) return null
    if (reported.lifeStatus !== 'dying' && reported.lifeStatus !== 'ghost') return null
    return reported
  }

  private finishSabotage(room: Room): void {
    room.game.activeSabotage = null
    room.game.sabotageCooldownEndsAtMs =
      Date.now() + room.game.sabotageCooldownSeconds * 1000
  }

  private maybeWinFromTasks(room: Room): void {
    if (room.game.status !== 'playing') return
    const crewTasks = [...room.players.values()]
      .filter((player) => player.role === 'crewmate')
      .flatMap((player) => room.assignments.get(player.id) ?? [])
    if (crewTasks.length === 0) return
    if (crewTasks.some((task) => !task.done)) return
    room.game.status = 'ended'
    room.game.winner = 'crewmates'
    room.game.winReason = 'tasks'
    room.game.meeting = null
    room.game.activeSabotage = null
  }

  private maybeWinFromLives(room: Room): void {
    if (room.game.status !== 'playing' && room.game.status !== 'meeting') return
    const alive = [...room.players.values()].filter((player) => player.lifeStatus === 'alive')
    const aliveCrew = alive.filter((player) => player.role === 'crewmate')
    const aliveImposters = alive.filter((player) => player.role === 'imposter')
    if (aliveImposters.length === 0) {
      room.game.status = 'ended'
      room.game.winner = 'crewmates'
      room.game.winReason = 'votes'
      room.game.meeting = null
      room.game.activeSabotage = null
      return
    }
    if (aliveCrew.length === 0) {
      room.game.status = 'ended'
      room.game.winner = 'imposters'
      room.game.winReason = room.game.ejection ? 'votes' : 'kills'
      room.game.meeting = null
      room.game.activeSabotage = null
    }
  }

  private assertCanStart(room: Room): void {
    const players = [...room.players.values()]
    if (players.length < 3) throw new Error('Need at least 3 players to start')
    if (room.game.impostorCount < 1) throw new Error('Need at least 1 imposter')
    if (room.game.impostorCount >= players.length / 2) {
      throw new Error('Imposter count must be strictly lower than half the player count')
    }
    if (room.game.tasks.length < room.game.tasksPerPlayer) {
      throw new Error('Add enough tasks for each player')
    }
  }

  private generateUniqueDeviceCode(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateSecretCode(8)
      if (!this.isDeviceCodeUsed(code)) return code
    }
    throw new Error('Could not generate a device code')
  }

  private isDeviceCodeUsed(
    code: string,
    except?: { room: Room; ignoreDashboard?: boolean; ignoreSabotages?: boolean },
  ): boolean {
    for (const room of this.rooms.values()) {
      const skipDashboard = except?.room === room && except.ignoreDashboard
      const skipSabotages = except?.room === room && except.ignoreSabotages
      if (!skipDashboard && room.game.dashboardCode === code) return true
      if (
        !skipSabotages &&
        room.game.sabotages.some((sabotage) => sabotage.deviceCode === code)
      ) {
        return true
      }
    }
    return false
  }

  private getRoom(code: string): Room {
    const room = this.rooms.get(normalizeCode(code))
    if (!room) throw new Error('No game found for that code')
    return room
  }

  private playerRoom(code: string, playerId: string): Room {
    const room = this.getRoom(code)
    this.getPlayer(room, playerId)
    return room
  }

  private hostRoom(code: string, playerId: string): Room {
    const room = this.playerRoom(code, playerId)
    this.assertHost(room, playerId)
    return room
  }

  private getPlayer(room: Room, playerId: string): Player {
    const player = room.players.get(playerId)
    if (!player) throw new Error('You are not part of this game')
    return player
  }

  private assertHost(room: Room, playerId: string): void {
    if (room.game.hostId !== playerId) throw new Error('Only the host can do that')
  }

  private revokePlayer(code: string, playerId: string): void {
    for (const [token, session] of this.sessions) {
      if (session.code === code && session.playerId === playerId) this.sessions.delete(token)
    }
  }

  private revokeRoom(code: string): void {
    for (const [token, session] of this.sessions) {
      if (session.code === code) this.sessions.delete(token)
    }
  }
}

export function sanitizeName(raw: string, maxLength = 16): string {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, maxLength)
  if (!name) throw new Error('Enter a name')
  return name
}

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((character) => CODE_ALPHABET.includes(character))
    .join('')
    .slice(0, 4)
}

function isValidCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{4}$`).test(code)
}

function generateCode(): string {
  const bytes = randomBytes(4)
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

function tasksFromTemplates(
  templates: Array<{ text: string; room: string; details: string }>,
): Task[] {
  return templates.map((template) => ({
    id: randomUUID(),
    text: template.text,
    room: template.room,
    details: template.details,
    done: false,
    doneByName: null,
  }))
}

function sanitizeTaskText(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Every task needs text')
  const text = raw.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (!text) throw new Error('Every task needs text')
  return text
}

function sanitizeTaskRoom(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Every task needs a room')
  const room = raw.trim().replace(/\s+/g, ' ').slice(0, 40)
  if (!room) throw new Error('Every task needs a room')
  return room
}

function sanitizeTaskDetails(raw: unknown): string {
  if (raw === undefined) return ''
  if (typeof raw !== 'string') throw new Error('Task details must be text')
  return raw.trim().replace(/\s+/g, ' ').slice(0, 240)
}

function validateDuration(seconds: number, label: string): void {
  if (!Number.isInteger(seconds) || seconds < 30 || seconds % 30 !== 0) {
    throw new Error(`${label} must use 30-second steps`)
  }
}

function validatedDuration(seconds: number, label: string): number {
  validateDuration(seconds, label)
  return seconds
}

function sanitizeSabotageName(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Every sabotage needs a name')
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (!name) throw new Error('Every sabotage needs a name')
  return name
}

function sanitizeSabotageMethod(raw: unknown): SabotageMethod {
  if (raw === 'trust' || raw === 'code' || raw === 'device') return raw
  throw new Error('Invalid sabotage deactivation method')
}

function normalizeSecretCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((character) => CODE_ALPHABET.includes(character))
    .join('')
}

function validSecretCode(raw: unknown, length: number): string | null {
  if (typeof raw !== 'string') return null
  const code = normalizeSecretCode(raw)
  return code.length === length ? code : null
}

function generateSecretCode(length: number): string {
  const bytes = randomBytes(length)
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index--) {
    const random = randomBytes(4).readUInt32BE(0)
    const target = random % (index + 1)
    ;[next[index], next[target]] = [next[target]!, next[index]!]
  }
  return next
}
