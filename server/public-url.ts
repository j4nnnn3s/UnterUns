export interface ServerEnv {
  HOST?: string
  PORT?: string
  PUBLIC_URL?: string
  TRUST_PROXY?: string
}

export interface PageLocation {
  protocol: string
  host: string
  origin: string
  pathname: string
}

export interface StartupLinks {
  kind: 'links'
  lines: string[]
  qrUrl: string
}

export interface StartupNoLan {
  kind: 'no-lan'
}

const PUBLIC_URL_ERROR =
  'PUBLIC_URL must be an absolute http(s) origin without a path, query, or hash'

export function readHost(env: ServerEnv): string {
  return env.HOST ?? '0.0.0.0'
}

export function readPort(env: ServerEnv): number {
  return Number(env.PORT ?? 4173)
}

export function readPublicUrl(env: ServerEnv): string | null {
  const raw = env.PUBLIC_URL?.trim()
  if (!raw) return null
  const withoutSlash = raw.replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(withoutSlash)
  } catch {
    throw new Error(PUBLIC_URL_ERROR)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(PUBLIC_URL_ERROR)
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(PUBLIC_URL_ERROR)
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error(PUBLIC_URL_ERROR)
  }
  return url.origin
}

export function readTrustProxy(env: ServerEnv): boolean {
  const raw = env.TRUST_PROXY?.trim().toLowerCase()
  if (!raw || raw === '0' || raw === 'false' || raw === 'no') return false
  if (raw === '1' || raw === 'true' || raw === 'yes') return true
  throw new Error('TRUST_PROXY must be true or false')
}

export function startupAnnouncement(
  publicUrl: string | null,
  lanAddresses: readonly string[],
  port: number,
): StartupLinks | StartupNoLan {
  const urls = publicUrl
    ? [publicUrl]
    : lanAddresses.map((address) => `http://${address}:${port}`)
  const first = urls[0]
  if (!first) return { kind: 'no-lan' }
  return {
    kind: 'links',
    lines: publicUrl ? urls : urls.map((url) => `LAN: ${url}`),
    qrUrl: first,
  }
}

export function shareBaseFromForwarded(
  options: { publicUrl: string | null; trustProxy: boolean },
  forwarded: { proto?: string | string[]; host?: string | string[] },
): string | null {
  if (options.publicUrl) return options.publicUrl
  if (!options.trustProxy) return null
  const proto = firstToken(forwarded.proto)?.toLowerCase()
  const host = firstToken(forwarded.host)
  if (proto !== 'http' && proto !== 'https') return null
  if (!host || !isForwardedHost(host)) return null
  return `${proto}://${host}`
}

export function browserWebSocketUrl(location: Pick<PageLocation, 'protocol' | 'host'>): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ws`
}

export function joinPageUrl(input: {
  shareBase: string | null
  origin: string
  pathname: string
  code: string
}): string {
  const base = input.shareBase ?? input.origin
  return `${base}${input.pathname}?code=${input.code}`
}

function firstToken(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  const token = raw.split(',')[0]?.trim() ?? ''
  return token || null
}

function isForwardedHost(host: string): boolean {
  if (host.length === 0 || host.length > 255) return false
  if (host.startsWith('[')) {
    return /^\[[0-9a-fA-F:.]+\](?::\d{1,5})?$/.test(host)
  }
  return /^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)
}
