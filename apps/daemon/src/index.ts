import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppUpdateState, RuntimeInfo } from '../../desktop/src/shared/ipc/contracts'
import { IPC_CHANNELS } from '../../desktop/src/shared/ipc/contracts'
import { type RemoteRelayClient, startRemoteRelayClient } from './remote/relayClient'

type IpcHandler = (...args: unknown[]) => unknown
type FoundationServiceLike = {
  getSessionSnapshot: (sessionId: string) => unknown
  subscribeToFoundationUpdates: (listener: (payload: { refreshedAt: string }) => void) => () => void
  subscribeToLiveSessionEvents: (
    listener: (payload: { sessionId: string; event: unknown }) => void,
  ) => () => void
  subscribeToLiveSessionSnapshots: (listener: (sessionId: string) => void) => () => void
}
type PluginHostLike = {
  subscribe: (listener: (snapshot: unknown) => void) => () => void
}
type AppKernelLike = {
  start: () => FoundationServiceLike
  loadPlugins: () => Promise<unknown>
  getPluginRegistry: () => unknown
  getPluginHost: () => PluginHostLike
  invokePluginCapability: (capabilityId: string, payload?: unknown) => Promise<unknown>
  stopAsync: () => Promise<void>
}
type AppKernelConstructor = new (options: {
  userDataPath: string
  createFoundationService: unknown
  loadLocalPlugins: (options: { pluginRegistry: unknown }) => Promise<unknown>
  registerSecurityHeaders: () => void
  registerIpcHandlers: (service: FoundationServiceLike) => (() => void) | undefined
  installSystemIntegration: () => undefined
}) => AppKernelLike
type RuntimeCoordinator = (options: {
  foundationService: FoundationServiceLike
  pluginHost: PluginHostLike
  broadcastFoundationChanged: (payload: { refreshedAt: string }) => void
  broadcastLiveSessionSnapshot: (payload: { sessionId: string }) => void
  broadcastLiveSessionEvent: (payload: { sessionId: string; event: unknown }) => void
  broadcastPluginHostSnapshot: (payload: { snapshot: unknown }) => void
  startPluginBootstrap: () => void
}) => () => void
type RegisterIpcHandlers = (options: Record<string, unknown>) => (() => void) | undefined
type AppPreferencesStoreLike = {
  getPreferences: () => { isOxoxIntegrationEnabled: boolean }
  updatePreferences: (update: unknown) => Promise<{ isOxoxIntegrationEnabled: boolean }>
}
type LoadLocalPluginsFromRoot = (options: {
  pluginRegistry: unknown
  pluginsRoot: string
}) => Promise<unknown>
type DatabaseRunResult = {
  changes: number
  lastInsertRowid: number | bigint
}
type DatabaseStatementLike = {
  all: (...params: unknown[]) => unknown[]
  get: (...params: unknown[]) => unknown
  run: (...params: unknown[]) => DatabaseRunResult
}
type DatabaseConnectionLike = {
  close: () => void
  exec: (sql: string) => void
  pragma: (sql: string, options?: { simple?: boolean }) => unknown
  prepare: (sql: string) => DatabaseStatementLike
  transaction: <T extends (...args: unknown[]) => unknown>(callback: T) => T
  readonly open: boolean
}

const DEFAULT_PORT = 3210
const DAEMON_VIEWER_ID = 1
const MAX_REQUEST_BODY_BYTES = 1024 * 1024
const require = createRequire(import.meta.url)

process.env.OXOX_BETTER_SQLITE3_PACKAGE ??= 'better-sqlite3-node'

process.on('unhandledRejection', (reason) => {
  console.warn('OXOX daemon background task failed', reason)
})

class RpcHandlerRegistry {
  readonly handlers = new Map<string, IpcHandler>()

  handle(channel: string, handler: IpcHandler): void {
    this.handlers.set(channel, handler)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }
}

class ServerEventHub {
  private readonly clients = new Set<ServerResponse>()

  addClient(response: ServerResponse): void {
    this.clients.add(response)
    response.on('close', () => {
      this.clients.delete(response)
    })
  }

  broadcast(channel: string, payload: unknown): void {
    const message = `event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n`

    for (const client of this.clients) {
      client.write(message)
    }
  }
}

function resolveUserDataPath(): string {
  if (process.env.OXOX_USER_DATA_PATH) {
    return process.env.OXOX_USER_DATA_PATH
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'oxox')
  }

  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'oxox')
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'oxox')
}

function resolveHost(): string {
  return process.env.OXOX_DAEMON_HOST ?? '127.0.0.1'
}

function resolvePort(): number {
  const value = Number.parseInt(process.env.OXOX_DAEMON_PORT ?? `${DEFAULT_PORT}`, 10)

  return Number.isFinite(value) ? value : DEFAULT_PORT
}

function resolveRemoteRelayConfig(): {
  accessToken: string
  hostId: string
  hostToken: string
  relayUrl: string
} | null {
  const relayUrl = process.env.OXOX_REMOTE_RELAY_URL?.trim()
  const hostId = process.env.OXOX_REMOTE_HOST_ID?.trim()
  const hostToken = process.env.OXOX_REMOTE_HOST_TOKEN?.trim()
  const accessToken = process.env.OXOX_REMOTE_ACCESS_TOKEN?.trim()

  if (!relayUrl && !hostId && !hostToken && !accessToken) {
    return null
  }

  if (!relayUrl || !hostId || !hostToken || !accessToken) {
    console.warn(
      'OXOX remote relay disabled. Set OXOX_REMOTE_RELAY_URL, OXOX_REMOTE_HOST_ID, OXOX_REMOTE_HOST_TOKEN, and OXOX_REMOTE_ACCESS_TOKEN.',
    )
    return null
  }

  return { accessToken, hostId, hostToken, relayUrl }
}

function createUnsupportedUpdateState(): AppUpdateState {
  return {
    phase: 'unsupported',
    currentVersion: '0.0.15',
    availableVersion: null,
    downloadedVersion: null,
    progressPercent: null,
    message: 'Updates are managed by the OXOX daemon host.',
    canInstall: false,
  }
}

function getDaemonRuntimeInfo(): RuntimeInfo {
  return {
    appVersion: '0.0.15',
    chromeVersion: '',
    electronVersion: '',
    nodeVersion: process.versions.node,
    platform:
      process.platform === 'darwin' || process.platform === 'linux' || process.platform === 'win32'
        ? process.platform
        : 'linux',
    isDarkModeForced: true,
    hasRequire: false,
    hasProcess: false,
  }
}

function createNodeDatabaseConnection(databasePath: string): DatabaseConnectionLike {
  const BetterSqlite3 = require('better-sqlite3-node')
  const database = new BetterSqlite3(databasePath)

  return {
    close: () => {
      database.close()
    },
    exec: (sql) => {
      database.exec(sql)
    },
    get open() {
      return Boolean(database.open)
    },
    pragma: (sql, options) => database.pragma(sql, options),
    prepare: (sql) => {
      const statement = database.prepare(sql)

      return {
        all: (...params) => statement.all(...params) as unknown[],
        get: (...params) => statement.get(...params) as unknown,
        run: (...params) => statement.run(...params) as DatabaseRunResult,
      }
    },
    transaction: (callback) => database.transaction(callback) as typeof callback,
  }
}

function writeCorsHeaders(response: ServerResponse): void {
  response.setHeader('access-control-allow-origin', process.env.OXOX_WEB_ORIGIN ?? '*')
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type')
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
    case '.otf':
      return 'font/otf'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.ttf':
      return 'font/ttf'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function isInsideDirectory(candidatePath: string, parentPath: string): boolean {
  const relativePath = relative(parentPath, candidatePath)

  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('/'))
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

const userDataPath = resolveUserDataPath()
const ipcMain = new RpcHandlerRegistry()
const eventHub = new ServerEventHub()
let remoteRelayClient: RemoteRelayClient | null = null
const webDistPath = resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)))
const desktopSourceRoot = new URL('../../desktop/src/', import.meta.url)
const desktopModules = await Promise.all([
  import(new URL('main/app/AppKernel.ts', desktopSourceRoot).href),
  import(new URL('main/app/runtimeCoordinator.ts', desktopSourceRoot).href),
  import(new URL('main/integration/foundationService.ts', desktopSourceRoot).href),
  import(new URL('main/integration/plugins/localPluginCatalog.ts', desktopSourceRoot).href),
  import(new URL('main/ipc/router.ts', desktopSourceRoot).href),
  import(new URL('main/app/appPreferences.ts', desktopSourceRoot).href),
])
const AppKernel = desktopModules[0].AppKernel as AppKernelConstructor
const startRuntimeCoordinator = desktopModules[1].startRuntimeCoordinator as RuntimeCoordinator
const createFoundationService = desktopModules[2].createFoundationService as (
  options: Record<string, unknown>,
) => FoundationServiceLike
const loadLocalPluginsFromRoot = desktopModules[3]
  .loadLocalPluginsFromRoot as LoadLocalPluginsFromRoot
const registerAppIpcHandlers = desktopModules[4].registerAppIpcHandlers as RegisterIpcHandlers
const createAppPreferencesStore = desktopModules[5].createAppPreferencesStore as (options: {
  userDataPath: string
}) => AppPreferencesStoreLike
const appPreferences = createAppPreferencesStore({ userDataPath })
let appKernel: AppKernelLike

appKernel = new AppKernel({
  userDataPath,
  createFoundationService: (options: Record<string, unknown>) =>
    createFoundationService({
      ...options,
      databaseFactory: createNodeDatabaseConnection,
      isOxoxIntegrationEnabled: () => appPreferences.getPreferences().isOxoxIntegrationEnabled,
    }),
  loadLocalPlugins: ({ pluginRegistry }) =>
    loadLocalPluginsFromRoot({
      pluginRegistry,
      pluginsRoot: join(userDataPath, 'plugins'),
    }),
  registerSecurityHeaders: () => undefined,
  registerIpcHandlers: (service) =>
    registerAppIpcHandlers({
      ipcMain,
      service,
      updater: {
        getState: createUnsupportedUpdateState,
        checkForUpdates: async () => createUnsupportedUpdateState(),
        installUpdate: () => undefined,
      },
      appPreferences,
      pluginRegistry: appKernel.getPluginRegistry(),
      pluginHost: appKernel.getPluginHost(),
      invokePluginCapability: (capabilityId: string, payload?: unknown) =>
        appKernel.invokePluginCapability(capabilityId, payload),
      getRuntimeInfo: getDaemonRuntimeInfo,
      createAppWindow: async () => undefined,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      platform: 'linux',
      resolveOwnerWindow: () => undefined,
    }),
  installSystemIntegration: () => undefined,
})

const foundationService = appKernel.start()
void appKernel.loadPlugins()
const remoteRelayConfig = resolveRemoteRelayConfig()

if (remoteRelayConfig) {
  remoteRelayClient = startRemoteRelayClient({
    ...remoteRelayConfig,
    invokeRpc: invokeIpcHandler,
  })
  console.log(`OXOX remote relay enabled for host "${remoteRelayConfig.hostId}"`)
}

function broadcastDaemonEvent(channel: string, payload: unknown): void {
  eventHub.broadcast(channel, payload)
  remoteRelayClient?.publishEvent(channel, payload)
}

async function invokeIpcHandler(channel: string, args: unknown[] = []): Promise<unknown> {
  const handler = ipcMain.handlers.get(channel)

  if (!handler) {
    throw new Error(`Unknown OXOX RPC channel "${channel}".`)
  }

  return handler(
    {
      sender: {
        id: DAEMON_VIEWER_ID,
        once: () => undefined,
      },
    },
    ...args,
  )
}

const stopRuntimeCoordinator = startRuntimeCoordinator({
  foundationService,
  pluginHost: appKernel.getPluginHost(),
  broadcastFoundationChanged: (payload) => {
    broadcastDaemonEvent(IPC_CHANNELS.foundationChanged, payload)
  },
  broadcastLiveSessionSnapshot: ({ sessionId }) => {
    const snapshot = foundationService.getSessionSnapshot(sessionId)

    if (snapshot) {
      broadcastDaemonEvent(IPC_CHANNELS.sessionSnapshotChanged, { snapshot })
    }
  },
  broadcastLiveSessionEvent: ({ sessionId, event }) => {
    broadcastDaemonEvent(IPC_CHANNELS.sessionEventBatch, {
      sessionId,
      sequenceStart: Date.now(),
      sequenceEnd: Date.now(),
      events: [event],
    })
  },
  broadcastPluginHostSnapshot: (payload) => {
    broadcastDaemonEvent(IPC_CHANNELS.pluginHostChanged, payload)
  },
  startPluginBootstrap: () => undefined,
})

const server = createServer(async (request, response) => {
  writeCorsHeaders(response)

  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (request.method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, { ok: true })
    return
  }

  if (request.method === 'GET' && url.pathname === '/events') {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    response.write(`event: oxox:connected\ndata: ${JSON.stringify({ id: randomUUID() })}\n\n`)
    eventHub.addClient(response)
    return
  }

  if (request.method === 'POST' && url.pathname.startsWith('/rpc/')) {
    const channel = decodeURIComponent(url.pathname.slice('/rpc/'.length))

    if (!ipcMain.handlers.has(channel)) {
      writeJson(response, 404, { error: { message: `Unknown OXOX RPC channel "${channel}".` } })
      return
    }

    try {
      const body = await readJsonBody(request)
      const result = await invokeIpcHandler(channel, body.args ?? [])
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

server.listen(resolvePort(), resolveHost(), () => {
  const address = server.address()
  const resolvedAddress =
    typeof address === 'object' && address
      ? `http://${address.address}:${address.port}`
      : `http://${resolveHost()}:${resolvePort()}`

  console.log(`OXOX daemon listening on ${resolvedAddress}`)
  console.log(`Using OXOX user data at ${userDataPath}`)
})

const stop = async (): Promise<void> => {
  remoteRelayClient?.stop()
  stopRuntimeCoordinator()
  server.close()
  await appKernel.stopAsync()
}

process.on('SIGINT', () => {
  void stop().finally(() => process.exit(0))
})

process.on('SIGTERM', () => {
  void stop().finally(() => process.exit(0))
})
