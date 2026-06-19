import { randomUUID } from 'node:crypto'
import {
  type AskUserRequestParams,
  type AskUserResult,
  convertNotificationToStreamMessage,
  DaemonClient,
  type DroidClientTransport,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  type LiveSessionAskUserAnswerRecord,
  type LiveSessionAskUserQuestionRecord,
  protocol,
  type RequestPermissionRequestParams,
  SDK_TAG,
  StreamStateTracker,
  ensureLocalDaemon as sdkEnsureLocalDaemon,
  resolveWebSocketUrl as sdkResolveWebSocketUrl,
  WebSocketTransport,
} from '@factory/droid-sdk'
import type {
  LiveSessionAddUserMessageRequest,
  LiveSessionBugReportRequest,
  LiveSessionBugReportResult,
  LiveSessionContextStatsInfo,
  LiveSessionMcpAuthCodeRequest,
  LiveSessionMcpRegistryServerInfo,
  LiveSessionMcpServerConfig,
  LiveSessionMcpServerInfo,
  LiveSessionMcpToolInfo,
  LiveSessionSkillInfo,
  LiveSessionTokenUsageRecord,
} from '../../../shared/ipc/contracts'

import {
  authenticateDaemonConnection,
  type DaemonAuthProvider,
  type DaemonRpcClient,
  type ResolvedDaemonCredentials,
  resolveDaemonCredentials,
} from '../daemon/auth'
import type {
  InitializeSessionRequest,
  LiveSessionCompactResult,
  LiveSessionExecuteRewindParams,
  LiveSessionExecuteRewindResult,
  LiveSessionQueuedUserMessageResolution,
  LiveSessionRewindInfo,
  LiveSessionSettings,
  RequestId,
  SessionEventSink,
  StreamJsonRpcInitializeResult,
  StreamJsonRpcLoadResult,
  StreamJsonRpcProcessTransportLike,
} from '../sessions/types'
import {
  createAskUserRequestedEvent,
  createPermissionRequestedEvent,
  extractEmbeddedSessionEventsFromDroidMessage,
  mapDroidMessageToSessionEvent,
  mapDroidNotificationPayloadToSessionEvents,
} from './events'

const DAEMON_METHOD = protocol.daemon.DaemonDroidMethod

type Deferred<T> = {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  promise: Promise<T>
}

type JsonRpcMessage = Record<string, unknown>
type JsonRpcMessageObserver = (message: JsonRpcMessage) => void
type JsonRpcErrorObserver = (error: Error) => void
type TurnTrackingState = {
  startedAt: number
  hasOutputFormat: boolean
  fullText: string
  finalAssistantText: string
  tokenUsage: LiveSessionTokenUsageRecord | null
  structuredOutput: unknown
  structuredOutputError: unknown
  errors: string[]
  turnCount: number
}

type DaemonClientLike = {
  readonly sessionId: string | null
  initializeSession(params: Record<string, unknown>): Promise<StreamJsonRpcInitializeResult>
  loadSession(params: Record<string, unknown>): Promise<StreamJsonRpcLoadResult>
  addUserMessage(params: Record<string, unknown>): Promise<unknown>
  interruptSession(): Promise<unknown>
  forkSession(): Promise<{ newSessionId: string }>
  getRewindInfo(params: { messageId: string }): Promise<LiveSessionRewindInfo>
  executeRewind(
    params: LiveSessionExecuteRewindParams,
  ): Promise<Omit<LiveSessionExecuteRewindResult, 'snapshot'>>
  compactSession(
    params: Record<string, unknown>,
  ): Promise<Omit<LiveSessionCompactResult, 'snapshot'>>
  renameSession?(params: { title: string }): Promise<unknown>
  listSkills?(): Promise<{ skills: LiveSessionSkillInfo[] }>
  listMcpServers?(): Promise<{ servers: LiveSessionMcpServerInfo[] }>
  listMcpTools?(): Promise<{ tools: LiveSessionMcpToolInfo[] }>
  addMcpServer?(config: LiveSessionMcpServerConfig): Promise<unknown>
  removeMcpServer?(params: { serverName: string; settingsLevel: 'user' }): Promise<unknown>
  toggleMcpServer?(params: {
    serverName: string
    enabled: boolean
    settingsLevel: 'user'
  }): Promise<unknown>
  authenticateMcpServer?(params: { serverName: string }): Promise<unknown>
  getContextBreakdown?(): Promise<{
    contextBudget?: number
    usedTokens?: number
    freeTokens?: number
  }>
  updateSessionSettings(settings: Partial<LiveSessionSettings>): Promise<unknown>
  closeSession?(params: { reason: string }): Promise<unknown>
  close(): Promise<unknown>
  onNotification(callback: (notification: Record<string, unknown>) => void): () => void
  setPermissionHandler(callback: (params: Record<string, unknown>) => Promise<string>): void
  setAskUserHandler(callback: (params: Record<string, unknown>) => Promise<AskUserResult>): void
}

type DaemonWebSocketTransportLike = DroidClientTransport & {
  connect(url: string): Promise<void>
}

export interface DroidSdkDaemonSessionTransportOptions {
  authProvider?: DaemonAuthProvider
  cwd?: string
  sessionId?: string | null
  createWebSocketTransport?: () => DaemonWebSocketTransportLike
  createDaemonClient?: (options: {
    transport: DroidClientTransport
    apiKey: string
  }) => DaemonClientLike
  ensureLocalDaemon?: () => Promise<{ port: number }>
  resolveWebSocketUrl?: (options: { apiKey: string; daemonPort: number }) => string
  authenticateConnection?: (
    connection: DaemonRpcClient,
    credentials: ResolvedDaemonCredentials,
  ) => Promise<void>
}

class ObservedDaemonWebSocketTransport implements DaemonWebSocketTransportLike {
  private messageHandler: ((message: JsonRpcMessage) => void) | null = null
  private errorHandler: ((error: Error) => void) | null = null
  private readonly messageObservers = new Set<JsonRpcMessageObserver>()
  private readonly sentMessageObservers = new Set<JsonRpcMessageObserver>()
  private readonly errorObservers = new Set<JsonRpcErrorObserver>()

  constructor(private readonly inner: DaemonWebSocketTransportLike) {
    this.inner.onMessage((message) => {
      for (const observer of this.messageObservers) {
        observer(message)
      }

      this.messageHandler?.(message)
    })

    this.inner.onError((error) => {
      this.errorHandler?.(error)

      for (const observer of this.errorObservers) {
        observer(error)
      }
    })
  }

  get isConnected(): boolean {
    return this.inner.isConnected
  }

  connect(url: string): Promise<void> {
    return this.inner.connect(url)
  }

  send(message: JsonRpcMessage): void {
    for (const observer of this.sentMessageObservers) {
      observer(message)
    }

    this.inner.send(message)
  }

  onMessage(callback: (message: JsonRpcMessage) => void): void {
    this.messageHandler = callback
  }

  onError(callback: (error: Error) => void): void {
    this.errorHandler = callback
  }

  close(): Promise<void> {
    return this.inner.close()
  }

  observeMessages(observer: JsonRpcMessageObserver): () => void {
    this.messageObservers.add(observer)
    return () => {
      this.messageObservers.delete(observer)
    }
  }

  observeSentMessages(observer: JsonRpcMessageObserver): () => void {
    this.sentMessageObservers.add(observer)
    return () => {
      this.sentMessageObservers.delete(observer)
    }
  }

  observeErrors(observer: JsonRpcErrorObserver): () => void {
    this.errorObservers.add(observer)
    return () => {
      this.errorObservers.delete(observer)
    }
  }
}

class DaemonTransportRpcConnection implements DaemonRpcClient {
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (reason?: unknown) => void
    }
  >()
  private requestCounter = 0

  constructor(private readonly transport: DroidClientTransport) {
    this.transport.onMessage(this.handleMessage)
    this.transport.onError((error) => {
      this.dispose(error)
    })
  }

  dispose(error?: Error): void {
    this.transport.onMessage(() => undefined)
    this.transport.onError(() => undefined)

    for (const pending of this.pendingRequests.values()) {
      pending.reject(error ?? new Error('Daemon connection closed.'))
    }

    this.pendingRequests.clear()
  }

  async request<TResult>(method: string, params: unknown): Promise<TResult> {
    const id = `daemon-session-${Date.now()}-${++this.requestCounter}`

    const responsePromise = new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject })
    })

    this.transport.send({
      jsonrpc: JSONRPC_VERSION,
      factoryApiVersion: LEGACY_FACTORY_API_VERSION,
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

class ObservedDaemonRpcConnection implements DaemonRpcClient {
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (reason?: unknown) => void
    }
  >()
  private readonly unsubscribeMessages: () => void
  private readonly unsubscribeErrors: () => void
  private requestCounter = 0

  constructor(private readonly transport: ObservedDaemonWebSocketTransport) {
    this.unsubscribeMessages = this.transport.observeMessages(this.handleMessage)
    this.unsubscribeErrors = this.transport.observeErrors((error) => {
      this.dispose(error)
    })
  }

  dispose(error?: Error): void {
    this.unsubscribeMessages()
    this.unsubscribeErrors()

    for (const pending of this.pendingRequests.values()) {
      pending.reject(error ?? new Error('Daemon connection closed.'))
    }

    this.pendingRequests.clear()
  }

  async request<TResult>(method: string, params: unknown): Promise<TResult> {
    const id = `daemon-session-extra-${Date.now()}-${++this.requestCounter}`

    const responsePromise = new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject })
    })

    this.transport.send({
      jsonrpc: JSONRPC_VERSION,
      factoryApiVersion: LEGACY_FACTORY_API_VERSION,
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

export class DroidSdkDaemonSessionTransport implements StreamJsonRpcProcessTransportLike {
  readonly transportKind = 'daemon'

  private readonly observedTransport: ObservedDaemonWebSocketTransport
  private readonly daemonRpc: ObservedDaemonRpcConnection
  private readonly client: Promise<DaemonClientLike>
  private readonly sinks = new Set<SessionEventSink>()
  private readonly permissionRequestIdQueue: string[] = []
  private readonly askUserRequestIdQueue: string[] = []
  private readonly rewindBoundaryMessageIdByRequestId = new Map<string, string>()
  private readonly pendingPermissions = new Map<
    string,
    {
      deferred: Deferred<string>
      toolUseIds: string[]
    }
  >()
  private readonly pendingAskUser = new Map<
    string,
    {
      deferred: Deferred<AskUserResult>
      questions: LiveSessionAskUserQuestionRecord[]
    }
  >()
  private readonly toolNamesByUseId = new Map<string, string>()
  private readonly ensureLocalDaemon: () => Promise<{ port: number }>
  private readonly resolveWebSocketUrl: (options: { apiKey: string; daemonPort: number }) => string
  private readonly authenticateConnection: (
    connection: DaemonRpcClient,
    credentials: ResolvedDaemonCredentials,
  ) => Promise<void>
  private readonly createDaemonClient: (options: {
    transport: DroidClientTransport
    apiKey: string
  }) => DaemonClientLike
  private readonly authProvider?: DaemonAuthProvider

  private currentSessionId: string | null
  private activeStreamStateTracker: StreamStateTracker | null = null
  private activeTurnState: TurnTrackingState | null = null
  private disposed = false

  constructor(options: DroidSdkDaemonSessionTransportOptions = {}) {
    this.authProvider = options.authProvider
    this.currentSessionId = options.sessionId ?? null
    this.ensureLocalDaemon = options.ensureLocalDaemon ?? sdkEnsureLocalDaemon
    this.resolveWebSocketUrl = options.resolveWebSocketUrl ?? sdkResolveWebSocketUrl
    this.authenticateConnection = options.authenticateConnection ?? authenticateDaemonConnection
    this.createDaemonClient =
      options.createDaemonClient ??
      ((clientOptions) => new DaemonClient(clientOptions) as unknown as DaemonClientLike)
    this.observedTransport = new ObservedDaemonWebSocketTransport(
      options.createWebSocketTransport?.() ??
        (new WebSocketTransport() as DaemonWebSocketTransportLike),
    )
    this.daemonRpc = new ObservedDaemonRpcConnection(this.observedTransport)
    this.client = this.connect()

    this.observedTransport.observeMessages((message) => {
      this.captureServerRequestIds(message)
    })
    this.observedTransport.observeSentMessages((message) => {
      this.captureClientRequestIds(message)
    })
    this.observedTransport.observeErrors((error) => {
      void this.handleTransportError(error)
    })
  }

  get processId(): number {
    return 0
  }

  subscribe(sink: SessionEventSink): () => void {
    this.sinks.add(sink)

    return () => {
      this.sinks.delete(sink)
    }
  }

  async initializeSession(
    _requestId: RequestId,
    request: string | InitializeSessionRequest,
  ): Promise<StreamJsonRpcInitializeResult> {
    const client = await this.client
    const initRequest = normalizeInitializeSessionRequest(request)
    const result = await client.initializeSession({
      machineId: 'oxox-electron',
      cwd: initRequest.cwd,
      ...initRequest.settings,
      tags: [SDK_TAG],
    })

    this.currentSessionId = result.sessionId
    return {
      sessionId: result.sessionId,
      session: result.session,
      settings: result.settings,
      availableModels: result.availableModels,
      cwd: result.cwd,
      isAgentLoopInProgress: result.isAgentLoopInProgress,
    }
  }

  async loadSession(_requestId: RequestId, sessionId: string): Promise<StreamJsonRpcLoadResult> {
    const client = await this.client
    const result = await client.loadSession({ sessionId })

    this.currentSessionId = sessionId
    return {
      session: result.session,
      settings: result.settings,
      availableModels: result.availableModels,
      cwd: result.cwd,
      isAgentLoopInProgress: result.isAgentLoopInProgress,
    }
  }

  async interruptSession(_requestId: RequestId): Promise<void> {
    const client = await this.client
    await client.interruptSession()
  }

  async addUserMessage(
    _requestId: RequestId,
    message: string | LiveSessionAddUserMessageRequest,
  ): Promise<void> {
    const client = await this.client
    const normalizedMessage = typeof message === 'string' ? { text: message } : message
    const startedAt = Date.now()
    const hasOutputFormat = Boolean(normalizedMessage.outputFormat)
    this.activeTurnState = createTurnTrackingState({
      hasOutputFormat,
      startedAt,
    })
    this.activeStreamStateTracker = this.createStreamStateTracker({
      hasOutputFormat,
      startedAt,
    })
    await client.addUserMessage({
      ...normalizedMessage,
      messageId: randomUUID(),
    })
  }

  async forkSession(_requestId: RequestId): Promise<{ newSessionId: string }> {
    const client = await this.client
    return client.forkSession()
  }

  async getRewindInfo(_requestId: RequestId, messageId: string): Promise<LiveSessionRewindInfo> {
    const client = await this.client
    return client.getRewindInfo({ messageId })
  }

  async executeRewind(
    _requestId: RequestId,
    params: LiveSessionExecuteRewindParams,
  ): Promise<Omit<LiveSessionExecuteRewindResult, 'snapshot'>> {
    const client = await this.client
    return client.executeRewind(params)
  }

  async compactSession(
    _requestId: RequestId,
    customInstructions?: string,
  ): Promise<Omit<LiveSessionCompactResult, 'snapshot'>> {
    const client = await this.client
    return client.compactSession(customInstructions ? { customInstructions } : {})
  }

  async renameSession(_requestId: RequestId, title: string): Promise<void> {
    const client = await this.client
    await client.renameSession?.({ title })
  }

  async listSkills(_requestId: RequestId): Promise<LiveSessionSkillInfo[]> {
    const client = await this.client
    return (await client.listSkills?.())?.skills ?? []
  }

  async listMcpServers(_requestId: RequestId): Promise<LiveSessionMcpServerInfo[]> {
    const client = await this.client
    return (await client.listMcpServers?.())?.servers ?? []
  }

  async listMcpTools(_requestId: RequestId): Promise<LiveSessionMcpToolInfo[]> {
    const client = await this.client
    return (await client.listMcpTools?.())?.tools ?? []
  }

  async addMcpServer(_requestId: RequestId, config: LiveSessionMcpServerConfig): Promise<void> {
    const client = await this.client
    await client.addMcpServer?.(config)
  }

  async removeMcpServer(_requestId: RequestId, serverName: string): Promise<void> {
    const client = await this.client
    await client.removeMcpServer?.({ serverName, settingsLevel: 'user' })
  }

  async toggleMcpServer(
    _requestId: RequestId,
    serverName: string,
    enabled: boolean,
  ): Promise<void> {
    const client = await this.client
    await client.toggleMcpServer?.({ serverName, enabled, settingsLevel: 'user' })
  }

  async authenticateMcpServer(_requestId: RequestId, serverName: string): Promise<void> {
    const client = await this.client
    await client.authenticateMcpServer?.({ serverName })
  }

  async listMcpRegistry(_requestId: RequestId): Promise<LiveSessionMcpRegistryServerInfo[]> {
    await this.client
    const result = protocol.daemon.DaemonListMcpRegistryResultSchema.parse(
      await this.daemonSessionRpc(DAEMON_METHOD.LIST_MCP_REGISTRY, {}),
    )
    return result.servers
  }

  async cancelMcpAuth(_requestId: RequestId, serverName: string): Promise<void> {
    await this.client
    await this.daemonSessionRpc(DAEMON_METHOD.CANCEL_MCP_AUTH, { serverName })
  }

  async clearMcpAuth(_requestId: RequestId, serverName: string): Promise<void> {
    await this.client
    await this.daemonSessionRpc(DAEMON_METHOD.CLEAR_MCP_AUTH, { serverName })
  }

  async submitMcpAuthCode(
    _requestId: RequestId,
    request: LiveSessionMcpAuthCodeRequest,
  ): Promise<void> {
    await this.client
    await this.daemonSessionRpc(DAEMON_METHOD.SUBMIT_MCP_AUTH_CODE, request)
  }

  async toggleMcpTool(
    _requestId: RequestId,
    serverName: string,
    toolName: string,
    enabled: boolean,
  ): Promise<void> {
    await this.client
    await this.daemonSessionRpc(DAEMON_METHOD.TOGGLE_MCP_TOOL, {
      serverName,
      toolName,
      enabled,
    })
  }

  async resolveQueuedUserMessage(
    _requestId: RequestId,
    resolution: LiveSessionQueuedUserMessageResolution,
  ): Promise<void> {
    await this.client
    await this.daemonRpc.request(
      DAEMON_METHOD.RESOLVE_QUEUED_USER_MESSAGE,
      protocol.daemon.DaemonResolveQueuedUserMessageRequestParamsSchema.parse({
        ...resolution,
        sessionId: this.requireSessionId(),
      }),
    )
  }

  async warmupCache(_requestId: RequestId): Promise<void> {
    await this.client
    await this.daemonRpc.request(
      DAEMON_METHOD.WARMUP_CACHE,
      protocol.daemon.DaemonWarmupCacheRequestParamsSchema.parse({
        sessionId: this.requireSessionId(),
      }),
    )
  }

  async killWorkerSession(_requestId: RequestId, workerSessionId: string): Promise<void> {
    await this.client
    await this.daemonSessionRpc(DAEMON_METHOD.KILL_WORKER_SESSION, {
      workerSessionId,
    })
  }

  async submitBugReport(
    _requestId: RequestId,
    request: LiveSessionBugReportRequest,
  ): Promise<LiveSessionBugReportResult> {
    await this.client
    return protocol.daemon.DaemonSubmitBugReportResultSchema.parse(
      await this.daemonSessionRpc(DAEMON_METHOD.SUBMIT_BUG_REPORT, request),
    )
  }

  async getContextStats(_requestId: RequestId): Promise<LiveSessionContextStatsInfo> {
    const client = await this.client
    const breakdown = await client.getContextBreakdown?.()
    const used = breakdown?.usedTokens ?? 0
    const remaining = breakdown?.freeTokens ?? 0
    const limit = breakdown?.contextBudget ?? used + remaining

    return {
      used,
      remaining,
      limit,
      accuracy: 'estimated',
      updatedAt: new Date().toISOString(),
    }
  }

  async updateSessionSettings(
    _requestId: RequestId,
    settings: Partial<LiveSessionSettings>,
  ): Promise<void> {
    const client = await this.client
    await client.updateSessionSettings(settings)
  }

  async resolvePermissionRequest(requestId: RequestId, selectedOption: string): Promise<void> {
    const pending = this.pendingPermissions.get(requestId)

    if (!pending) {
      throw new Error(`No pending permission request found for "${requestId}".`)
    }

    this.pendingPermissions.delete(requestId)
    pending.deferred.resolve(selectedOption)

    await this.emit({
      type: 'permission.resolved',
      sessionId: this.currentSessionId ?? undefined,
      requestId,
      toolUseIds: pending.toolUseIds,
      selectedOption,
    })
  }

  async resolveAskUserRequest(
    requestId: RequestId,
    answers: LiveSessionAskUserAnswerRecord[],
  ): Promise<void> {
    const pending = this.pendingAskUser.get(requestId)

    if (!pending) {
      throw new Error(`No pending ask-user request found for "${requestId}".`)
    }

    this.pendingAskUser.delete(requestId)
    pending.deferred.resolve({
      cancelled: false,
      answers: answers.map((answer) => ({
        index: answer.index,
        question: answer.question,
        answer: answer.answer,
      })),
    })

    await this.emit({
      type: 'askUser.resolved',
      sessionId: this.currentSessionId ?? undefined,
      requestId,
      selectedOption: answers[0]?.answer ?? '',
      answers,
    })
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }

    this.disposed = true
    await this.resolvePendingRequestsOnDispose()

    try {
      const client = await this.client.catch(() => null)
      if (client) {
        if (this.currentSessionId ?? client.sessionId) {
          await withTimeout(
            client.closeSession?.({ reason: 'other' }) ?? Promise.resolve(),
            1_000,
          ).catch(() => undefined)
        }
        await client.close().catch(() => undefined)
      }
      this.daemonRpc.dispose()
      await this.observedTransport.close().catch(() => undefined)
    } finally {
      this.activeStreamStateTracker = null
      this.activeTurnState = null
      this.rewindBoundaryMessageIdByRequestId.clear()
      await this.emit({
        type: 'stream.completed',
        sessionId: this.currentSessionId ?? undefined,
        reason: 'disposed',
      })
    }
  }

  private async connect(): Promise<DaemonClientLike> {
    const credentials = resolveDaemonCredentials(this.authProvider)

    if (!credentials) {
      throw new Error('Daemon authentication credentials are unavailable.')
    }

    const apiKey = credentials.apiKey ?? credentials.token ?? ''
    const { port } = await this.ensureLocalDaemon()
    const url = this.resolveWebSocketUrl({
      apiKey,
      daemonPort: port,
    })

    await this.observedTransport.connect(url)

    const authConnection = new DaemonTransportRpcConnection(this.observedTransport)

    try {
      await this.authenticateConnection(authConnection, credentials)
    } finally {
      authConnection.dispose()
    }

    const client = this.createDaemonClient({
      transport: this.observedTransport,
      apiKey,
    })

    client.onNotification((notification) => {
      void this.handleNotification(notification)
    })
    client.setPermissionHandler((params) => this.handlePermissionRequest(params))
    client.setAskUserHandler((params) => this.handleAskUserRequest(params))

    return client
  }

  private daemonSessionRpc<TResult>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<TResult> {
    return this.daemonRpc.request(method, {
      sessionId: this.requireSessionId(),
      ...params,
    })
  }

  private requireSessionId(): string {
    const sessionId = this.currentSessionId

    if (!sessionId) {
      throw new Error('No active daemon session. Initialize or load a session first.')
    }

    return sessionId
  }

  private captureServerRequestIds(message: object): void {
    if (!isRecord(message) || message.type !== 'request' || typeof message.id !== 'string') {
      return
    }

    if (
      message.method === 'daemon.request_permission' ||
      message.method === 'droid.request_permission'
    ) {
      this.permissionRequestIdQueue.push(message.id)
    }

    if (message.method === 'daemon.ask_user' || message.method === 'droid.ask_user') {
      this.askUserRequestIdQueue.push(message.id)
    }
  }

  private captureClientRequestIds(message: object): void {
    if (!isRecord(message) || message.type !== 'request' || typeof message.id !== 'string') {
      return
    }

    if (
      (message.method !== 'daemon.add_user_message' &&
        message.method !== 'droid.add_user_message') ||
      !isRecord(message.params)
    ) {
      return
    }

    const rewindBoundaryMessageId = toOptionalString(message.params.messageId)

    if (rewindBoundaryMessageId) {
      this.rewindBoundaryMessageIdByRequestId.set(message.id, rewindBoundaryMessageId)
    }
  }

  private async handleNotification(notification: Record<string, unknown>): Promise<void> {
    const payload = extractNotificationPayload(notification)

    if (!payload) {
      return
    }

    const client = await this.client
    const directEvents = mapDroidNotificationPayloadToSessionEvents(
      payload,
      this.currentSessionId ?? client.sessionId ?? undefined,
    )

    if (directEvents) {
      for (const event of directEvents) {
        await this.emit(this.reconcileToolEvent(event))
      }

      return
    }

    const messages = toDroidMessages(convertNotificationToStreamMessage(payload))
    const rewindBoundaryMessageId =
      isRecord(payload) &&
      payload.type === 'create_message' &&
      isRecord(payload.message) &&
      payload.message.role === 'user'
        ? this.consumeRewindBoundaryMessageId(toOptionalString(payload.requestId))
        : undefined

    for (const message of messages) {
      const startedAt = Date.now()
      const streamStateTracker =
        this.activeStreamStateTracker ?? this.createStreamStateTracker({ startedAt })
      this.activeStreamStateTracker = streamStateTracker
      this.activeTurnState ??= createTurnTrackingState({
        hasOutputFormat: false,
        startedAt,
      })
      this.recordTurnTrackingMessage(message)
      const trackedMessages = streamStateTracker.processMessage(message)

      for (const trackedMessage of [trackedMessages.message, ...trackedMessages.additional]) {
        if (!trackedMessage) {
          continue
        }

        if (isTurnCompleteMessage(trackedMessage)) {
          const fallbackResultEvent = this.createFallbackResultEvent()

          if (fallbackResultEvent) {
            await this.emit(fallbackResultEvent)
          }
        }

        const embeddedEvents = extractEmbeddedSessionEventsFromDroidMessage(
          trackedMessage,
          this.currentSessionId ?? client.sessionId ?? undefined,
        )

        for (const event of embeddedEvents) {
          await this.emit(this.reconcileToolEvent(event))
        }

        const event = mapDroidMessageToSessionEvent(
          trackedMessage,
          this.currentSessionId ?? client.sessionId ?? undefined,
          isUserMessageEvent(trackedMessage) ? { rewindBoundaryMessageId } : undefined,
        )

        if (event) {
          await this.emit(this.reconcileToolEvent(event))
        }
      }

      if (
        trackedMessages.additional.some((trackedMessage) => trackedMessage.type === 'result') ||
        trackedMessages.additional.some(isTurnCompleteMessage)
      ) {
        this.activeStreamStateTracker = null
        this.activeTurnState = null
      }
    }
  }

  private createStreamStateTracker(options: {
    startedAt?: number
    hasOutputFormat?: boolean
  }): StreamStateTracker {
    return new StreamStateTracker({
      sessionId: this.currentSessionId ?? undefined,
      ...options,
    })
  }

  private recordTurnTrackingMessage(message: unknown): void {
    const turnState = this.activeTurnState

    if (!turnState || !isRecord(message) || typeof message.type !== 'string') {
      return
    }

    if (message.type === 'assistant_text_delta' && typeof message.text === 'string') {
      turnState.fullText += message.text
      return
    }

    if (message.type === 'assistant' && typeof message.text === 'string') {
      turnState.finalAssistantText = message.text

      if (turnState.fullText.length === 0) {
        turnState.fullText = message.text
      }
      return
    }

    if (message.type === 'token_usage_update') {
      turnState.tokenUsage = {
        inputTokens: toNumberValue(message.inputTokens),
        outputTokens: toNumberValue(message.outputTokens),
        cacheCreationTokens: toNumberValue(message.cacheCreationTokens ?? message.cacheWriteTokens),
        cacheReadTokens: toNumberValue(message.cacheReadTokens),
        thinkingTokens: toNumberValue(message.thinkingTokens),
      }
      return
    }

    if (message.type === 'structured_output') {
      turnState.structuredOutput = message.structuredOutput
      turnState.structuredOutputError = message.structuredOutputError
      return
    }

    if (message.type === 'error') {
      turnState.errors.push(toOptionalString(message.message) ?? 'Unknown stream error')
    }
  }

  private createFallbackResultEvent():
    | import('../protocol/sessionEvents').SessionResultEvent
    | null {
    const turnState = this.activeTurnState

    if (!turnState) {
      return null
    }

    turnState.turnCount += 1

    if (
      turnState.hasOutputFormat &&
      typeof turnState.structuredOutput === 'undefined' &&
      typeof turnState.structuredOutputError === 'undefined'
    ) {
      turnState.structuredOutput = parseJsonObject(
        turnState.finalAssistantText || turnState.fullText,
      )
    }

    const text = turnState.finalAssistantText || turnState.fullText
    const error = turnState.errors[0] ?? null

    return {
      type: 'session.result',
      sessionId: this.currentSessionId ?? undefined,
      success: !error && !turnState.structuredOutputError,
      text,
      durationMs: Date.now() - turnState.startedAt,
      turnCount: turnState.turnCount,
      structuredOutput: turnState.structuredOutput,
      structuredOutputError: turnState.structuredOutputError,
      tokenUsage: turnState.tokenUsage,
      error,
    }
  }

  private consumeRewindBoundaryMessageId(requestId: string | null): string | undefined {
    if (!requestId) {
      return undefined
    }

    const rewindBoundaryMessageId = this.rewindBoundaryMessageIdByRequestId.get(requestId)

    if (!rewindBoundaryMessageId) {
      return undefined
    }

    this.rewindBoundaryMessageIdByRequestId.delete(requestId)
    return rewindBoundaryMessageId
  }

  private async handlePermissionRequest(params: Record<string, unknown>): Promise<string> {
    const requestId =
      this.permissionRequestIdQueue.shift() ?? `permission:${this.pendingPermissions.size + 1}`
    const deferred = createDeferred<string>()
    const toolUseIds = ((params.toolUses as Array<Record<string, unknown>> | undefined) ?? [])
      .map((toolUse) => toolUse.toolUse)
      .filter(isRecord)
      .map((toolUse) => toolUse.id)
      .filter((toolUseId): toolUseId is string => typeof toolUseId === 'string')

    this.pendingPermissions.set(requestId, {
      deferred,
      toolUseIds,
    })
    this.emitPendingRequest(
      createPermissionRequestedEvent(
        requestId,
        params as RequestPermissionRequestParams,
        this.currentSessionId ?? undefined,
      ),
    )

    return deferred.promise
  }

  private async handleAskUserRequest(params: Record<string, unknown>): Promise<AskUserResult> {
    const requestId =
      this.askUserRequestIdQueue.shift() ?? `ask-user:${this.pendingAskUser.size + 1}`
    const deferred = createDeferred<AskUserResult>()
    const questions = extractAskUserQuestions(params.questions)

    this.pendingAskUser.set(requestId, {
      deferred,
      questions,
    })
    this.emitPendingRequest(
      createAskUserRequestedEvent(
        requestId,
        params as AskUserRequestParams,
        this.currentSessionId ?? undefined,
      ),
    )

    return deferred.promise
  }

  private async handleTransportError(error: Error): Promise<void> {
    if (this.disposed) {
      return
    }

    await this.emit({
      type: 'stream.error',
      sessionId: this.currentSessionId ?? undefined,
      error,
      recoverable: true,
    })
  }

  private async emit(event: import('../protocol/sessionEvents').SessionEvent): Promise<void> {
    for (const sink of this.sinks) {
      await sink(event)
    }
  }

  private emitPendingRequest(event: import('../protocol/sessionEvents').SessionEvent): void {
    void this.emit(event).catch((error) => {
      console.error('Failed to emit pending Droid request event', error)
    })
  }

  private reconcileToolEvent(
    event: import('../protocol/sessionEvents').SessionEvent,
  ): import('../protocol/sessionEvents').SessionEvent {
    if (event.type === 'tool.progress') {
      if (event.toolName !== 'Unknown tool') {
        this.toolNamesByUseId.set(event.toolUseId, event.toolName)
        return event
      }

      const cachedToolName = this.toolNamesByUseId.get(event.toolUseId)
      return cachedToolName ? { ...event, toolName: cachedToolName } : event
    }

    if (event.type === 'tool.result') {
      if (event.toolName !== 'Unknown tool') {
        this.toolNamesByUseId.set(event.toolUseId, event.toolName)
        return event
      }

      const cachedToolName = this.toolNamesByUseId.get(event.toolUseId)
      return cachedToolName ? { ...event, toolName: cachedToolName } : event
    }

    return event
  }

  private async resolvePendingRequestsOnDispose(): Promise<void> {
    this.permissionRequestIdQueue.length = 0
    this.askUserRequestIdQueue.length = 0

    for (const [requestId, pending] of this.pendingPermissions) {
      pending.deferred.resolve('cancel')
      this.pendingPermissions.delete(requestId)
    }

    for (const [requestId, pending] of this.pendingAskUser) {
      pending.deferred.resolve({
        cancelled: true,
        answers: [],
      })
      this.pendingAskUser.delete(requestId)
    }
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    resolve,
    reject,
    promise,
  }
}

function extractNotificationPayload(
  notification: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!isRecord(notification.params) || !isRecord(notification.params.notification)) {
    return null
  }

  return notification.params.notification
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toNumberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toDroidMessages(result: ReturnType<typeof convertNotificationToStreamMessage>) {
  if (!result) {
    return []
  }

  return Array.isArray(result) ? result : [result]
}

function createTurnTrackingState({
  startedAt,
  hasOutputFormat,
}: {
  startedAt: number
  hasOutputFormat: boolean
}): TurnTrackingState {
  return {
    startedAt,
    hasOutputFormat,
    fullText: '',
    finalAssistantText: '',
    tokenUsage: null,
    structuredOutput: undefined,
    structuredOutputError: undefined,
    errors: [],
    turnCount: 0,
  }
}

function isTurnCompleteMessage(message: unknown): message is { type: 'turn_complete' } {
  return isRecord(message) && message.type === 'turn_complete'
}

function isUserMessageEvent(message: unknown): boolean {
  return (
    isRecord(message) &&
    ((message.type === 'create_message' && message.role === 'user') || message.type === 'user')
  )
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms.`))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout)
    }
  })
}

function extractAskUserQuestions(value: unknown): LiveSessionAskUserQuestionRecord[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((question) => {
    if (!isRecord(question) || typeof question.question !== 'string') {
      return []
    }

    return [
      {
        index: typeof question.index === 'number' ? question.index : 0,
        topic: typeof question.topic === 'string' ? question.topic : 'Question',
        question: question.question,
        options: Array.isArray(question.options)
          ? question.options.filter((option): option is string => typeof option === 'string')
          : [],
      },
    ]
  })
}

function normalizeInitializeSessionRequest(
  request: string | InitializeSessionRequest,
): InitializeSessionRequest {
  return typeof request === 'string' ? { cwd: request } : request
}
