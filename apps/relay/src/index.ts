import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket, { WebSocketServer } from 'ws'
import { createRemoteAuthCookies, readBrowserCredentials } from './auth'

type RelayHostMessage =
  | {
      type: 'host.register'
      hostId: string
      hostToken: string
      accessToken: string
    }
  | {
      type: 'rpc.response'
      requestId: string
      result?: unknown
      error?: { message: string }
    }
  | {
      type: 'event'
      channel: string
      payload: unknown
    }

type RelayServerMessage =
  | {
      type: 'host.registered'
    }
  | {
      requestId: string
      type: 'rpc.request'
      channel: string
      args?: unknown[]
    }

interface PendingRpcRequest {
  reject: (error: Error) => void
  resolve: (value: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

interface HostConnection {
  accessToken: string
  pending: Map<string, PendingRpcRequest>
  socket: WebSocket
  subscribers: Set<ServerResponse>
}

const DEFAULT_PORT = 3220
const RPC_TIMEOUT_MS = 30_000
const MAX_REQUEST_BODY_BYTES = 1024 * 1024
const hostConnections = new Map<string, HostConnection>()
const webDistPath = resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)))

const server = createServer(async (request, response) => {
  writeCorsHeaders(request, response)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (request.method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, { hosts: hostConnections.size, ok: true })
    return
  }

  if (request.method === 'GET' && url.pathname === '/remote/login') {
    const credentials = readBrowserCredentials(request.headers, url)

    if (!credentials || !isValidBrowserCredentials(credentials.hostId, credentials.token)) {
      writeJson(response, 401, { error: { message: 'Unauthorized remote OXOX client.' } })
      return
    }

    response.writeHead(302, {
      location: '/',
      'set-cookie': createRemoteAuthCookies(credentials),
    })
    response.end()
    return
  }

  if (request.method === 'GET' && url.pathname === '/events') {
    const host = authenticateBrowserRequest(request, url)

    if (!host) {
      writeJson(response, 401, { error: { message: 'Unauthorized remote OXOX client.' } })
      return
    }

    response.writeHead(200, {
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'content-type': 'text/event-stream',
    })
    response.write(`event: oxox:connected\ndata: ${JSON.stringify({ id: randomUUID() })}\n\n`)
    host.subscribers.add(response)
    response.on('close', () => host.subscribers.delete(response))
    return
  }

  if (request.method === 'POST' && url.pathname.startsWith('/rpc/')) {
    const host = authenticateBrowserRequest(request, url)

    if (!host) {
      writeJson(response, 401, { error: { message: 'Unauthorized remote OXOX client.' } })
      return
    }

    try {
      const body = await readJsonBody(request)
      const channel = decodeURIComponent(url.pathname.slice('/rpc/'.length))
      const result = await forwardRpcRequest(host, channel, body.args ?? [])
      writeJson(response, 200, { result })
    } catch (error) {
      writeJson(response, 500, {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      })
    }
    return
  }

  if (await tryWriteStaticFile(request, response, url.pathname)) {
    return
  }

  writeJson(response, 404, { error: { message: 'Not found.' } })
})

const webSocketServer = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (url.pathname !== '/host') {
    socket.destroy()
    return
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit('connection', webSocket, request)
  })
})

webSocketServer.on('connection', (socket) => {
  let registeredHostId: string | null = null

  socket.on('message', (data) => {
    const message = parseHostMessage(String(data))

    if (!message) {
      return
    }

    if (message.type === 'host.register') {
      if (!isValidHostToken(message.hostToken)) {
        socket.close(1008, 'Invalid host token')
        return
      }

      registeredHostId = message.hostId
      registerHost(message.hostId, {
        accessToken: message.accessToken,
        pending: new Map(),
        socket,
        subscribers: new Set(),
      })
      send(socket, { type: 'host.registered' })
      return
    }

    if (message.type === 'rpc.response' && registeredHostId) {
      resolvePendingRpc(registeredHostId, message)
      return
    }

    if (message.type === 'event' && registeredHostId) {
      broadcastHostEvent(registeredHostId, message.channel, message.payload)
    }
  })

  socket.on('close', () => {
    if (registeredHostId) {
      removeHost(registeredHostId)
    }
  })
})

server.listen(resolvePort(), () => {
  console.log(`OXOX relay listening on http://127.0.0.1:${resolvePort()}`)
})

function resolvePort(): number {
  const value = Number.parseInt(process.env.OXOX_RELAY_PORT ?? `${DEFAULT_PORT}`, 10)

  return Number.isFinite(value) ? value : DEFAULT_PORT
}

function isValidHostToken(token: string): boolean {
  const expectedToken = process.env.OXOX_RELAY_HOST_TOKEN?.trim()

  return Boolean(expectedToken) && token === expectedToken
}

function registerHost(hostId: string, host: HostConnection): void {
  removeHost(hostId)
  hostConnections.set(hostId, host)
}

function removeHost(hostId: string): void {
  const existing = hostConnections.get(hostId)

  if (!existing) {
    return
  }

  for (const pending of existing.pending.values()) {
    clearTimeout(pending.timer)
    pending.reject(new Error('Remote OXOX host disconnected.'))
  }

  for (const subscriber of existing.subscribers) {
    subscriber.end()
  }

  hostConnections.delete(hostId)
}

function authenticateBrowserRequest(request: IncomingMessage, url: URL): HostConnection | null {
  const credentials = readBrowserCredentials(request.headers, url)

  if (!credentials) {
    return null
  }

  if (!isValidBrowserCredentials(credentials.hostId, credentials.token)) {
    return null
  }

  return hostConnections.get(credentials.hostId) ?? null
}

function isValidBrowserCredentials(hostId: string, token: string): boolean {
  const host = hostConnections.get(hostId)

  return host?.accessToken === token
}

async function forwardRpcRequest(
  host: HostConnection,
  channel: string,
  args: unknown[],
): Promise<unknown> {
  if (host.socket.readyState !== WebSocket.OPEN) {
    throw new Error('Remote OXOX host is not connected.')
  }

  const requestId = randomUUID()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      host.pending.delete(requestId)
      reject(new Error('Remote OXOX request timed out.'))
    }, RPC_TIMEOUT_MS)

    host.pending.set(requestId, { reject, resolve, timer })
    send(host.socket, {
      args,
      channel,
      requestId,
      type: 'rpc.request',
    })
  })
}

function resolvePendingRpc(
  hostId: string,
  message: Extract<RelayHostMessage, { type: 'rpc.response' }>,
): void {
  const host = hostConnections.get(hostId)
  const pending = host?.pending.get(message.requestId)

  if (!host || !pending) {
    return
  }

  clearTimeout(pending.timer)
  host.pending.delete(message.requestId)

  if (message.error) {
    pending.reject(new Error(message.error.message))
    return
  }

  pending.resolve(message.result)
}

function broadcastHostEvent(hostId: string, channel: string, payload: unknown): void {
  const host = hostConnections.get(hostId)

  if (!host) {
    return
  }

  const message = `event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n`

  for (const subscriber of host.subscribers) {
    subscriber.write(message)
  }
}

function send(socket: WebSocket, message: RelayServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

function parseHostMessage(rawMessage: string): RelayHostMessage | null {
  try {
    const parsed = JSON.parse(rawMessage) as RelayHostMessage

    return typeof parsed.type === 'string' ? parsed : null
  } catch {
    return null
  }
}

function writeCorsHeaders(request: IncomingMessage, response: ServerResponse): void {
  const origin = process.env.OXOX_RELAY_WEB_ORIGIN ?? request.headers.origin

  if (origin) {
    response.setHeader('access-control-allow-origin', origin)
    response.setHeader('access-control-allow-credentials', 'true')
    response.setHeader('vary', 'origin')
  }

  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.setHeader(
    'access-control-allow-headers',
    'content-type,x-oxox-remote-host,x-oxox-remote-token',
  )
}

async function readJsonBody(request: IncomingMessage): Promise<{ args?: unknown[] }> {
  const chunks: Buffer[] = []
  let bytesRead = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytesRead += buffer.byteLength

    if (bytesRead > MAX_REQUEST_BODY_BYTES) {
      throw new Error('Request body is too large.')
    }

    chunks.push(buffer)
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as { args?: unknown[] }
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

async function tryWriteStaticFile(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (request.method !== 'GET') {
    return false
  }

  const filePath = await resolveStaticFilePath(pathname)

  if (!filePath) {
    return false
  }

  response.writeHead(200, {
    'content-type': getContentType(filePath),
  })
  createReadStream(filePath).pipe(response)
  return true
}

async function resolveStaticFilePath(pathname: string): Promise<string | null> {
  const normalizedPathname = decodeURIComponent(pathname)
  const relativePath = normalizedPathname === '/' ? 'index.html' : normalizedPathname.slice(1)
  const candidatePath = resolve(webDistPath, relativePath)

  if (!isInsideDirectory(candidatePath, webDistPath)) {
    return null
  }

  try {
    const candidateStats = await stat(candidatePath)

    if (candidateStats.isDirectory()) {
      const indexPath = join(candidatePath, 'index.html')
      await stat(indexPath)
      return indexPath
    }

    if (candidateStats.isFile()) {
      return candidatePath
    }
  } catch {
    if (extname(normalizedPathname)) {
      return null
    }

    const indexPath = join(webDistPath, 'index.html')

    try {
      await stat(indexPath)
      return indexPath
    } catch {
      return null
    }
  }

  return null
}

function isInsideDirectory(candidatePath: string, parentPath: string): boolean {
  const relativePath = relative(parentPath, candidatePath)

  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('/'))
}

function getContentType(filePath: string): string {
  switch (extname(filePath)) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}
