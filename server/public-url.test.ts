import assert from 'node:assert/strict'
import test from 'node:test'
import {
  browserWebSocketUrl,
  joinPageUrl,
  readHost,
  readPort,
  readPublicUrl,
  readTrustProxy,
  shareBaseFromForwarded,
  startupAnnouncement,
} from './public-url.js'

test('defaults match local hosting when env vars are unset', () => {
  assert.equal(readHost({}), '0.0.0.0')
  assert.equal(readPort({}), 4173)
  assert.equal(readPublicUrl({}), null)
  assert.equal(readPublicUrl({ PUBLIC_URL: '   ' }), null)
  assert.equal(readTrustProxy({}), false)
  assert.equal(readTrustProxy({ TRUST_PROXY: '' }), false)
  assert.equal(readTrustProxy({ TRUST_PROXY: 'false' }), false)
})

test('reads explicit host, port, and trust proxy values', () => {
  assert.equal(readHost({ HOST: '127.0.0.1' }), '127.0.0.1')
  assert.equal(readPort({ PORT: '8080' }), 8080)
  assert.equal(readTrustProxy({ TRUST_PROXY: 'true' }), true)
  assert.equal(readTrustProxy({ TRUST_PROXY: '1' }), true)
  assert.equal(readTrustProxy({ TRUST_PROXY: 'YES' }), true)
  assert.equal(readTrustProxy({ TRUST_PROXY: '0' }), false)
  assert.throws(() => readTrustProxy({ TRUST_PROXY: 'maybe' }), /TRUST_PROXY/)
})

test('normalizes PUBLIC_URL and rejects paths', () => {
  assert.equal(readPublicUrl({ PUBLIC_URL: 'https://example.com' }), 'https://example.com')
  assert.equal(readPublicUrl({ PUBLIC_URL: 'https://example.com/' }), 'https://example.com')
  assert.equal(
    readPublicUrl({ PUBLIC_URL: 'https://play.example.com:8443' }),
    'https://play.example.com:8443',
  )
  assert.throws(() => readPublicUrl({ PUBLIC_URL: 'https://example.com/game' }), /PUBLIC_URL/)
  assert.throws(() => readPublicUrl({ PUBLIC_URL: 'example.com' }), /PUBLIC_URL/)
  assert.throws(() => readPublicUrl({ PUBLIC_URL: 'ftp://example.com' }), /PUBLIC_URL/)
})

test('startup links use LAN addresses unless PUBLIC_URL is set', () => {
  const lan = startupAnnouncement(null, ['192.168.1.23', '10.0.0.5'], 4173)
  assert.deepEqual(lan, {
    kind: 'links',
    lines: ['LAN: http://192.168.1.23:4173', 'LAN: http://10.0.0.5:4173'],
    qrUrl: 'http://192.168.1.23:4173',
  })

  assert.deepEqual(startupAnnouncement(null, [], 4173), { kind: 'no-lan' })

  const customPort = startupAnnouncement(null, ['192.168.1.23'], 8080)
  assert.equal(customPort.kind, 'links')
  if (customPort.kind === 'links') {
    assert.equal(customPort.qrUrl, 'http://192.168.1.23:8080')
    assert.deepEqual(customPort.lines, ['LAN: http://192.168.1.23:8080'])
  }

  const published = startupAnnouncement('https://example.com', ['192.168.1.23'], 4173)
  assert.deepEqual(published, {
    kind: 'links',
    lines: ['https://example.com'],
    qrUrl: 'https://example.com',
  })
  assert.deepEqual(startupAnnouncement('https://example.com', [], 4173), {
    kind: 'links',
    lines: ['https://example.com'],
    qrUrl: 'https://example.com',
  })
})

test('share base prefers PUBLIC_URL and otherwise trusts forwarded headers only when enabled', () => {
  const forwarded = { proto: 'https', host: 'example.com' }
  assert.equal(
    shareBaseFromForwarded({ publicUrl: null, trustProxy: false }, forwarded),
    null,
  )
  assert.equal(
    shareBaseFromForwarded({ publicUrl: null, trustProxy: true }, forwarded),
    'https://example.com',
  )
  assert.equal(
    shareBaseFromForwarded(
      { publicUrl: 'https://play.example.com', trustProxy: false },
      { proto: 'http', host: 'evil.test' },
    ),
    'https://play.example.com',
  )
  assert.equal(
    shareBaseFromForwarded(
      { publicUrl: null, trustProxy: true },
      { proto: 'https, http', host: 'example.com, internal' },
    ),
    'https://example.com',
  )
  assert.equal(
    shareBaseFromForwarded(
      { publicUrl: null, trustProxy: true },
      { proto: ['https'], host: ['play.example.com:8443'] },
    ),
    'https://play.example.com:8443',
  )
  assert.equal(
    shareBaseFromForwarded({ publicUrl: null, trustProxy: true }, { proto: 'https' }),
    null,
  )
  assert.equal(
    shareBaseFromForwarded(
      { publicUrl: null, trustProxy: true },
      { proto: 'https', host: 'example.com/game' },
    ),
    null,
  )
})

test('browser socket and join links follow the page unless a share base is set', () => {
  assert.equal(
    browserWebSocketUrl({ protocol: 'http:', host: '192.168.1.23:4173' }),
    'ws://192.168.1.23:4173/ws',
  )
  assert.equal(
    browserWebSocketUrl({ protocol: 'http:', host: '192.168.1.23:5173' }),
    'ws://192.168.1.23:5173/ws',
  )
  assert.equal(
    browserWebSocketUrl({ protocol: 'https:', host: 'example.com' }),
    'wss://example.com/ws',
  )
  assert.equal(
    browserWebSocketUrl({ protocol: 'https:', host: 'example.com:8443' }),
    'wss://example.com:8443/ws',
  )

  assert.equal(
    joinPageUrl({
      shareBase: null,
      origin: 'http://192.168.1.23:4173',
      pathname: '/',
      code: 'K7PX',
    }),
    'http://192.168.1.23:4173/?code=K7PX',
  )
  assert.equal(
    joinPageUrl({
      shareBase: 'https://example.com',
      origin: 'http://127.0.0.1:4173',
      pathname: '/',
      code: 'K7PX',
    }),
    'https://example.com/?code=K7PX',
  )
  assert.equal(
    joinPageUrl({
      shareBase: 'https://example.com',
      origin: 'https://example.com',
      pathname: '/room',
      code: 'K7PX',
    }),
    'https://example.com/room?code=K7PX',
  )
})
