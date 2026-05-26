import { randomUUID } from 'node:crypto'
import {
  type AskUserRequestParams,
  convertNotificationToStreamMessage,
  type DroidClient,
  type DroidClientTransport,
  type LiveSessionAskUserAnswerRecord,
  type LiveSessionAskUserQuestionRecord,
  ProcessExitError,
  type RequestPermissionRequestParams,
  SDK_TAG,
  StreamStateTracker,
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
  LiveSessionToolInfo,
} from '../../../shared/ipc/contracts'

import type {
  LiveSessionCompactResult,
  LiveSessionExecuteRewindParams,
  LiveSessionExecuteRewindResult,
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
import {
  createDroidSdkSessionFactory,
  type DroidSdkProcessTransportConfig,
  type DroidSdkSessionFactory,
} from './factory'

type Deferred<T> = {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  promise: Promise<T>
}

type AskUserResult = {
  cancelled: boolean
  answers: Array<{
    index: number
    question: string
    answer: string
  }>
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

class ObservedDroidClientTransport implements DroidClientTransport {
  private messageHandler: ((message: JsonRpcMessage) => void) | null = null
  private errorHandler: ((error: Error) => void) | null = null
  private readonly messageObservers = new Set<JsonRpcMessageObserver>()
  private readonly sentMessageObservers = new Set<JsonRpcMessageObserver>()
  private readonly errorObservers = new Set<JsonRpcErrorObserver>()

  constructor(private readonly inner: DroidClientTransport) {
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

  get processId(): number | null {
    const candidate = this.inner as { childProcess?: { pid?: unknown } | null }
    return typeof candidate.childProcess?.pid === 'number' ? candidate.childProcess.pid : null
  }

  async connect(): Promise<void> {
    await this.inner.connect?.()
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

  async close(): Promise<void> {
    await this.inner.close()
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

export class DroidSdkSessionTransport implements StreamJsonRpcProcessTransportLike {
  private readonly client: DroidClient
  private readonly observedTransport: ObservedDroidClientTransport
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
  private readonly toolNamesByUseId = new Map<string, string>()
  private readonly pendingAskUser = new Map<
    string,
    {
      deferred: Deferred<AskUserResult>
      questions: LiveSessionAskUserQuestionRecord[]
    }
  >()
  private readonly ready: Promise<void>

  private currentSessionId: string | null
  private activeStreamStateTracker: StreamStateTracker | null = null
  private activeTurnState: TurnTrackingState | null = null
  private disposed = false
  private _processId = 0

  constructor(
    config: DroidSdkProcessTransportConfig,
    sessionFactory: DroidSdkSessionFactory = createDroidSdkSessionFactory(),
  ) {
    this.currentSessionId = config.sessionId ?? null
    this.observedTransport = new ObservedDroidClientTransport(
      sessionFactory.createTransport(config),
    )
    this.client = sessionFactory.createClient(this.observedTransport)
    this.ready = this.connectTransport()

    this.observedTransport.observeMessages((message) => {
      this.captureServerRequestIds(message)
    })
    this.observedTransport.observeSentMessages((message) => {
      this.captureClientRequestIds(message)
    })
    this.observedTransport.observeErrors((error) => {
      void this.handleTransportError(error)
    })

    this.client.onNotification((notification) => {
      void this.handleNotification(notification)
    })
    this.client.setPermissionHandler((params) => this.handlePermissionRequest(params))
    this.client.setAskUserHandler((params) => this.handleAskUserRequest(params))
  }

  get processId(): number {
    return this._processId
  }

  subscribe(sink: SessionEventSink): () => void {
    this.sinks.add(sink)

    return () => {
      this.sinks.delete(sink)
    }
  }

  async initializeSession(
    _requestId: RequestId,
    cwd: string,
  ): Promise<StreamJsonRpcInitializeResult> {
    await this.ready

    const result = await this.client.initializeSession({
      machineId: 'oxox-electron',
      cwd,
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
    await this.ready

    const result = await this.client.loadSession({
      sessionId,
    })

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
    await this.ready
    await this.client.interruptSession()
  }

  async addUserMessage(
    _requestId: RequestId,
    message: string | LiveSessionAddUserMessageRequest,
  ): Promise<void> {
    await this.ready
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
    await this.client.addUserMessage({
      ...normalizedMessage,
      messageId: randomUUID(),
    })
  }

  async forkSession(_requestId: RequestId): Promise<{ newSessionId: string }> {
    await this.ready
    return this.client.forkSession()
  }

  async getRewindInfo(_requestId: RequestId, messageId: string): Promise<LiveSessionRewindInfo> {
    await this.ready
    return this.client.getRewindInfo({ messageId })
  }

  async executeRewind(
    _requestId: RequestId,
    params: LiveSessionExecuteRewindParams,
  ): Promise<Omit<LiveSessionExecuteRewindResult, 'snapshot'>> {
    await this.ready
    return this.client.executeRewind({
      messageId: params.messageId,
      filesToRestore: params.filesToRestore,
      filesToDelete: params.filesToDelete,
      forkTitle: params.forkTitle,
    })
  }

  async compactSession(
    _requestId: RequestId,
    customInstructions?: string,
  ): Promise<Omit<LiveSessionCompactResult, 'snapshot'>> {
    await this.ready
    return this.client.compactSession(customInstructions ? { customInstructions } : {})
  }

  async renameSession(_requestId: RequestId, title: string): Promise<void> {
    await this.ready
    await this.client.renameSession({ title })
  }

  async listTools(_requestId: RequestId): Promise<LiveSessionToolInfo[]> {
    await this.ready
    const result = await this.client.listTools()
    return result.tools
  }

  async listSkills(_requestId: RequestId): Promise<LiveSessionSkillInfo[]> {
    await this.ready
    const result = await this.client.listSkills()
    return result.skills
  }

  async listMcpServers(_requestId: RequestId): Promise<LiveSessionMcpServerInfo[]> {
    await this.ready
    const result = await this.client.listMcpServers()
    return result.servers
  }

  async listMcpTools(_requestId: RequestId): Promise<LiveSessionMcpToolInfo[]> {
    await this.ready
    const result = await this.client.listMcpTools()
    return result.tools
  }

  async listMcpRegistry(_requestId: RequestId): Promise<LiveSessionMcpRegistryServerInfo[]> {
    await this.ready
    const result = await this.client.listMcpRegistry()
    return result.servers
  }

  async addMcpServer(_requestId: RequestId, config: LiveSessionMcpServerConfig): Promise<void> {
    await this.ready
    await this.client.addMcpServer(config)
  }

  async removeMcpServer(_requestId: RequestId, serverName: string): Promise<void> {
    await this.ready
    await this.client.removeMcpServer({ serverName, settingsLevel: 'user' })
  }

  async toggleMcpServer(
    _requestId: RequestId,
    serverName: string,
    enabled: boolean,
  ): Promise<void> {
    await this.ready
    await this.client.toggleMcpServer({ serverName, enabled, settingsLevel: 'user' })
  }

  async authenticateMcpServer(_requestId: RequestId, serverName: string): Promise<void> {
    await this.ready
    await this.client.authenticateMcpServer({ serverName })
  }

  async cancelMcpAuth(_requestId: RequestId, serverName: string): Promise<void> {
    await this.ready
    await this.client.cancelMcpAuth({ serverName })
  }

  async clearMcpAuth(_requestId: RequestId, serverName: string): Promise<void> {
    await this.ready
    await this.client.clearMcpAuth({ serverName })
  }

  async submitMcpAuthCode(
    _requestId: RequestId,
    request: LiveSessionMcpAuthCodeRequest,
  ): Promise<void> {
    await this.ready
    await this.client.submitMcpAuthCode(request)
  }

  async toggleMcpTool(
    _requestId: RequestId,
    serverName: string,
    toolName: string,
    enabled: boolean,
  ): Promise<void> {
    await this.ready
    await this.client.toggleMcpTool({ serverName, toolName, enabled })
  }

  async killWorkerSession(_requestId: RequestId, workerSessionId: string): Promise<void> {
    await this.ready
    await this.client.killWorkerSession({ workerSessionId })
  }

  async submitBugReport(
    _requestId: RequestId,
    request: LiveSessionBugReportRequest,
  ): Promise<LiveSessionBugReportResult> {
    await this.ready
    return this.client.submitBugReport(request)
  }

  async getContextStats(_requestId: RequestId): Promise<LiveSessionContextStatsInfo> {
    await this.ready
    return this.client.getContextStats()
  }

  async updateSessionSettings(
    _requestId: RequestId,
    settings: Partial<LiveSessionSettings>,
  ): Promise<void> {
    await this.ready
    await this.client.updateSessionSettings(settings)
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
      await this.ready.catch(() => undefined)
      const closeSession = (
        this.client as {
          closeSession?: (params: { reason: string }) => Promise<unknown>
        }
      ).closeSession

      if ((this.currentSessionId ?? this.client.sessionId) && typeof closeSession === 'function') {
        await closeSession.call(this.client, { reason: 'other' }).catch(() => undefined)
      }
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

  private async connectTransport(): Promise<void> {
    await this.observedTransport.connect()
    this._processId = this.observedTransport.processId ?? 0
  }

  private captureServerRequestIds(message: object): void {
    if (!isRecord(message) || message.type !== 'request' || typeof message.id !== 'string') {
      return
    }

    if (message.method === 'droid.request_permission' && isRecord(message.params)) {
      this.permissionRequestIdQueue.push(message.id)
    }

    if (message.method === 'droid.ask_user' && isRecord(message.params)) {
      this.askUserRequestIdQueue.push(message.id)
    }
  }

  private captureClientRequestIds(message: object): void {
    if (!isRecord(message) || message.type !== 'request' || typeof message.id !== 'string') {
      return
    }

    if (message.method !== 'droid.add_user_message' || !isRecord(message.params)) {
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

    const directEvents = mapDroidNotificationPayloadToSessionEvents(
      payload,
      this.currentSessionId ?? this.client.sessionId ?? undefined,
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
          this.currentSessionId ?? this.client.sessionId ?? undefined,
        )

        for (const event of embeddedEvents) {
          await this.emit(this.reconcileToolEvent(event))
        }

        const event = mapDroidMessageToSessionEvent(
          trackedMessage,
          this.currentSessionId ?? this.client.sessionId ?? undefined,
          isUserMessageEvent(trackedMessage) ? { rewindBoundaryMessageId } : undefined,
        )

        if (event) {
          await this.emit(this.reconcileToolEvent(event))
        }
      }

      if (trackedMessages.additional.some((trackedMessage) => trackedMessage.type === 'result')) {
        this.activeStreamStateTracker = null
        this.activeTurnState = null
      }

      if (trackedMessages.additional.some(isTurnCompleteMessage)) {
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
      sessionId: this.currentSessionId ?? this.client.sessionId ?? undefined,
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
      sessionId: this.currentSessionId ?? this.client.sessionId ?? undefined,
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
    await this.emit(
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
    await this.emit(
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

    if (error instanceof ProcessExitError && error.exitCode === 0) {
      await this.emit({
        type: 'stream.completed',
        sessionId: this.currentSessionId ?? undefined,
        reason: 'completed',
      })
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
