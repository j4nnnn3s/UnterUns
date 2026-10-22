import { createHash, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

export interface ServerLimits {
  maxPayloadBytes: number
  heartbeatMs: number
  maxRooms: number
  maxPlayers: number
  maxConnectionsPerIp: number
  maxNameLength: number
  roomCreateLimit: number
  roomCreateWindowMs: number
  joinLimit: number
  joinWindowMs: number
  guessLimit: number
  guessWindowMs: number
  hostPassword: string | null
}

export interface ParsedClientMessage {
  type: string
  requestId?: string
  playerId?: string
  code?: string
  name?: string
  taskId?: string
  killerId?: string
  sabotageId?: string
  deactivationCode?: string
  deviceCode?: string
  hostPassword?: string
  sessionToken?: string
  kind?: string
  reportedPlayerId?: string
  targetId?: string
  patch?: Record<string, unknown>
}

export const HOST_PASSWORD_REQUIRED = 'A host password is required'
export const HOST_PASSWORD_REJECTED = 'Incorrect host password'
export const TOO_MANY_ROOMS = 'The server is hosting too many games. Try again later.'
export const ROOM_FULL = 'That room is full'
export const NAME_TOO_LONG = 'Name is too long'
export const MESSAGE_TOO_LARGE = 'Message is too large'
export const INVALID_MESSAGE = 'Invalid message'
export const TOO_MANY_CREATES = 'Too many rooms created from this network. Wait a moment.'
export const TOO_MANY_JOINS = 'Too many join attempts. Wait a moment.'
export const TOO_MANY_GUESSES = 'Too many room code attempts. Wait a moment.'

const DEFAULT_LIMITS: ServerLimits = {
  maxPayloadBytes: 65_536,
  heartbeatMs: 30_000,
  maxRooms: 100,
  maxPlayers: 24,
  maxConnectionsPerIp: 48,
  maxNameLength: 16,
  roomCreateLimit: 30,
  roomCreateWindowMs: 60 * 60 * 1000,
  joinLimit: 120,
  joinWindowMs: 10 * 60 * 1000,
  guessLimit: 30,
  guessWindowMs: 10 * 60 * 1000,
  hostPassword: null,
}

const SHORT_FIELDS = [
  'code',
  'taskId',
  'killerId',
  'reportedPlayerId',
  'sabotageId',
  'deactivationCode',
  'deviceCode',
  'targetId',
  'hostPassword',
  'sessionToken',
] as const

export function readLimits(env: Record<string, string | undefined>): ServerLimits {
  const password = env.HOST_PASSWORD
  return {
    maxPayloadBytes: readPositiveInt('WS_MAX_PAYLOAD_BYTES', env.WS_MAX_PAYLOAD_BYTES, DEFAULT_LIMITS.maxPayloadBytes),
    heartbeatMs: readPositiveInt('WS_HEARTBEAT_MS', env.WS_HEARTBEAT_MS, DEFAULT_LIMITS.heartbeatMs),
    maxRooms: readPositiveInt('MAX_ROOMS', env.MAX_ROOMS, DEFAULT_LIMITS.maxRooms),
    maxPlayers: readPositiveInt('MAX_PLAYERS', env.MAX_PLAYERS, DEFAULT_LIMITS.maxPlayers),
    maxConnectionsPerIp: readPositiveInt(
      'MAX_CONNECTIONS_PER_IP',
      env.MAX_CONNECTIONS_PER_IP,
      DEFAULT_LIMITS.maxConnectionsPerIp,
    ),
    maxNameLength: readPositiveInt('MAX_NAME_LENGTH', env.MAX_NAME_LENGTH, DEFAULT_LIMITS.maxNameLength),
    roomCreateLimit: readPositiveInt('ROOM_CREATE_LIMIT', env.ROOM_CREATE_LIMIT, DEFAULT_LIMITS.roomCreateLimit),
    roomCreateWindowMs: readPositiveInt(
      'ROOM_CREATE_WINDOW_MS',
      env.ROOM_CREATE_WINDOW_MS,
      DEFAULT_LIMITS.roomCreateWindowMs,
    ),
    joinLimit: readPositiveInt('JOIN_LIMIT', env.JOIN_LIMIT, DEFAULT_LIMITS.joinLimit),
    joinWindowMs: readPositiveInt('JOIN_WINDOW_MS', env.JOIN_WINDOW_MS, DEFAULT_LIMITS.joinWindowMs),
    guessLimit: readPositiveInt('GUESS_LIMIT', env.GUESS_LIMIT, DEFAULT_LIMITS.guessLimit),
    guessWindowMs: readPositiveInt('GUESS_WINDOW_MS', env.GUESS_WINDOW_MS, DEFAULT_LIMITS.guessWindowMs),
    hostPassword: password && password.trim() ? password : null,
  }
}

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    this.prune(now)
    return true
  }

  private prune(now: number): void {
    if (this.hits.size <= 10_000) return
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key)
      if (this.hits.size <= 10_000) return
    }
  }
}

export function clientAddress(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const forwarded = firstToken(forwardedFor)
    const normalized = forwarded ? normalizeIp(forwarded) : null
    if (normalized && isIP(normalized)) return normalized
  }
  return normalizeIp(remoteAddress ?? 'unknown')
}

export function isUpgradeAllowed(input: {
  origin: string | undefined
  hostHeader: string | undefined
  publicUrl: string | null
}): boolean {
  const origin = input.origin?.trim()
  if (!origin || origin.toLowerCase() === 'null') return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (input.publicUrl) return url.origin === input.publicUrl
  if (isLanHostname(url.hostname)) return true
  if (!input.hostHeader) return false
  try {
    const hostUrl = new URL(`${url.protocol}//${input.hostHeader}`)
    return url.host === hostUrl.host
  } catch {
    return false
  }
}

export function isLanHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '::1') return true
  const v4 = host.startsWith('::ffff:') ? host.slice('::ffff:'.length) : host
  const parts = v4.split('.').map((part) => Number(part))
  if (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    const a = parts[0]!
    const b = parts[1]!
    if (a === 10 || a === 127) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 169 && b === 254) return true
    return false
  }
  if (!host.includes(':')) return false
  const first = host.split(':').find((part) => part.length > 0) ?? '0'
  const value = Number.parseInt(first, 16)
  if (!Number.isInteger(value)) return false
  return (value & 0xfe00) === 0xfc00 || (value & 0xffc0) === 0xfe80
}

export function heartbeatAction(seenPongSincePing: boolean): 'ping' | 'terminate' {
  return seenPongSincePing ? 'ping' : 'terminate'
}

export function assertHostPassword(configured: string | null, provided: unknown): void {
  if (!configured) return
  if (typeof provided !== 'string' || provided.length === 0 || provided.length > 200) {
    throw new Error(HOST_PASSWORD_REQUIRED)
  }
  const left = createHash('sha256').update(configured, 'utf8').digest()
  const right = createHash('sha256').update(provided, 'utf8').digest()
  if (!timingSafeEqual(left, right)) throw new Error(HOST_PASSWORD_REJECTED)
}

export function isUnknownRoom(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No game found')
}

export function parseClientMessage(
  raw: string,
  limits: Pick<ServerLimits, 'maxPayloadBytes' | 'maxNameLength'>,
): ParsedClientMessage {
  if (Buffer.byteLength(raw) > limits.maxPayloadBytes) throw new Error(MESSAGE_TOO_LARGE)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(INVALID_MESSAGE)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(INVALID_MESSAGE)
  }
  const message = parsed as Record<string, unknown>
  if (typeof message.type !== 'string' || !/^[a-z_]{1,32}$/.test(message.type)) {
    throw new Error(INVALID_MESSAGE)
  }
  assertOptionalId(message.requestId, 'requestId', 64)
  if (message.playerId !== undefined) {
    if (
      typeof message.playerId !== 'string' ||
      message.playerId.length < 8 ||
      message.playerId.length > 64 ||
      !/^[A-Za-z0-9-]+$/.test(message.playerId)
    ) {
      throw new Error('Invalid player identity')
    }
  }
  if (message.name !== undefined) {
    if (typeof message.name !== 'string') throw new Error(INVALID_MESSAGE)
    const trimmed = message.name.trim().replace(/\s+/g, ' ')
    if (trimmed.length > limits.maxNameLength) throw new Error(NAME_TOO_LONG)
  }
  for (const field of SHORT_FIELDS) {
    const value = message[field]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.length > 200) throw new Error(INVALID_MESSAGE)
  }
  if (message.kind !== undefined && message.kind !== 'emergency' && message.kind !== 'body') {
    throw new Error('Unknown meeting type')
  }
  if (message.patch !== undefined) {
    if (!message.patch || typeof message.patch !== 'object' || Array.isArray(message.patch)) {
      throw new Error(INVALID_MESSAGE)
    }
    assertBoundedValue(message.patch, 0)
  }
  return message as unknown as ParsedClientMessage
}

export function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "manifest-src 'self'",
    ].join('; '),
  }
}

export function cacheControl(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  if (normalized.endsWith('/index.html') || normalized.endsWith('index.html')) return 'no-cache'
  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(normalized)) {
    return 'public, max-age=31536000, immutable'
  }
  return 'no-cache'
}

function readPositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

function firstToken(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  const token = raw.split(',')[0]?.trim() ?? ''
  return token || null
}

function normalizeIp(ip: string): string {
  const trimmed = ip.trim()
  return trimmed.startsWith('::ffff:') ? trimmed.slice('::ffff:'.length) : trimmed
}

function assertOptionalId(value: unknown, label: string, max: number): void {
  if (value === undefined) return
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new Error(`Invalid ${label}`)
  }
}

function assertBoundedValue(value: unknown, depth: number): void {
  if (depth > 6) throw new Error(INVALID_MESSAGE)
  if (typeof value === 'string') {
    if (value.length > 2_000) throw new Error(INVALID_MESSAGE)
    return
  }
  if (Array.isArray(value)) {
    if (value.length > 40) throw new Error(INVALID_MESSAGE)
    for (const item of value) assertBoundedValue(item, depth + 1)
    return
  }
  if (!value || typeof value !== 'object') return
  const entries = Object.entries(value)
  if (entries.length > 40) throw new Error(INVALID_MESSAGE)
  for (const [key, item] of entries) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key.length > 64) {
      throw new Error(INVALID_MESSAGE)
    }
    assertBoundedValue(item, depth + 1)
  }
}
