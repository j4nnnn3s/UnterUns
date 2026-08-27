import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { WebSocket, WebSocketServer } from 'ws'
import { GameEngine, type SettingsPatch } from './engine.js'

interface ClientMessage {
  type?: string
  requestId?: string
  playerId?: string
  code?: string
  name?: string
  taskId?: string
  killerId?: string
  sabotageId?: string
  deactivationCode?: string
  deviceCode?: string
  kind?: 'emergency' | 'body'
  targetId?: string
  patch?: SettingsPatch
}

interface ConnectionState {
  playerId: string | null
  code: string | null
  deviceKind: 'sabotage' | 'dashboard' | null
  deviceSabotageId: string | null
}

const host = process.env.HOST ?? '0.0.0.0'
const port = Number(process.env.PORT ?? 4173)
const root = fileURLToPath(new URL('..', import.meta.url))
const dist = resolve(process.env.DIST ?? resolve(root, 'dist'))
const engine = new GameEngine()
const connections = new Map<WebSocket, ConnectionState>()
const meetingTimers = new Map<string, NodeJS.Timeout>()
const deathTimers = new Map<string, NodeJS.Timeout>()
const sabotageTimers = new Map<string, NodeJS.Timeout>()
const MAX_TIMEOUT_MS = 2_147_000_000

const server = createServer((request, response) => serveStatic(request, response))
const sockets = new WebSocketServer({ server, path: '/ws' })

sockets.on('connection', (socket) => {
  connections.set(socket, {
    playerId: null,
    code: null,
    deviceKind: null,
    deviceSabotageId: null,
  })

  socket.on('message', (raw) => {
    void handleMessage(socket, raw.toString())
  })
  socket.on('close', () => {
    connections.delete(socket)
  })
  socket.on('error', () => {
    connections.delete(socket)
  })
})

async function handleMessage(socket: WebSocket, raw: string): Promise<void> {
  let message: ClientMessage
  try {
    message = JSON.parse(raw) as ClientMessage
  } catch {
    sendError(socket, undefined, 'Invalid message')
    return
  }

  const state = connections.get(socket)
  if (!state) return

  try {
    if (message.type === 'identify') {
      if (typeof message.playerId !== 'string' || message.playerId.length < 8) {
        throw new Error('Invalid player identity')
      }
      state.playerId = message.playerId
      sendOk(socket, message.requestId)
      return
    }

    const playerId = state.playerId
    if (!playerId) throw new Error('Identify this device first')

    switch (message.type) {
      case 'create_game': {
        const snapshot = engine.createGame(playerId, requireString(message.name, 'name'))
        state.code = snapshot.game.code
        state.deviceKind = null
        state.deviceSabotageId = null
        sendOk(socket, message.requestId, { code: snapshot.game.code, playerId })
        broadcast(snapshot.game.code)
        break
      }
      case 'join_game': {
        const snapshot = engine.joinGame(
          playerId,
          requireString(message.code, 'code'),
          requireString(message.name, 'name'),
        )
        state.code = snapshot.game.code
        state.deviceKind = null
        state.deviceSabotageId = null
        sendOk(socket, message.requestId, { code: snapshot.game.code, playerId })
        broadcast(snapshot.game.code)
        break
      }
      case 'resume': {
        const snapshot = engine.resumeGame(requireString(message.code, 'code'), playerId)
        state.code = snapshot.game.code
        state.deviceKind = null
        state.deviceSabotageId = null
        sendOk(socket, message.requestId)
        broadcast(snapshot.game.code)
        break
      }
      case 'leave_game': {
        const code = requireString(message.code ?? state.code, 'code')
        const result = engine.leaveGame(code, playerId)
        state.code = null
        state.deviceKind = null
        state.deviceSabotageId = null
        sendOk(socket, message.requestId)
        if (result.closed) {
          clearMeetingTimer(code)
          clearDeathTimers(code)
          clearSabotageTimer(code)
          closeRoom(code)
        } else {
          clearDeathTimer(code, playerId)
          broadcast(code)
        }
        break
      }
      case 'update_settings': {
        const code = requireString(message.code ?? state.code, 'code')
        engine.updateSettings(code, playerId, message.patch ?? {})
        sendOk(socket, message.requestId)
        broadcast(code)
        break
      }
      case 'start_game': {
        const code = requireString(message.code ?? state.code, 'code')
        engine.startGame(code, playerId)
        sendOk(socket, message.requestId)
        broadcast(code)
        break
      }
      case 'start_pregame': {
        const code = requireString(message.code ?? state.code, 'code')
        engine.startPregame(code, playerId)
        sendOk(socket, message.requestId)
        broadcast(code)
        break
      }
      case 'return_to_lobby': {
        const code = requireString(message.code ?? state.code, 'code')
        engine.returnToLobby(code, playerId)
        clearMeetingTimer(code)
        clearDeathTimers(code)
        clearSabotageTimer(code)
        sendOk(socket, message.requestId)
        broadcast(code)
        break
      }
      case 'toggle_task': {
        const code = requireString(message.code ?? state.code, 'code')
        engine.toggleTask(code, playerId, requireString(message.taskId, 'taskId'))
        sendOk(socket, message.requestId)
        if (engine.hasRoom(code) && engine.snapshot(code, playerId).game.status === 'ended') {
          clearSabotageTimer(code)
          clearMeetingTimer(code)
          clearDeathTimers(code)
        }
        broadcast(code)
        break
      }
      case 'call_meeting': {
        const code = requireString(message.code ?? state.code, 'code')
        const kind = message.kind === 'body' ? 'body' : message.kind === 'emergency' ? 'emergency' : null
        if (!kind) throw new Error('Unknown meeting type')
        engine.callMeeting(code, playerId, kind)
        sendOk(socket, message.requestId)
        broadcast(code)
        break
      }
      case 'kill_candidates': {
        const code = requireString(message.code ?? state.code, 'code')
        const candidates = engine.killCandidates(code, playerId)
        sendOk(socket, message.requestId, candidates)
        break
      }
      case 'report_killed': {
        const code = requireString(message.code ?? state.code, 'code')
        const killerId = requireString(message.killerId, 'killerId')
        const deathEndsAtMs = engine.reportKilled(code, playerId, killerId)
        scheduleGhost(code, playerId, deathEndsAtMs)
        sendOk(socket, message.requestId)
        if (engine.hasRoom(code) && engine.snapshot(code, playerId).game.status === 'ended') {
          clearSabotageTimer(code)
          clearMeetingTimer(code)
        }
        broadcast(code)
        break
      }
      case 'activate_sabotage': {
        const code = requireString(message.code ?? state.code, 'code')
        const active = engine.activateSabotage(
          code,
          playerId,
          requireString(message.sabotageId, 'sabotageId'),
        )
        scheduleSabotageEnd(code, active.id, active.endsAtMs)
        sendOk(socket, message.requestId)
        broadcast(code)
        break
      }
      case 'deactivate_sabotage': {
        const code = requireString(message.code ?? state.code, 'code')
        engine.deactivateSabotage(code, playerId, message.deactivationCode)
        clearSabotageTimer(code)
        sendOk(socket, message.requestId)
        broadcast(code)
        break
      }
      case 'connect_device': {
        const connection = engine.connectDevice(
          requireString(message.deviceCode, 'deviceCode'),
        )
        state.code = connection.code
        if (connection.kind === 'dashboard') {
          state.deviceKind = 'dashboard'
          state.deviceSabotageId = null
          sendOk(socket, message.requestId, engine.snapshotDashboard(connection.code))
        } else {
          state.deviceKind = 'sabotage'
          state.deviceSabotageId = connection.sabotageId
          sendOk(
            socket,
            message.requestId,
            engine.snapshotDevice(connection.code, connection.sabotageId),
          )
        }
        break
      }
      case 'deactivate_from_device': {
        const code = requireString(state.code, 'code')
        if (state.deviceKind !== 'sabotage') {
          throw new Error('This device cannot deactivate sabotages')
        }
        const sabotageId = requireString(state.deviceSabotageId, 'sabotageId')
        engine.deactivateSabotageFromDevice(code, sabotageId)
        clearSabotageTimer(code)
        sendOk(socket, message.requestId)
        broadcast(code)
        break
      }
      case 'start_meeting': {
        const code = requireString(message.code ?? state.code, 'code')
        engine.startMeeting(code, playerId)
        scheduleMeetingEnd(code)
        sendOk(socket, message.requestId)
        broadcast(code)
        break
      }
      case 'end_meeting': {
        const code = requireString(message.code ?? state.code, 'code')
        engine.endMeeting(code, playerId)
        clearMeetingTimer(code)
        sendOk(socket, message.requestId)
        broadcast(code)
        break
      }
      case 'vote_out': {
        const code = requireString(message.code ?? state.code, 'code')
        engine.voteOut(code, playerId, requireString(message.targetId, 'targetId'))
        clearMeetingTimer(code)
        sendOk(socket, message.requestId)
        if (engine.hasRoom(code) && engine.snapshot(code, playerId).game.status === 'ended') {
          clearSabotageTimer(code)
          clearDeathTimers(code)
        }
        broadcast(code)
        break
      }
      default:
        throw new Error('Unknown action')
    }
  } catch (error) {
    sendError(
      socket,
      message.requestId,
      error instanceof Error ? error.message : 'Something went wrong',
    )
  }
}

function broadcast(code: string): void {
  if (!engine.hasRoom(code)) return
  for (const [socket, state] of connections) {
    if (state.code !== code || !state.playerId || socket.readyState !== WebSocket.OPEN) continue
    try {
      if (state.deviceKind === 'dashboard') {
        send(socket, {
          type: 'device_snapshot',
          device: engine.snapshotDashboard(code),
        })
      } else if (state.deviceSabotageId) {
        send(socket, {
          type: 'device_snapshot',
          device: engine.snapshotDevice(code, state.deviceSabotageId),
        })
      } else {
        send(socket, { type: 'snapshot', ...engine.snapshot(code, state.playerId) })
      }
    } catch {
      state.code = null
      if (state.deviceKind) {
        state.deviceKind = null
        state.deviceSabotageId = null
        send(socket, { type: 'device_closed' })
      } else {
        send(socket, { type: 'game_closed' })
      }
    }
  }
}

function closeRoom(code: string): void {
  for (const [socket, state] of connections) {
    if (state.code !== code) continue
    state.code = null
    if (state.deviceKind) {
      state.deviceKind = null
      state.deviceSabotageId = null
      send(socket, { type: 'device_closed' })
    } else {
      send(socket, { type: 'game_closed' })
    }
  }
}

function scheduleMeetingEnd(code: string): void {
  clearMeetingTimer(code)
  const snapshot = engine.snapshot(code, engine.playerIds(code)[0]!)
  const endsAtMs = Date.now() + snapshot.game.discussionSeconds * 1000
  const tick = () => {
    const remaining = endsAtMs - Date.now()
    if (remaining > 0) {
      meetingTimers.set(code, setTimeout(tick, Math.min(remaining, MAX_TIMEOUT_MS)))
      return
    }
    meetingTimers.delete(code)
    if (!engine.hasRoom(code)) return
    engine.endMeeting(code)
    broadcast(code)
  }
  tick()
}

function clearMeetingTimer(code: string): void {
  const timer = meetingTimers.get(code)
  if (timer) clearTimeout(timer)
  meetingTimers.delete(code)
}

function scheduleGhost(code: string, playerId: string, deathEndsAtMs: number): void {
  const key = `${code}:${playerId}`
  const existing = deathTimers.get(key)
  if (existing) clearTimeout(existing)
  const tick = () => {
    const remaining = deathEndsAtMs - Date.now()
    if (remaining > 0) {
      deathTimers.set(key, setTimeout(tick, Math.min(remaining, MAX_TIMEOUT_MS)))
      return
    }
    deathTimers.delete(key)
    if (!engine.hasRoom(code)) return
    engine.makeGhost(code, playerId)
    broadcast(code)
  }
  tick()
}

function clearDeathTimers(code: string): void {
  for (const [key, timer] of deathTimers) {
    if (!key.startsWith(`${code}:`)) continue
    clearTimeout(timer)
    deathTimers.delete(key)
  }
}

function clearDeathTimer(code: string, playerId: string): void {
  const key = `${code}:${playerId}`
  const timer = deathTimers.get(key)
  if (timer) clearTimeout(timer)
  deathTimers.delete(key)
}

function scheduleSabotageEnd(code: string, activeId: string, endsAtMs: number): void {
  clearSabotageTimer(code)
  const tick = () => {
    const remaining = endsAtMs - Date.now()
    if (remaining > 0) {
      sabotageTimers.set(code, setTimeout(tick, Math.min(remaining, MAX_TIMEOUT_MS)))
      return
    }
    sabotageTimers.delete(code)
    if (!engine.hasRoom(code) || !engine.expireSabotage(code, activeId)) return
    clearMeetingTimer(code)
    clearDeathTimers(code)
    broadcast(code)
  }
  tick()
}

function clearSabotageTimer(code: string): void {
  const timer = sabotageTimers.get(code)
  if (timer) clearTimeout(timer)
  sabotageTimers.delete(code)
}

function sendOk(socket: WebSocket, requestId?: string, data?: unknown): void {
  send(socket, { type: 'ok', requestId, data })
}

function sendError(socket: WebSocket, requestId: string | undefined, message: string): void {
  send(socket, { type: 'error', requestId, message })
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Missing ${label}`)
  return value
}

function serveStatic(request: IncomingMessage, response: ServerResponse): void {
  if (!existsSync(dist)) {
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('UnterUns is not built yet. Run "npm run build" first.\n')
    return
  }

  const requestPath = decodeURIComponent((request.url ?? '/').split('?')[0]!)
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
  let filePath = resolve(dist, relativePath)
  if (!filePath.startsWith(`${dist}${sep}`) && filePath !== dist) {
    response.writeHead(403)
    response.end()
    return
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = resolve(dist, 'index.html')
  }

  response.writeHead(200, {
    'Content-Type': contentType(filePath),
    'Cache-Control': filePath.endsWith('index.html')
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(response)
}

function contentType(filePath: string): string {
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
  }
  return types[extname(filePath)] ?? 'application/octet-stream'
}

server.listen(port, host, async () => {
  console.log(`UnterUns is running on port ${port}`)
  const urls = lanAddresses().map((address) => `http://${address}:${port}`)
  if (urls.length === 0) {
    console.log('No LAN address found. Check the host network connection.')
    return
  }
  for (const url of urls) console.log(`LAN: ${url}`)
  console.log('\nScan to open UnterUns:')
  try {
    console.log(
      await QRCode.toString(urls[0]!, {
        type: 'terminal',
        small: true,
        errorCorrectionLevel: 'M',
      }),
    )
  } catch {
    console.log('Could not render the QR code. Open the LAN address above.')
  }
})

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)
}
