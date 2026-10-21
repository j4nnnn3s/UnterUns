import assert from 'node:assert/strict'
import test from 'node:test'
import { GameEngine } from './engine.js'
import {
  HOST_PASSWORD_REJECTED,
  HOST_PASSWORD_REQUIRED,
  INVALID_MESSAGE,
  MESSAGE_TOO_LARGE,
  NAME_TOO_LONG,
  ROOM_FULL,
  TOO_MANY_ROOMS,
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
} from './limits.js'

const shape = { maxPayloadBytes: 65_536, maxNameLength: 16 }

test('limit defaults stay loose enough for a house game', () => {
  assert.deepEqual(readLimits({}), {
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
  })
  assert.equal(readLimits({ HOST_PASSWORD: '   ' }).hostPassword, null)
  assert.equal(readLimits({ HOST_PASSWORD: 'secret' }).hostPassword, 'secret')
  assert.equal(readLimits({ MAX_PLAYERS: '12' }).maxPlayers, 12)
  assert.throws(() => readLimits({ MAX_ROOMS: '0' }), /MAX_ROOMS/)
})

test('rate limits are per key and expire with the window', () => {
  const limiter = new SlidingWindowLimiter(2, 1_000)
  assert.equal(limiter.allow('a', 0), true)
  assert.equal(limiter.allow('a', 10), true)
  assert.equal(limiter.allow('a', 20), false)
  assert.equal(limiter.allow('b', 20), true)
  assert.equal(limiter.allow('a', 1_010), true)
})

test('client address ignores X-Forwarded-For unless the proxy is trusted', () => {
  assert.equal(clientAddress('::ffff:192.168.1.23', '1.2.3.4', false), '192.168.1.23')
  assert.equal(clientAddress('127.0.0.1', '203.0.113.5, 10.0.0.1', true), '203.0.113.5')
  assert.equal(clientAddress('127.0.0.1', ['198.51.100.8'], true), '198.51.100.8')
  assert.equal(clientAddress('127.0.0.1', 'not-an-ip', true), '127.0.0.1')
  assert.equal(clientAddress(undefined, undefined, false), 'unknown')
})

test('websocket origin matches PUBLIC_URL, otherwise same-origin or LAN', () => {
  assert.equal(
    isUpgradeAllowed({
      origin: 'https://example.com',
      hostHeader: '127.0.0.1:4173',
      publicUrl: 'https://example.com',
    }),
    true,
  )
  assert.equal(
    isUpgradeAllowed({
      origin: 'https://evil.test',
      hostHeader: 'example.com',
      publicUrl: 'https://example.com',
    }),
    false,
  )
  assert.equal(
    isUpgradeAllowed({
      origin: 'http://192.168.1.23:4173',
      hostHeader: '127.0.0.1:4173',
      publicUrl: 'https://example.com',
    }),
    false,
  )
  assert.equal(
    isUpgradeAllowed({
      origin: 'http://192.168.1.23:5173',
      hostHeader: '127.0.0.1:4173',
      publicUrl: null,
    }),
    true,
  )
  assert.equal(
    isUpgradeAllowed({
      origin: 'http://203.0.113.9:4173',
      hostHeader: '203.0.113.9:4173',
      publicUrl: null,
    }),
    true,
  )
  assert.equal(
    isUpgradeAllowed({
      origin: 'https://evil.test',
      hostHeader: '192.168.1.23:4173',
      publicUrl: null,
    }),
    false,
  )
  assert.equal(
    isUpgradeAllowed({ origin: '', hostHeader: '192.168.1.23:4173', publicUrl: null }),
    false,
  )
})

test('host password is optional until configured', () => {
  assert.doesNotThrow(() => assertHostPassword(null, undefined))
  assert.throws(() => assertHostPassword('secret', undefined), new RegExp(HOST_PASSWORD_REQUIRED))
  assert.throws(() => assertHostPassword('secret', 'nope'), new RegExp(HOST_PASSWORD_REJECTED))
  assert.doesNotThrow(() => assertHostPassword('secret', 'secret'))
})

test('incoming messages and names are bounded', () => {
  const ok = parseClientMessage(
    JSON.stringify({ type: 'identify', requestId: 'req-1', playerId: 'player-1' }),
    shape,
  )
  assert.equal(ok.type, 'identify')
  assert.throws(
    () => parseClientMessage(`{"type":"identify","name":"${'a'.repeat(17)}"}`, shape),
    new RegExp(NAME_TOO_LONG),
  )
  assert.throws(() => parseClientMessage('{"type":"create_game"', shape), new RegExp(INVALID_MESSAGE))
  assert.throws(() => parseClientMessage('[]', shape), new RegExp(INVALID_MESSAGE))
  assert.throws(
    () => parseClientMessage(JSON.stringify({ type: 'create_game', playerId: 'x' }), shape),
    /Invalid player identity/,
  )
  assert.throws(
    () =>
      parseClientMessage(
        JSON.stringify({ type: 'update_settings', patch: { tasks: [{ text: 'x'.repeat(2_001) }] } }),
        shape,
      ),
    new RegExp(INVALID_MESSAGE),
  )
  assert.throws(
    () => parseClientMessage('{"type":"ping"}', { maxPayloadBytes: 8, maxNameLength: 16 }),
    new RegExp(MESSAGE_TOO_LARGE),
  )
})

test('a missed pong terminates the connection and responses carry security headers', () => {
  assert.equal(heartbeatAction(true), 'ping')
  assert.equal(heartbeatAction(false), 'terminate')
  const headers = securityHeaders()
  assert.equal(headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(headers['Referrer-Policy'], 'no-referrer')
  assert.match(headers['Content-Security-Policy'] ?? '', /connect-src 'self'/)
  assert.equal(cacheControl('/var/app/dist/index.html'), 'no-cache')
  assert.equal(cacheControl('/var/app/dist/favicon.svg'), 'no-cache')
  assert.equal(
    cacheControl('/var/app/dist/assets/index-BR2AVehZ.js'),
    'public, max-age=31536000, immutable',
  )
})

test('room and player caps reject the next arrival and still allow a rejoin', () => {
  const engine = new GameEngine({ maxRooms: 1, maxPlayers: 2, maxNameLength: 16 })
  const code = engine.createGame('host-id-123', 'Host').game.code
  assert.throws(() => engine.createGame('host-id-456', 'Other'), new RegExp(TOO_MANY_ROOMS))
  engine.joinGame('player-id-456', code, 'Player')
  assert.throws(() => engine.joinGame('player-id-789', code, 'Third'), new RegExp(ROOM_FULL))
  assert.equal(engine.joinGame('player-id-456', code, 'Player').players.length, 2)
  assert.equal(isUnknownRoom(new Error('No game found for that code')), true)
  assert.equal(isUnknownRoom(new Error('That room is full')), false)
})
