import type { IncomingHttpHeaders } from 'node:http'

export interface BrowserCredentials {
  hostId: string
  token: string
}

export function readBrowserCredentials(
  headers: IncomingHttpHeaders,
  url: URL,
): BrowserCredentials | null {
  const cookies = parseCookies(firstHeaderValue(headers.cookie))
  const hostId =
    firstHeaderValue(headers['x-oxox-remote-host']) ??
    url.searchParams.get('hostId') ??
    cookies.get('oxox_remote_host')
  const token =
    firstHeaderValue(headers['x-oxox-remote-token']) ??
    url.searchParams.get('token') ??
    cookies.get('oxox_remote_token')

  if (!hostId || !token) {
    return null
  }

  return { hostId, token }
}

export function createRemoteAuthCookies(credentials: BrowserCredentials): string[] {
  const attributes = [
    'HttpOnly',
    'Max-Age=2592000',
    'Path=/',
    'SameSite=Lax',
    process.env.OXOX_RELAY_COOKIE_SECURE === '0' ? '' : 'Secure',
  ].filter(Boolean)

  return [
    `oxox_remote_host=${encodeURIComponent(credentials.hostId)}; ${attributes.join('; ')}`,
    `oxox_remote_token=${encodeURIComponent(credentials.token)}; ${attributes.join('; ')}`,
  ]
}

function parseCookies(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>()

  if (!cookieHeader) {
    return cookies
  }

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = cookie.trim().split('=')
    const rawValue = rawValueParts.join('=')

    if (!rawName || !rawValue) {
      continue
    }

    cookies.set(rawName, decodeURIComponent(rawValue))
  }

  return cookies
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}
