import {
  type ConnectDaemonOptions,
  LEGACY_FACTORY_API_VERSION as FACTORY_API_VERSION,
  JSONRPC_VERSION as JSON_RPC_VERSION,
  MachineType,
  protocol,
  ensureLocalDaemon as sdkEnsureLocalDaemon,
  resolveWebSocketUrl as sdkResolveWebSocketUrl,
  WebSocketTransport,
} from '@factory/droid-sdk'
import WebSocket, { type RawData } from 'ws'

import type {
  DaemonConnectionSnapshot,
  DaemonConnectionStatus,
  DaemonConnectionTargetSnapshot,
  SessionRecord,
} from '../../../shared/ipc/contracts'
import {
  authenticateDaemonConnection,
  type DaemonAuthProvider,
  resolveDaemonCredentials,
} from './auth'
import { discoverReachableDaemonPort } from './portDiscovery'
import { resolveKnownDaemonPorts } from './ports'
import { areDaemonSessionsEqual, getDaemonSnapshotUpdate } from './snapshotDedup'

const DEFAULT_REFRESH_INTERVAL_MS = 10_000
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000
const DAEMON_METHOD = protocol.daemon.DaemonDroidMethod
const DAEMON_SETTINGS_METHOD = protocol.daemon.DaemonSettingsMethod
const KNOWN_DAEMON_METHODS = new Set<string>([
  ...Object.values(DAEMON_METHOD),
  ...Object.values(DAEMON_SETTINGS_METHOD),
])
const AVAILABLE_SESSION_PAGE_SIZE = 100

type DaemonGetSessionMessagesParams = ReturnType<
  (typeof protocol.daemon.DaemonGetSessionMessagesRequestParamsSchema)['parse']
>
type DaemonGetSessionMessagesResult = ReturnType<
  (typeof protocol.daemon.DaemonGetSessionMessagesResultSchema)['parse']
>
type DaemonSearchSessionsParams = ReturnType<
  (typeof protocol.daemon.DaemonSearchSessionsRequestParamsSchema)['parse']
>
type DaemonSearchSessionsResult = ReturnType<
  (typeof protocol.daemon.DaemonSearchSessionsResultSchema)['parse']
>
type DaemonArchiveSessionResult = ReturnType<
  (typeof protocol.daemon.DaemonArchiveSessionResultSchema)['parse']
>
type DaemonUnarchiveSessionResult = ReturnType<
  (typeof protocol.daemon.DaemonUnarchiveSessionResultSchema)['parse']
>
type DaemonListFilesParams = ReturnType<
  (typeof protocol.daemon.DaemonListFilesRequestParamsSchema)['parse']
>
type DaemonListFilesResult = ReturnType<
  (typeof protocol.daemon.DaemonListFilesResultSchema)['parse']
>
type DaemonSearchFilesParams = ReturnType<
  (typeof protocol.daemon.DaemonSearchFilesRequestParamsSchema)['parse']
>
type DaemonSearchFilesResult = ReturnType<
  (typeof protocol.daemon.DaemonSearchFilesResultSchema)['parse']
>
type DaemonGetWorkspaceFileContentParams = ReturnType<
  (typeof protocol.daemon.DaemonGetWorkspaceFileContentRequestSchema.shape.params)['parse']
>
type DaemonGetWorkspaceFileContentResult = ReturnType<
  (typeof protocol.daemon.DaemonGetWorkspaceFileContentResultSchema)['parse']
>
type DaemonGetGitDiffParams = ReturnType<
  (typeof protocol.daemon.DaemonGetGitDiffRequestParamsSchema)['parse']
>
type DaemonGetGitDiffResult = ReturnType<
  (typeof protocol.daemon.DaemonGetGitDiffResultSchema)['parse']
>
type DaemonGitCommitParams = ReturnType<
  (typeof protocol.daemon.DaemonGitCommitRequestParamsSchema)['parse']
>
type DaemonGitCommitResult = ReturnType<
  (typeof protocol.daemon.DaemonGitCommitResultSchema)['parse']
>
type DaemonGitPushParams = ReturnType<
  (typeof protocol.daemon.DaemonGitPushRequestParamsSchema)['parse']
>
type DaemonGitPushResult = ReturnType<(typeof protocol.daemon.DaemonGitPushResultSchema)['parse']>
type DaemonCreatePRParams = ReturnType<
  (typeof protocol.daemon.DaemonCreatePRRequestParamsSchema)['parse']
>
type DaemonCreatePRResult = ReturnType<(typeof protocol.daemon.DaemonCreatePRResultSchema)['parse']>
type DaemonGetDefaultSettingsResult = ReturnType<
  (typeof protocol.daemon.DaemonGetDefaultSettingsResultSchema)['parse']
>
type DaemonGetMcpConfigResult = ReturnType<
  (typeof protocol.daemon.DaemonGetMcpConfigResultSchema)['parse']
>
type DaemonUpdateMcpConfigParams = ReturnType<
  (typeof protocol.daemon.DaemonUpdateMcpConfigRequestParamsSchema)['parse']
>
type DaemonUpdateMcpConfigResult = ReturnType<
  (typeof protocol.daemon.DaemonUpdateMcpConfigResultSchema)['parse']
>
type DaemonValidateWorkingDirectoryResult = ReturnType<
  (typeof protocol.daemon.DaemonValidateWorkingDirectoryResultSchema)['parse']
>

type SchemaParser<TResult> = {
  parse: (value: unknown) => TResult
}

type DaemonConnectionTarget =
  | {
      type: 'local'
      daemonPort?: number
    }
  | {
      type: 'url'
      url: string
    }
  | {
      type: 'computer'
      computerId: string
      relayBaseUrl?: string
    }

type ResolveWebSocketUrlOptions = Parameters<typeof sdkResolveWebSocketUrl>[0]

type CreateSdkWebSocketTransportContext = {
  target: DaemonConnectionTargetSnapshot
}

type RpcResponseEnvelope<TResult = unknown> = {
  jsonrpc: typeof JSON_RPC_VERSION
  factoryApiVersion: typeof FACTORY_API_VERSION
  type: 'response'
  id: string
  result?: TResult
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

type DaemonOpenedSession = {
  sessionId: string
  cwd?: string
  repoRoot?: string
  updatedAt?: string | number
  workingState?: string
  title?: string
  messagesCount?: number
  callingSessionId?: string
}

type DaemonAvailableSession = {
  sessionId: string
  cwd?: string
  repoRoot?: string
  updatedAt?: string | number
  title?: string
  archivedAt?: string
  messagesCount?: number
  callingSessionId?: string
}

type DaemonOpenedSessionsResult = {
  supportedMethods?: string[]
  supportedNotifications?: string[]
  sessions?: DaemonOpenedSession[]
}

type DaemonAvailableSessionsResult = {
  sessions?: DaemonAvailableSession[]
  hasMore?: boolean
  nextCursor?: number
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

type SdkWebSocketTransportLike = {
  readonly isConnected: boolean
  connect: (url: string) => Promise<void>
  send: (message: Record<string, unknown>) => void
  close: () => Promise<void>
  onMessage: (callback: (message: Record<string, unknown>) => void) => void
  onError: (callback: (error: Error) => void) => void
}

type DaemonSocketLike = {
  readyState: number
  send: (data: string) => void
  close: (code?: number, reason?: string | Buffer) => void
  on: (event: string, listener: (...args: unknown[]) => void) => DaemonSocketLike
  removeListener: (event: string, listener: (...args: unknown[]) => void) => DaemonSocketLike
}

export interface CreateDaemonTransportOptions {
  authProvider?: DaemonAuthProvider
  daemonTarget?: DaemonConnectionTarget
  createWebSocket?: (url: string) => DaemonSocketLike
  createSdkWebSocketTransport?: (
    context: CreateSdkWebSocketTransportContext,
  ) => SdkWebSocketTransportLike
  ensureLocalDaemon?: () => Promise<{ port: number }>
  resolveWebSocketUrl?: (options: ResolveWebSocketUrlOptions) => string
  resolveCandidatePorts?: () => Promise<number[]>
  reconnectBaseDelayMs?: number
  reconnectMaxDelayMs?: number
  refreshIntervalMs?: number
  onStateChange?: (snapshot: DaemonConnectionSnapshot, sessions: SessionRecord[]) => void
}

export interface DaemonTransport {
  start: () => void
  stop: () => Promise<void>
  getStatus: () => DaemonConnectionSnapshot
  listSessions: () => SessionRecord[]
  refreshSessions: () => Promise<void>
  supportsMethod: (method: string) => boolean
  getSessionMessages: (
    params: DaemonGetSessionMessagesParams,
  ) => Promise<DaemonGetSessionMessagesResult>
  searchSessions: (params: DaemonSearchSessionsParams) => Promise<DaemonSearchSessionsResult>
  archiveSession: (sessionId: string) => Promise<DaemonArchiveSessionResult>
  unarchiveSession: (sessionId: string) => Promise<DaemonUnarchiveSessionResult>
  listFiles: (params: DaemonListFilesParams) => Promise<DaemonListFilesResult>
  searchFiles: (params: DaemonSearchFilesParams) => Promise<DaemonSearchFilesResult>
  getWorkspaceFileContent: (
    params: DaemonGetWorkspaceFileContentParams,
  ) => Promise<DaemonGetWorkspaceFileContentResult>
  getGitDiff: (params: DaemonGetGitDiffParams) => Promise<DaemonGetGitDiffResult>
  gitCommit: (params: DaemonGitCommitParams) => Promise<DaemonGitCommitResult>
  gitPush: (params: DaemonGitPushParams) => Promise<DaemonGitPushResult>
  createPullRequest: (params: DaemonCreatePRParams) => Promise<DaemonCreatePRResult>
  getDefaultSettings: () => Promise<DaemonGetDefaultSettingsResult>
  getMcpConfig: () => Promise<DaemonGetMcpConfigResult>
  updateMcpConfig: (params: DaemonUpdateMcpConfigParams) => Promise<DaemonUpdateMcpConfigResult>
  validateWorkingDirectory: (
    workingDirectory: string,
  ) => Promise<DaemonValidateWorkingDirectoryResult>
  forkSession: (sessionId: string) => Promise<{ newSessionId: string }>
  renameSession: (sessionId: string, title: string) => Promise<{ success: true }>
}

function decodeMessage(data: RawData | string | Buffer): string {
  if (typeof data === 'string') {
    return data
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data.map((chunk) => Buffer.from(chunk))).toString('utf8')
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8')
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  }

  return Buffer.from(data as ArrayBuffer).toString('utf8')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coerceIsoTimestamp(value?: string | number): string {
  if (!value) {
    return new Date().toISOString()
  }

  if (typeof value === 'number') {
    const timestampMs = value < 1_000_000_000_000 ? value * 1000 : value
    return new Date(timestampMs).toISOString()
  }

  return value
}

function mapWorkingStateToStatus(workingState?: string): string {
  switch (workingState) {
    case 'working':
    case 'running':
    case 'active':
    case 'executing_tool':
    case 'streaming_assistant_message':
    case 'compacting_conversation':
      return 'active'
    case 'waiting':
    case 'waiting_for_tool_confirmation':
      return 'waiting'
    case 'completed':
      return 'completed'
    case 'disconnected':
      return 'disconnected'
    default:
      return 'idle'
  }
}

function mapAvailableStateToStatus(session: DaemonAvailableSession): string {
  return session.archivedAt ? 'completed' : 'idle'
}

function mapDaemonLineageType(session: { callingSessionId?: string }): string | null {
  return session.callingSessionId ? 'subagent' : null
}

function normalizeDaemonSessions(
  openedSessions: DaemonOpenedSession[],
  availableSessions: DaemonAvailableSession[],
  target: DaemonConnectionTargetSnapshot,
): SessionRecord[] {
  const sessionsById = new Map<string, SessionRecord>()
  const transportLocation = target.type === 'local' ? 'local' : 'remote'

  for (const session of availableSessions) {
    const timestamp = coerceIsoTimestamp(session.updatedAt)

    sessionsById.set(session.sessionId, {
      id: session.sessionId,
      projectId: null,
      projectWorkspacePath: session.repoRoot ?? session.cwd ?? null,
      projectDisplayName: null,
      parentSessionId: session.callingSessionId ?? null,
      derivationType: mapDaemonLineageType(session),
      messageCount: session.messagesCount,
      title: session.title ?? 'Daemon session',
      status: mapAvailableStateToStatus(session),
      transport: 'daemon',
      transportLocation,
      createdAt: timestamp,
      lastActivityAt: timestamp,
      updatedAt: timestamp,
    })
  }

  for (const session of openedSessions) {
    const timestamp = coerceIsoTimestamp(session.updatedAt)
    const existing = sessionsById.get(session.sessionId)

    sessionsById.set(session.sessionId, {
      id: session.sessionId,
      projectId: null,
      projectWorkspacePath:
        session.repoRoot ?? session.cwd ?? existing?.projectWorkspacePath ?? null,
      projectDisplayName: null,
      parentSessionId: session.callingSessionId ?? existing?.parentSessionId ?? null,
      derivationType: mapDaemonLineageType(session) ?? existing?.derivationType ?? null,
      messageCount: session.messagesCount ?? existing?.messageCount,
      title: session.title ?? existing?.title ?? 'Daemon session',
      status: mapWorkingStateToStatus(session.workingState),
      transport: 'daemon',
      transportLocation,
      createdAt: existing?.createdAt ?? timestamp,
      lastActivityAt: timestamp,
      updatedAt: timestamp,
    })
  }

  return [...sessionsById.values()].sort((left, right) => {
    const leftTimestamp = Date.parse(left.lastActivityAt ?? left.updatedAt)
    const rightTimestamp = Date.parse(right.lastActivityAt ?? right.updatedAt)

    if (rightTimestamp !== leftTimestamp) {
      return rightTimestamp - leftTimestamp
    }

    return left.id.localeCompare(right.id)
  })
}

class WsRpcConnection {
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private requestCounter = 0

  constructor(private readonly socket: DaemonSocketLike) {
    this.socket.on('message', this.handleMessage)
  }

  dispose(error?: Error): void {
    this.socket.removeListener('message', this.handleMessage)

    for (const [, pending] of this.pendingRequests) {
      pending.reject(error ?? new Error('Daemon connection closed.'))
    }

    this.pendingRequests.clear()
  }

  async request<TResult>(method: string, params: unknown): Promise<TResult> {
    const id = `daemon-${Date.now()}-${++this.requestCounter}`

    const responsePromise = new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve,
        reject,
      })
    })

    this.socket.send(
      JSON.stringify({
        jsonrpc: JSON_RPC_VERSION,
        factoryApiVersion: FACTORY_API_VERSION,
        type: 'request',
        id,
        method,
        params,
      }),
    )

    return responsePromise
  }

  private readonly handleMessage = (rawMessage: RawData | string | Buffer): void => {
    const payload = JSON.parse(decodeMessage(rawMessage)) as RpcResponseEnvelope

    if (payload.type !== 'response' || typeof payload.id !== 'string') {
      return
    }

    const pending = this.pendingRequests.get(payload.id)

    if (!pending) {
      return
    }

    this.pendingRequests.delete(payload.id)

    if (payload.error) {
      pending.reject(new Error(payload.error.message))
      return
    }

    pending.resolve(payload.result)
  }
}

class SdkTransportRpcConnection {
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private requestCounter = 0

  constructor(private readonly transport: SdkWebSocketTransportLike) {
    this.transport.onMessage(this.handleMessage)
    this.transport.onError((error) => {
      this.dispose(error)
    })
  }

  dispose(error?: Error): void {
    this.transport.onMessage(() => undefined)
    this.transport.onError(() => undefined)

    for (const [, pending] of this.pendingRequests) {
      pending.reject(error ?? new Error('Daemon connection closed.'))
    }

    this.pendingRequests.clear()
  }

  async request<TResult>(method: string, params: unknown): Promise<TResult> {
    const id = `daemon-${Date.now()}-${++this.requestCounter}`

    const responsePromise = new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve,
        reject,
      })
    })

    this.transport.send({
      jsonrpc: JSON_RPC_VERSION,
      factoryApiVersion: FACTORY_API_VERSION,
      type: 'request',
      id,
      method,
      params,
    })

    return responsePromise
  }

  private readonly handleMessage = (payload: Record<string, unknown>): void => {
    if (payload.type !== 'response' || typeof payload.id !== 'string') {
      return
    }

    const pending = this.pendingRequests.get(payload.id)

    if (!pending) {
      return
    }

    this.pendingRequests.delete(payload.id)

    if (isRecord(payload.error) && typeof payload.error.message === 'string') {
      pending.reject(new Error(payload.error.message))
      return
    }

    pending.resolve(payload.result)
  }
}

type DaemonRpcConnection = WsRpcConnection | SdkTransportRpcConnection

class ManagedDaemonTransport implements DaemonTransport {
  private readonly authProvider?: DaemonAuthProvider
  private readonly daemonTarget: DaemonConnectionTarget
  private readonly createWebSocket: (url: string) => DaemonSocketLike
  private readonly createSdkWebSocketTransport: (
    context: CreateSdkWebSocketTransportContext,
  ) => SdkWebSocketTransportLike
  private readonly ensureLocalDaemon: () => Promise<{ port: number }>
  private readonly resolveWebSocketUrl: (options: ResolveWebSocketUrlOptions) => string
  private readonly resolveCandidatePorts: () => Promise<number[]>
  private readonly reconnectBaseDelayMs: number
  private readonly reconnectMaxDelayMs: number
  private readonly refreshIntervalMs: number
  private readonly onStateChange?: (
    snapshot: DaemonConnectionSnapshot,
    sessions: SessionRecord[],
  ) => void
  private readonly useLegacyPortDiscovery: boolean

  private status: DaemonConnectionStatus = 'disconnected'
  private connectedPort: number | null = null
  private lastError: string | null = null
  private lastConnectedAt: string | null = null
  private lastSyncAt: string | null = null
  private nextRetryDelayMs: number | null = null
  private sessions: SessionRecord[] = []
  private socket: DaemonSocketLike | null = null
  private sdkTransport: SdkWebSocketTransportLike | null = null
  private connection: DaemonRpcConnection | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private refreshTimer: NodeJS.Timeout | null = null
  private started = false
  private connecting = false
  private reconnectAttempt = 0
  private hasConnectedOnce = false
  private supportedMethods: Set<string> | null = null

  constructor(options: CreateDaemonTransportOptions) {
    this.authProvider = options.authProvider
    this.daemonTarget = options.daemonTarget ?? { type: 'local' }
    this.createWebSocket = options.createWebSocket ?? ((url) => new WebSocket(url))
    this.createSdkWebSocketTransport =
      options.createSdkWebSocketTransport ??
      (({ target }) =>
        new WebSocketTransport(
          target.type === 'computer'
            ? {
                connectionTimeoutMs: 45_000,
                maxConnectRetries: 10,
                initialRetryDelayMs: 2_000,
                maxRetryDelayMs: 10_000,
              }
            : undefined,
        ))
    this.ensureLocalDaemon = options.ensureLocalDaemon ?? sdkEnsureLocalDaemon
    this.resolveWebSocketUrl = options.resolveWebSocketUrl ?? sdkResolveWebSocketUrl
    this.resolveCandidatePorts = options.resolveCandidatePorts ?? resolveKnownDaemonPorts
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS
    this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.onStateChange = options.onStateChange
    this.useLegacyPortDiscovery = Boolean(options.createWebSocket || options.resolveCandidatePorts)
  }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    void this.connect()
  }

  async stop(): Promise<void> {
    this.started = false
    this.clearReconnectTimer()
    this.clearRefreshTimer()
    this.teardownConnection()
    this.updateState({
      status: 'disconnected',
      connectedPort: null,
      nextRetryDelayMs: null,
    })
  }

  getStatus(): DaemonConnectionSnapshot {
    return {
      status: this.status,
      connectedPort: this.connectedPort,
      target: this.getTargetSnapshot(),
      lastError: this.lastError,
      lastConnectedAt: this.lastConnectedAt,
      lastSyncAt: this.lastSyncAt,
      nextRetryDelayMs: this.nextRetryDelayMs,
    }
  }

  listSessions(): SessionRecord[] {
    return [...this.sessions]
  }

  supportsMethod(method: string): boolean {
    if (this.status !== 'connected') {
      return false
    }

    return this.supportedMethods?.has(method) ?? KNOWN_DAEMON_METHODS.has(method)
  }

  async forkSession(sessionId: string): Promise<{ newSessionId: string }> {
    const connection = this.requireConnection()

    this.assertMethodSupported(DAEMON_METHOD.FORK_SESSION)

    return connection.request(DAEMON_METHOD.FORK_SESSION, { sessionId })
  }

  async renameSession(sessionId: string, title: string): Promise<{ success: true }> {
    const connection = this.requireConnection()

    this.assertMethodSupported(DAEMON_METHOD.RENAME_SESSION)

    return connection.request(DAEMON_METHOD.RENAME_SESSION, { sessionId, title })
  }

  async getSessionMessages(
    params: DaemonGetSessionMessagesParams,
  ): Promise<DaemonGetSessionMessagesResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.GET_SESSION_MESSAGES,
      protocol.daemon.DaemonGetSessionMessagesRequestParamsSchema,
      protocol.daemon.DaemonGetSessionMessagesResultSchema,
      params,
    )
  }

  async searchSessions(params: DaemonSearchSessionsParams): Promise<DaemonSearchSessionsResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.SEARCH_SESSIONS,
      protocol.daemon.DaemonSearchSessionsRequestParamsSchema,
      protocol.daemon.DaemonSearchSessionsResultSchema,
      params,
    )
  }

  async archiveSession(sessionId: string): Promise<DaemonArchiveSessionResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.ARCHIVE_SESSION,
      protocol.daemon.DaemonArchiveSessionRequestParamsSchema,
      protocol.daemon.DaemonArchiveSessionResultSchema,
      { sessionId },
    )
  }

  async unarchiveSession(sessionId: string): Promise<DaemonUnarchiveSessionResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.UNARCHIVE_SESSION,
      protocol.daemon.DaemonUnarchiveSessionRequestParamsSchema,
      protocol.daemon.DaemonUnarchiveSessionResultSchema,
      { sessionId },
    )
  }

  async listFiles(params: DaemonListFilesParams): Promise<DaemonListFilesResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.LIST_FILES,
      protocol.daemon.DaemonListFilesRequestParamsSchema,
      protocol.daemon.DaemonListFilesResultSchema,
      params,
    )
  }

  async searchFiles(params: DaemonSearchFilesParams): Promise<DaemonSearchFilesResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.SEARCH_FILES,
      protocol.daemon.DaemonSearchFilesRequestParamsSchema,
      protocol.daemon.DaemonSearchFilesResultSchema,
      params,
    )
  }

  async getWorkspaceFileContent(
    params: DaemonGetWorkspaceFileContentParams,
  ): Promise<DaemonGetWorkspaceFileContentResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.GET_WORKSPACE_FILE_CONTENT,
      protocol.daemon.DaemonGetWorkspaceFileContentRequestSchema.shape.params,
      protocol.daemon.DaemonGetWorkspaceFileContentResultSchema,
      params,
    )
  }

  async getGitDiff(params: DaemonGetGitDiffParams): Promise<DaemonGetGitDiffResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.GET_GIT_DIFF,
      protocol.daemon.DaemonGetGitDiffRequestParamsSchema,
      protocol.daemon.DaemonGetGitDiffResultSchema,
      params,
    )
  }

  async gitCommit(params: DaemonGitCommitParams): Promise<DaemonGitCommitResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.GIT_COMMIT,
      protocol.daemon.DaemonGitCommitRequestParamsSchema,
      protocol.daemon.DaemonGitCommitResultSchema,
      params,
    )
  }

  async gitPush(params: DaemonGitPushParams): Promise<DaemonGitPushResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.GIT_PUSH,
      protocol.daemon.DaemonGitPushRequestParamsSchema,
      protocol.daemon.DaemonGitPushResultSchema,
      params,
    )
  }

  async createPullRequest(params: DaemonCreatePRParams): Promise<DaemonCreatePRResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.CREATE_PR,
      protocol.daemon.DaemonCreatePRRequestParamsSchema,
      protocol.daemon.DaemonCreatePRResultSchema,
      params,
    )
  }

  async getDefaultSettings(): Promise<DaemonGetDefaultSettingsResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_SETTINGS_METHOD.GET_DEFAULT_SETTINGS,
      protocol.daemon.DaemonGetDefaultSettingsRequestParamsSchema,
      protocol.daemon.DaemonGetDefaultSettingsResultSchema,
      {},
    )
  }

  async getMcpConfig(): Promise<DaemonGetMcpConfigResult> {
    const connection = this.requireConnection()
    this.assertMethodSupported(DAEMON_METHOD.GET_MCP_CONFIG)

    const params = protocol.daemon.DaemonGetMcpConfigRequestSchema.shape.params.parse({})
    const result = await connection.request(DAEMON_METHOD.GET_MCP_CONFIG, params)
    return protocol.daemon.DaemonGetMcpConfigResultSchema.parse(result)
  }

  async updateMcpConfig(params: DaemonUpdateMcpConfigParams): Promise<DaemonUpdateMcpConfigResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.UPDATE_MCP_CONFIG,
      protocol.daemon.DaemonUpdateMcpConfigRequestParamsSchema,
      protocol.daemon.DaemonUpdateMcpConfigResultSchema,
      params,
    )
  }

  async validateWorkingDirectory(
    workingDirectory: string,
  ): Promise<DaemonValidateWorkingDirectoryResult> {
    return this.requestSupportedDaemonMethod(
      DAEMON_METHOD.VALIDATE_WORKING_DIRECTORY,
      protocol.daemon.DaemonValidateWorkingDirectoryRequestParamsSchema,
      protocol.daemon.DaemonValidateWorkingDirectoryResultSchema,
      { workingDirectory },
    )
  }

  async refreshSessions(): Promise<void> {
    const connection = this.requireConnection()
    const [openedResult, availableSessions] = await Promise.all([
      connection.request<DaemonOpenedSessionsResult>(DAEMON_METHOD.LIST_OPENED_SESSIONS, {}),
      this.listAvailableSessions(connection),
    ])

    const nextSessions = normalizeDaemonSessions(
      openedResult.sessions ?? [],
      availableSessions,
      this.getTargetSnapshot(this.connectedPort ?? undefined),
    )
    const sessionsChanged = !areDaemonSessionsEqual(this.sessions, nextSessions)

    this.supportedMethods = openedResult.supportedMethods
      ? new Set(openedResult.supportedMethods)
      : null
    this.sessions = nextSessions
    this.lastSyncAt = new Date().toISOString()

    if (sessionsChanged) {
      this.emitStateChange()
    }
  }

  private requireConnection(): DaemonRpcConnection {
    if (!this.connection || this.status !== 'connected') {
      throw new Error('Daemon is not connected.')
    }

    return this.connection
  }

  private async connect(): Promise<void> {
    if (!this.started || this.connecting) {
      return
    }

    this.connecting = true

    try {
      if (!this.useLegacyPortDiscovery) {
        await this.connectWithSdkTransport()
        return
      }

      const { connectedPort, lastError } = await discoverReachableDaemonPort({
        resolveCandidatePorts: this.resolveCandidatePorts,
        tryPort: (port) => this.connectToPort(port),
      })

      if (connectedPort !== null) {
        this.reconnectAttempt = 0
        return
      }

      this.sessions = []
      this.supportedMethods = null
      this.updateState({
        status: this.hasConnectedOnce ? 'reconnecting' : 'disconnected',
        connectedPort: null,
        lastError: lastError?.message ?? 'No daemon ports responded.',
        nextRetryDelayMs: this.started ? this.calculateReconnectDelay() : null,
      })

      if (this.started) {
        this.scheduleReconnect()
      }
    } finally {
      this.connecting = false
    }
  }

  private async connectWithSdkTransport(): Promise<void> {
    const credentials = resolveDaemonCredentials(this.authProvider)

    if (!credentials) {
      throw new Error('Daemon authentication credentials are unavailable.')
    }

    const { options, connectedPort, target } = await this.resolveSdkConnectOptions(
      credentials.apiKey ?? credentials.token ?? '',
    )
    const url = this.resolveWebSocketUrl(options)
    const transport = this.createSdkWebSocketTransport({ target })

    await transport.connect(url)
    const connection = new SdkTransportRpcConnection(transport)

    try {
      await authenticateDaemonConnection(connection, credentials)
      const openedResult = await connection.request<DaemonOpenedSessionsResult>(
        DAEMON_METHOD.LIST_OPENED_SESSIONS,
        {},
      )

      this.assertDaemonCapabilities(openedResult)

      const availableSessions = await this.listAvailableSessions(connection)

      this.teardownConnection()
      this.sdkTransport = transport
      this.connection = connection
      this.sdkTransport.onError((error) => {
        connection.dispose(error)
        this.handleConnectionLoss(error)
      })
      this.connectedPort = connectedPort
      this.status = 'connected'
      this.lastError = null
      this.lastConnectedAt = new Date().toISOString()
      this.lastSyncAt = this.lastConnectedAt
      this.nextRetryDelayMs = null
      this.hasConnectedOnce = true
      this.supportedMethods = openedResult.supportedMethods
        ? new Set(openedResult.supportedMethods)
        : null
      this.sessions = normalizeDaemonSessions(
        openedResult.sessions ?? [],
        availableSessions,
        target,
      )
      this.emitStateChange()
      this.scheduleRefresh()
    } catch (error) {
      connection.dispose()
      await transport.close().catch(() => undefined)
      throw error
    }
  }

  private async connectToPort(port: number): Promise<void> {
    const credentials = resolveDaemonCredentials(this.authProvider)

    if (!credentials) {
      throw new Error('Daemon authentication credentials are unavailable.')
    }

    const socket = await this.openSocket(port)
    const connection = new WsRpcConnection(socket)

    try {
      await authenticateDaemonConnection(connection, credentials)
      const openedResult = await connection.request<DaemonOpenedSessionsResult>(
        DAEMON_METHOD.LIST_OPENED_SESSIONS,
        {},
      )

      this.assertDaemonCapabilities(openedResult)

      const availableSessions = await this.listAvailableSessions(connection)

      this.teardownConnection()
      this.socket = socket
      this.connection = connection
      this.socket.on('close', this.handleSocketClose)
      this.socket.on('error', this.handleSocketError)
      this.connectedPort = port
      this.status = 'connected'
      this.lastError = null
      this.lastConnectedAt = new Date().toISOString()
      this.lastSyncAt = this.lastConnectedAt
      this.nextRetryDelayMs = null
      this.hasConnectedOnce = true
      this.supportedMethods = openedResult.supportedMethods
        ? new Set(openedResult.supportedMethods)
        : null
      this.sessions = normalizeDaemonSessions(openedResult.sessions ?? [], availableSessions, {
        type: 'local',
        label: `Local daemon:${port}`,
      })
      this.emitStateChange()
      this.scheduleRefresh()
    } catch (error) {
      connection.dispose()
      socket.close()
      throw error
    }
  }

  private assertDaemonCapabilities(openedResult: DaemonOpenedSessionsResult): void {
    if (!openedResult.supportedMethods) {
      return
    }

    const requiredMethods = [
      DAEMON_METHOD.LIST_OPENED_SESSIONS,
      DAEMON_METHOD.LIST_AVAILABLE_SESSIONS,
    ]

    for (const method of requiredMethods) {
      if (!(openedResult.supportedMethods ?? []).includes(method)) {
        throw new Error(`Daemon missing required capability: ${method}`)
      }
    }
  }

  private assertMethodSupported(method: string): void {
    if (!this.supportsMethod(method)) {
      throw new Error(`Daemon missing required capability: ${method}`)
    }
  }

  private async requestSupportedDaemonMethod<TParams, TResult>(
    method: string,
    paramsSchema: SchemaParser<TParams>,
    resultSchema: SchemaParser<TResult>,
    params: TParams,
  ): Promise<TResult> {
    const connection = this.requireConnection()

    this.assertMethodSupported(method)

    const result = await connection.request(method, paramsSchema.parse(params))
    return resultSchema.parse(result)
  }

  private async resolveSdkConnectOptions(apiKey: string): Promise<{
    options: ResolveWebSocketUrlOptions
    connectedPort: number | null
    target: DaemonConnectionTargetSnapshot
  }> {
    if (this.daemonTarget.type === 'url') {
      return {
        options: {
          apiKey,
          url: this.daemonTarget.url,
        } satisfies ConnectDaemonOptions,
        connectedPort: null,
        target: this.getTargetSnapshot(),
      }
    }

    if (this.daemonTarget.type === 'computer') {
      return {
        options: {
          apiKey,
          machine: {
            type: MachineType.Computer,
            computerId: this.daemonTarget.computerId,
          },
          ...(this.daemonTarget.relayBaseUrl
            ? { relayBaseUrl: this.daemonTarget.relayBaseUrl }
            : {}),
        } satisfies ConnectDaemonOptions,
        connectedPort: null,
        target: this.getTargetSnapshot(),
      }
    }

    const { port } = await this.ensureLocalDaemon()

    return {
      options: {
        apiKey,
        daemonPort: this.daemonTarget.daemonPort ?? port,
      } satisfies ConnectDaemonOptions,
      connectedPort: this.daemonTarget.daemonPort ?? port,
      target: this.getTargetSnapshot(this.daemonTarget.daemonPort ?? port),
    }
  }

  private getTargetSnapshot(localPort?: number): DaemonConnectionTargetSnapshot {
    if (this.daemonTarget.type === 'url') {
      return {
        type: 'url',
        label: 'Explicit daemon URL',
      }
    }

    if (this.daemonTarget.type === 'computer') {
      return {
        type: 'computer',
        label: `Factory computer ${this.daemonTarget.computerId}`,
        computerId: this.daemonTarget.computerId,
      }
    }

    return {
      type: 'local',
      label: `Local daemon${localPort ? `:${localPort}` : ''}`,
    }
  }

  private async listAvailableSessions(
    connection: DaemonRpcConnection,
  ): Promise<DaemonAvailableSession[]> {
    const sessions: DaemonAvailableSession[] = []
    let endBefore: number | undefined

    do {
      const result = await connection.request<DaemonAvailableSessionsResult>(
        DAEMON_METHOD.LIST_AVAILABLE_SESSIONS,
        {
          limit: AVAILABLE_SESSION_PAGE_SIZE,
          includeMissionMetadata: true,
          ...(endBefore === undefined ? {} : { endBefore }),
        },
      )

      sessions.push(...(result.sessions ?? []))
      endBefore = result.nextCursor

      if (!result.hasMore) {
        break
      }
    } while (endBefore !== undefined)

    return sessions
  }

  private openSocket(port: number): Promise<DaemonSocketLike> {
    return new Promise<DaemonSocketLike>((resolve, reject) => {
      const socket = this.createWebSocket(`ws://127.0.0.1:${port}`)

      const cleanup = (): void => {
        socket.removeListener('open', handleOpen)
        socket.removeListener('error', handleError)
        socket.removeListener('close', handleClose)
      }

      const handleOpen = (): void => {
        cleanup()
        resolve(socket)
      }

      const handleError = (error: Error): void => {
        cleanup()
        reject(error)
      }

      const handleClose = (code: number): void => {
        cleanup()
        reject(new Error(`Daemon socket closed before ready (${code}).`))
      }

      socket.on('open', handleOpen)
      socket.on('error', handleError)
      socket.on('close', handleClose)
    })
  }

  private scheduleRefresh(): void {
    this.clearRefreshTimer()

    if (!this.started || this.refreshIntervalMs <= 0) {
      return
    }

    this.refreshTimer = setInterval(() => {
      void this.refreshSessions().catch((error) => {
        this.handleConnectionLoss(error instanceof Error ? error : new Error(String(error)))
      })
    }, this.refreshIntervalMs)
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()

    const delay = this.nextRetryDelayMs ?? this.calculateReconnectDelay()
    this.nextRetryDelayMs = delay

    if (!this.started) {
      return
    }

    this.reconnectTimer = setTimeout(() => {
      void this.connect()
    }, delay)
  }

  private calculateReconnectDelay(): number {
    const delay = Math.min(
      this.reconnectBaseDelayMs * 2 ** this.reconnectAttempt,
      this.reconnectMaxDelayMs,
    )
    this.reconnectAttempt += 1
    return delay
  }

  private handleConnectionLoss(error: Error): void {
    if (!this.started) {
      return
    }

    this.clearRefreshTimer()
    this.teardownConnection(error)
    this.sessions = []
    this.supportedMethods = null
    this.updateState({
      status: this.hasConnectedOnce ? 'reconnecting' : 'disconnected',
      connectedPort: null,
      lastError: error.message,
      nextRetryDelayMs: this.calculateReconnectDelay(),
    })
    this.scheduleReconnect()
  }

  private readonly handleSocketClose = (code: number): void => {
    this.handleConnectionLoss(new Error(`Daemon connection closed (${code}).`))
  }

  private readonly handleSocketError = (error: Error): void => {
    this.handleConnectionLoss(error)
  }

  private teardownConnection(error?: Error): void {
    if (this.socket) {
      this.socket.removeListener('close', this.handleSocketClose)
      this.socket.removeListener('error', this.handleSocketError)
    }

    this.connection?.dispose(error)
    this.connection = null

    if (this.sdkTransport) {
      this.sdkTransport.onMessage(() => undefined)
      this.sdkTransport.onError(() => undefined)
      void this.sdkTransport.close().catch(() => undefined)
      this.sdkTransport = null
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'client shutdown')
    }

    this.socket = null
  }

  private updateState(partial: Partial<DaemonConnectionSnapshot>): void {
    const { changed, nextSnapshot } = getDaemonSnapshotUpdate(this.getStatus(), partial)

    if (!changed) {
      return
    }

    this.status = nextSnapshot.status
    this.connectedPort = nextSnapshot.connectedPort
    this.lastError = nextSnapshot.lastError
    this.lastConnectedAt = nextSnapshot.lastConnectedAt
    this.lastSyncAt = nextSnapshot.lastSyncAt
    this.nextRetryDelayMs = nextSnapshot.nextRetryDelayMs
    this.emitStateChange()
  }

  private emitStateChange(): void {
    this.onStateChange?.(this.getStatus(), this.listSessions())
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }
}

export function createDaemonTransport(options: CreateDaemonTransportOptions = {}): DaemonTransport {
  return new ManagedDaemonTransport(options)
}

export type { DaemonAuthProvider }
