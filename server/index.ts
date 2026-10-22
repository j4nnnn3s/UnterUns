import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { WebSocket, WebSocketServer } from 'ws'
import { GameEngine, type GameSnapshot, type SettingsPatch } from './engine.js'
import {
  INVALID_MESSAGE,
  TOO_MANY_CREATES,
  TOO_MANY_GUESSES,
  TOO_MANY_JOINS,
  SlidingWindowLimiter,
  assertHostPassword,
  cacheControl,
  clientAddress,
  heartbeatAction,
  isUnknownRoom,
  isUpgradeAllowed,
  parseClientMessage,
  readLimits,
  securityHeaders,
  type ParsedClientMessage,
} from './limits.js'
import {
  readHost,
  readPort,
  readPublicUrl,
  readTrustProxy,
  shareBaseFromForwarded,
  startupAnnouncement,
} from './public-url.js'

interface ConnectionState {
  identified: boolean
  playerId: string | null
  sessionToken: string | null
  code: string | null
  deviceKind: 'sabotage' | 'dashboard' | null
  deviceSabotageId: string | null
  shareBase: string | null
  ip: string
}

const ANONYMOUS_ACTIONS = new Set([
  'create_game',
  'join_game',
  'connect_device',
  'deactivate_from_device',
])

const host = readHost(process.env)
const port = readPort(process.env)
const publicUrl = readPublicUrl(process.env)
const trustProxy = readTrustProxy(process.env)
const limits = readLimits(process.env)
const root = fileURLToPath(new URL('..', import.meta.url))
const dist = resolve(process.env.DIST ?? resolve(root, 'dist'))
const engine = new GameEngine({
  maxRooms: limits.maxRooms,
  maxPlayers: limits.maxPlayers,
  maxNameLength: limits.maxNameLength,
})
const createLimiter = new SlidingWindowLimiter(limits.roomCreateLimit, limits.roomCreateWindowMs)
const joinLimiter = new SlidingWindowLimiter(limits.joinLimit, limits.joinWindowMs)
const guessLimiter = new SlidingWindowLimiter(limits.guessLimit, limits.guessWindowMs)
const connections = new Map<WebSocket, ConnectionState>()
const alive = new WeakMap<WebSocket, boolean>()
const meetingTimers = new Map<string, NodeJS.Timeout>()
const deathTimers = new Map<string, NodeJS.Timeout>()
const sabotageTimers = new Map<string, NodeJS.Timeout>()
const MAX_TIMEOUT_MS = 2_147_000_000

const server = createServer((request, response) => {
  try {
    serveStatic(request, response)
  } catch (error) {
    console.error(error)
    if (response.headersSent) {
      response.destroy()
      return
    }
    response.writeHead(500, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Something went wrong\n')
  }
})
const sockets = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: limits.maxPayloadBytes,
  verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
    const ip = addressFrom(info.req)
    if (
      !isUpgradeAllowed({
        origin: info.origin,
        hostHeader: info.req.headers.host,
        publicUrl,
      })
    ) {
      return false
    }
    return connectionsFor(ip) < limits.maxConnectionsPerIp
  },
})

sockets.on('connection', (socket, request) => {
  alive.set(socket, true)
  connections.set(socket, {
    identified: false,
    playerId: null,
    sessionToken: null,
    code: null,
    deviceKind: null,
    deviceSabotageId: null,
    ip: addressFrom(request),
    shareBase: shareBaseFromForwarded(
      { publicUrl, trustProxy },
      {
        proto: request.headers['x-forwarded-proto'],
        host: request.headers['x-forwarded-host'],
      },
    ),
  })

  socket.on('pong', () => {
    alive.set(socket, true)
  })
  socket.on('message', (raw, isBinary) => {
    try {
      if (isBinary) {
        sendError(socket, undefined, INVALID_MESSAGE)
        return
      }
      void handleMessage(socket, messageText(raw)).catch((error: unknown) => {
        console.error(error)
      })
    } catch (error) {
      console.error(error)
    }
  })
  socket.on('close', () => {
    connections.delete(socket)
    alive.delete(socket)
  })
  socket.on('error', (error) => {
    console.error(error)
    connections.delete(socket)
    alive.delete(socket)
  })
})

const heartbeat = setInterval(() => {
  for (const socket of connections.keys()) {
    if (heartbeatAction(alive.get(socket) !== false) === 'terminate') {
      socket.terminate()
      continue
    }
    alive.set(socket, false)
    socket.ping()
  }
}, limits.heartbeatMs)
heartbeat.unref()

async function handleMessage(socket: WebSocket, raw: string): Promise<void> {
  let message: ParsedClientMessage
  try {
    message = parseClientMessage(raw, limits)
  } catch (error) {
    sendError(socket, undefined, error instanceof Error ? error.message : INVALID_MESSAGE)
    return
  }

  const state = connections.get(socket)
  if (!state) return

  try {
    if (message.type === 'identify') {
      state.identified = true
      state.playerId = null
      state.sessionToken = null
      if (message.sessionToken) {
        const session = engine.sessionFor(message.sessionToken)
        if (!session) throw new Error('Your session is no longer active')
        state.playerId = session.playerId
        state.sessionToken = message.sessionToken
        state.code = session.code
      }
      sendOk(socket, message.requestId, {
        ...(state.shareBase ? { shareBase: state.shareBase } : {}),
        ...(state.playerId ? { playerId: state.playerId } : {}),
      })
      return
    }

    if (!state.identified) throw new Error('Identify this device first')
    const playerId = ANONYMOUS_ACTIONS.has(message.type) ? '' : requireSeat(state)

    switch (message.type) {
      case 'create_game': {
        if (!createLimiter.allow(state.ip)) throw new Error(TOO_MANY_CREATES)
        assertHostPassword(limits.hostPassword, message.hostPassword)
        const seatId = randomUUID()
        const snapshot = engine.createGame(seatId, requireString(message.name, 'name'))
        const sessionToken = engine.openSession(snapshot.game.code, seatId)
        state.playerId = seatId
        state.sessionToken = sessionToken
        state.code = snapshot.game.code
        state.deviceKind = null
        state.deviceSabotageId = null
        sendOk(socket, message.requestId, {
          code: snapshot.game.code,
          playerId: seatId,
          sessionToken,
        })
        broadcast(snapshot.game.code)
        break
      }
      case 'join_game': {
        if (!joinLimiter.allow(state.ip)) throw new Error(TOO_MANY_JOINS)
        const seatId = randomUUID()
        let snapshot: GameSnapshot
        try {
          snapshot = engine.joinGame(
            seatId,
            requireString(message.code, 'code'),
            requireString(message.name, 'name'),
          )
        } catch (error) {
          if (isUnknownRoom(error) && !guessLimiter.allow(state.ip)) {
            throw new Error(TOO_MANY_GUESSES)
          }
          throw error
        }
        const sessionToken = engine.openSession(snapshot.game.code, seatId)
        state.playerId = seatId
        state.sessionToken = sessionToken
        state.code = snapshot.game.code
        state.deviceKind = null
        state.deviceSabotageId = null
        sendOk(socket, message.requestId, {
          code: snapshot.game.code,
          playerId: seatId,
          sessionToken,
        })
        broadcast(snapshot.game.code)
        break
      }
      case 'resume': {
        const token = state.sessionToken
        if (!token) throw new Error('Your session is no longer active')
        let snapshot: GameSnapshot
        try {
          snapshot = engine.resumeByToken(token, requireString(message.code ?? state.code, 'code'))
        } catch (error) {
          if (isUnknownRoom(error) && !guessLimiter.allow(state.ip)) {
            throw new Error(TOO_MANY_GUESSES)
          }
          throw error
        }
        state.playerId = playerId
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
        state.playerId = null
        state.sessionToken = null
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
        engine.updateSettings(code, playerId, (message.patch ?? {}) as SettingsPatch)
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
        engine.callMeeting(
          code,
          playerId,
          kind,
          kind === 'body' ? requireString(message.reportedPlayerId, 'reportedPlayerId') : undefined,
        )
        clearSabotageTimer(code)
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
    if (state.code !== code || socket.readyState !== WebSocket.OPEN) continue
    if (!state.deviceKind && !state.playerId) continue
    try {
      if (state.deviceKind === 'dashboard') {
        send(socket, {
          type: 'device_snapshot',
          device: engine.snapshotDashboard(code),
        })
      } else if (state.deviceKind === 'sabotage' && state.deviceSabotageId) {
        send(socket, {
          type: 'device_snapshot',
          device: engine.snapshotDevice(code, state.deviceSabotageId),
        })
      } else if (state.playerId) {
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
  if (socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify(payload))
  } catch (error) {
    console.error(error)
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Missing ${label}`)
  return value
}

function serveStatic(request: IncomingMessage, response: ServerResponse): void {
  if (!existsSync(dist)) {
    response.writeHead(503, {
      ...securityHeaders(),
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    })
    response.end('UnterUns is not built yet. Run "npm run build" first.\n')
    return
  }

  let requestPath: string
  try {
    requestPath = decodeURIComponent((request.url ?? '/').split('?')[0]!)
  } catch {
    response.writeHead(400, { ...securityHeaders(), 'Cache-Control': 'no-cache' })
    response.end()
    return
  }
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
  let filePath = resolve(dist, relativePath)
  if (!filePath.startsWith(`${dist}${sep}`) && filePath !== dist) {
    response.writeHead(403, { ...securityHeaders(), 'Cache-Control': 'no-cache' })
    response.end()
    return
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = resolve(dist, 'index.html')
  }

  response.writeHead(200, {
    ...securityHeaders(),
    'Content-Type': contentType(filePath),
    'Cache-Control': cacheControl(filePath),
  })
  const stream = createReadStream(filePath)
  stream.on('error', (error) => {
    console.error(error)
    response.destroy()
  })
  stream.pipe(response)
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
  const announcement = startupAnnouncement(publicUrl, lanAddresses(), port)
  if (announcement.kind === 'no-lan') {
    console.log('No LAN address found. Check the host network connection.')
    return
  }
  for (const line of announcement.lines) console.log(line)
  console.log('\nScan to open UnterUns:')
  try {
    console.log(
      await QRCode.toString(announcement.qrUrl, {
        type: 'terminal',
        small: true,
        errorCorrectionLevel: 'M',
      }),
    )
  } catch {
    console.log('Could not render the QR code. Open the LAN address above.')
  }
})

server.on('error', (error) => {
  console.error(error)
})
server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
})

process.on('uncaughtException', (error) => {
  console.error(error)
})
process.on('unhandledRejection', (error) => {
  console.error(error)
})

let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Shutting down (${signal})`)
  clearInterval(heartbeat)
  for (const timer of meetingTimers.values()) clearTimeout(timer)
  for (const timer of deathTimers.values()) clearTimeout(timer)
  for (const timer of sabotageTimers.values()) clearTimeout(timer)
  for (const socket of connections.keys()) socket.close(1001, 'Server shutting down')
  sockets.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1_500).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

function requireSeat(state: ConnectionState): string {
  if (!state.sessionToken) throw new Error('Your session is no longer active')
  const session = engine.sessionFor(state.sessionToken)
  if (!session) throw new Error('Your session is no longer active')
  state.playerId = session.playerId
  return session.playerId
}

function addressFrom(request: IncomingMessage): string {
  return clientAddress(request.socket.remoteAddress, request.headers['x-forwarded-for'], trustProxy)
}

function connectionsFor(ip: string): number {
  let count = 0
  for (const state of connections.values()) {
    if (state.ip === ip) count += 1
  }
  return count
}

function messageText(raw: WebSocket.RawData): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8')
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  return Buffer.from(new Uint8Array(raw)).toString('utf8')
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)
}
