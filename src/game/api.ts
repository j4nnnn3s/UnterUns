import type {
  ConnectedDevice,
  Game,
  KillCandidate,
  Player,
  Sabotage,
  Task,
} from '../types'
import { createId } from '../id'
import { isValidCode, normalizeCode } from './codes'
import { syncServerNow } from './time'

const PLAYER_ID_KEY = 'unteruns.playerId'
const SESSION_KEY = 'unteruns.session'
const DEVICE_SESSION_KEY = 'unteruns.deviceSession'
const NAME_KEY = 'amonghaus.name'

interface ServerResponse {
  type: 'ok' | 'error'
  requestId?: string
  data?: unknown
  message?: string
}

interface SnapshotMessage {
  type: 'snapshot'
  game: Game
  players: Player[]
}

interface DeviceSnapshotMessage {
  type: 'device_snapshot'
  device: ConnectedDevice
}

interface Subscription {
  code: string
  onGame: (game: Game | null) => void
  onPlayers: (players: Player[]) => void
  onError: (error: Error) => void
}

interface DeviceSubscription {
  deviceCode: string
  onDevice: (device: ConnectedDevice | null) => void
  onError: (error: Error) => void
}

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
}

let socket: WebSocket | null = null
let connecting: Promise<void> | null = null
let reconnectTimer: number | null = null
let reconnectDelay = 500
let subscription: Subscription | null = null
let deviceSubscription: DeviceSubscription | null = null
const pending = new Map<string, PendingRequest>()

export function getPlayerId(): string {
  let id = sessionStorage.getItem(PLAYER_ID_KEY)
  if (!id) {
    id = createId()
    sessionStorage.setItem(PLAYER_ID_KEY, id)
  }
  return id
}

export function getSavedName(): string {
  return localStorage.getItem(NAME_KEY) ?? ''
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name)
}

export function loadSession(): { code: string; playerId: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { code?: string; playerId?: string }
    if (!parsed.code || !parsed.playerId) return null
    return { code: parsed.code, playerId: parsed.playerId }
  } catch {
    return null
  }
}

export function saveSession(code: string, playerId: string): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerId }))
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

export function loadDeviceSession(): string | null {
  return sessionStorage.getItem(DEVICE_SESSION_KEY)
}

export function clearDeviceSession(): void {
  sessionStorage.removeItem(DEVICE_SESSION_KEY)
}

export function subscribeToGame(
  code: string,
  onGame: (game: Game | null) => void,
  onPlayers: (players: Player[]) => void,
  onError: (error: Error) => void,
): () => void {
  const current: Subscription = { code, onGame, onPlayers, onError }
  subscription = current
  void request('resume', { code }).catch((error: unknown) => {
    if (subscription !== current) return
    const nextError = asError(error)
    if (nextError.message === 'Your session is no longer active' || nextError.message.includes('No game found')) {
      onGame(null)
      onPlayers([])
      return
    }
    onError(nextError)
  })

  return () => {
    if (subscription === current) subscription = null
  }
}

export function subscribeToDevice(
  deviceCode: string,
  onDevice: (device: ConnectedDevice | null) => void,
  onError: (error: Error) => void,
): () => void {
  const current: DeviceSubscription = { deviceCode, onDevice, onError }
  deviceSubscription = current
  void request('connect_device', { deviceCode })
    .then((device) => {
      if (deviceSubscription === current) {
        onDevice(device as ConnectedDevice)
      }
    })
    .catch((error: unknown) => {
      if (deviceSubscription === current) onError(asError(error))
    })
  return () => {
    if (deviceSubscription === current) deviceSubscription = null
  }
}

export async function createGame(hostName: string): Promise<{
  code: string
  playerId: string
}> {
  const name = sanitizeName(hostName)
  saveName(name)
  const result = (await request('create_game', { name })) as {
    code: string
    playerId: string
  }
  saveSession(result.code, result.playerId)
  return result
}

export async function joinGame(rawCode: string, rawName: string): Promise<{
  code: string
  playerId: string
}> {
  const code = normalizeCode(rawCode)
  if (!isValidCode(code)) throw new Error('Enter a 4-character join code')
  const name = sanitizeName(rawName)
  saveName(name)
  const result = (await request('join_game', { code, name })) as {
    code: string
    playerId: string
  }
  saveSession(result.code, result.playerId)
  return result
}

export async function leaveGame(code: string): Promise<void> {
  await request('leave_game', { code })
  clearSession()
}

export async function updateSettings(
  code: string,
  patch: {
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
  },
): Promise<void> {
  await request('update_settings', { code, patch })
}

export async function startGame(code: string): Promise<void> {
  await request('start_game', { code })
}

export async function startPregame(code: string): Promise<void> {
  await request('start_pregame', { code })
}

export async function returnToLobby(code: string): Promise<void> {
  await request('return_to_lobby', { code })
}

export async function toggleTask(code: string, taskId: string): Promise<void> {
  await request('toggle_task', { code, taskId })
}

export async function callMeeting(
  code: string,
  kind: 'emergency' | 'body',
): Promise<void> {
  await request('call_meeting', { code, kind })
}

export async function getKillCandidates(code: string): Promise<KillCandidate[]> {
  return (await request('kill_candidates', { code })) as KillCandidate[]
}

export async function reportKilled(code: string, killerId: string): Promise<void> {
  await request('report_killed', { code, killerId })
}

export async function activateSabotage(code: string, sabotageId: string): Promise<void> {
  await request('activate_sabotage', { code, sabotageId })
}

export async function deactivateSabotage(
  code: string,
  deactivationCode?: string,
): Promise<void> {
  await request('deactivate_sabotage', { code, deactivationCode })
}

export async function connectSabotageDevice(
  rawDeviceCode: string,
): Promise<{ deviceCode: string; device: ConnectedDevice }> {
  const deviceCode = normalizeDeviceCode(rawDeviceCode)
  if (deviceCode.length !== 8) throw new Error('Enter the 8-character device code')
  const device = (await request('connect_device', { deviceCode })) as ConnectedDevice
  sessionStorage.setItem(DEVICE_SESSION_KEY, deviceCode)
  clearSession()
  return { deviceCode, device }
}

export async function deactivateFromDevice(): Promise<void> {
  await request('deactivate_from_device', {})
}

export async function startMeeting(code: string): Promise<void> {
  await request('start_meeting', { code })
}

export async function endMeeting(code: string): Promise<void> {
  await request('end_meeting', { code })
}

export async function voteOut(code: string, targetId: string): Promise<void> {
  await request('vote_out', { code, targetId })
}

export function sanitizeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 16)
  if (!name) throw new Error('Enter a name')
  return name
}

async function request(type: string, payload: Record<string, unknown>): Promise<unknown> {
  await ensureConnected()
  return sendRequest(type, payload)
}

async function ensureConnected(): Promise<void> {
  if (socket?.readyState === WebSocket.OPEN) return
  if (connecting) return connecting

  connecting = new Promise<void>((resolve, reject) => {
    const next = new WebSocket(webSocketUrl())
    socket = next
    const timeout = window.setTimeout(() => {
      next.close()
      reject(new Error('Cannot reach the UnterUns host'))
    }, 5000)

    next.addEventListener('open', () => {
      void sendRequest('identify', { playerId: getPlayerId() })
        .then(() => {
          window.clearTimeout(timeout)
          reconnectDelay = 500
          resolve()
        })
        .catch((error: unknown) => {
          window.clearTimeout(timeout)
          reject(error)
        })
    })
    next.addEventListener('message', handleMessage)
    next.addEventListener('close', handleDisconnect)
    next.addEventListener('error', () => {
      if (next.readyState !== WebSocket.OPEN) {
        window.clearTimeout(timeout)
        reject(new Error('Cannot reach the UnterUns host'))
      }
    })
  }).finally(() => {
    connecting = null
  })

  return connecting
}

function sendRequest(type: string, payload: Record<string, unknown>): Promise<unknown> {
  const current = socket
  if (!current || current.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('Not connected to the UnterUns host'))
  }
  const requestId = createId()
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    current.send(JSON.stringify({ type, requestId, ...payload }))
    window.setTimeout(() => {
      const request = pending.get(requestId)
      if (!request) return
      pending.delete(requestId)
      request.reject(new Error('The host did not respond'))
    }, 8000)
  })
}

function handleMessage(event: MessageEvent<string>): void {
  const message = JSON.parse(event.data) as
    | ServerResponse
    | SnapshotMessage
    | DeviceSnapshotMessage
    | { type: 'game_closed' }
    | { type: 'device_closed' }

  if (message.type === 'snapshot') {
    syncFromPayload(message)
    if (!subscription || subscription.code !== message.game.code) return
    subscription.onGame(message.game)
    subscription.onPlayers(message.players)
    return
  }
  if (message.type === 'game_closed') {
    subscription?.onGame(null)
    subscription?.onPlayers([])
    return
  }
  if (message.type === 'device_snapshot') {
    syncFromPayload(message.device)
    deviceSubscription?.onDevice(message.device)
    return
  }
  if (message.type === 'device_closed') {
    clearDeviceSession()
    deviceSubscription?.onDevice(null)
    return
  }
  if ((message.type === 'ok' || message.type === 'error') && message.requestId) {
    const current = pending.get(message.requestId)
    if (!current) return
    pending.delete(message.requestId)
    if (message.type === 'error') current.reject(new Error(message.message ?? 'Request failed'))
    else {
      syncFromPayload(message.data)
      current.resolve(message.data)
    }
  }
}

function handleDisconnect(): void {
  socket = null
  for (const request of pending.values()) request.reject(new Error('Connection to the host was lost'))
  pending.clear()
  if ((!subscription && !deviceSubscription) || reconnectTimer !== null) return

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    void ensureConnected()
      .then(() => {
        if (subscription) return request('resume', { code: subscription.code })
        if (deviceSubscription) {
          return request('connect_device', { deviceCode: deviceSubscription.deviceCode })
        }
        return undefined
      })
      .catch((error: unknown) => {
        const nextError = asError(error)
        subscription?.onError(nextError)
        deviceSubscription?.onError(nextError)
        handleDisconnect()
      })
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 5000)
}

function webSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Something went wrong')
}

function syncFromPayload(value: unknown): void {
  if (!value || typeof value !== 'object') return
  const record = value as { serverNowMs?: unknown; game?: { serverNowMs?: unknown } }
  if (typeof record.serverNowMs === 'number') {
    syncServerNow(record.serverNowMs)
    return
  }
  if (typeof record.game?.serverNowMs === 'number') {
    syncServerNow(record.game.serverNowMs)
  }
}

function normalizeDeviceCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
}

export { normalizeCode, isValidCode }
