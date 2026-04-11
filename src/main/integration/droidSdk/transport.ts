import {
  type AskUserRequestParams,
  convertNotificationToStreamMessage,
  type DroidClient,
  type DroidClientTransport,
  type LiveSessionAskUserAnswerRecord,
  type LiveSessionAskUserQuestionRecord,
  ProcessExitError,
  type RequestPermissionRequestParams,
} from '@factory/droid-sdk'

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

type JsonRpcMessageObserver = (message: object) => void
type JsonRpcErrorObserver = (error: Error) => void

class ObservedDroidClientTransport implements DroidClientTransport {
  private messageHandler: ((message: object) => void) | null = null
  private errorHandler: ((error: Error) => void) | null = null
  private readonly messageObservers = new Set<JsonRpcMessageObserver>()
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

  send(message: object): void {
    this.inner.send(message)
  }

  onMessage(callback: (message: object) => void): void {
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
  private readonly permissionRequestIds = new WeakMap<object, string>()
  private readonly askUserRequestIds = new WeakMap<object, string>()
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

  async addUserMessage(_requestId: RequestId, text: string): Promise<void> {
    await this.ready
    await this.client.addUserMessage({ text })
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
      await this.observedTransport.close().catch(() => undefined)
    } finally {
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
      this.permissionRequestIds.set(message.params, message.id)
    }

    if (message.method === 'droid.ask_user' && isRecord(message.params)) {
      this.askUserRequestIds.set(message.params, message.id)
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
        await this.emit(event)
      }

      return
    }

    const messages = toDroidMessages(convertNotificationToStreamMessage(payload))

    for (const message of messages) {
      const embeddedEvents = extractEmbeddedSessionEventsFromDroidMessage(
        message,
        this.currentSessionId ?? this.client.sessionId ?? undefined,
      )

      for (const event of embeddedEvents) {
        await this.emit(this.reconcileToolEvent(event))
      }

      const event = mapDroidMessageToSessionEvent(
        message,
        this.currentSessionId ?? this.client.sessionId ?? undefined,
      )

      if (event) {
        await this.emit(this.reconcileToolEvent(event))
      }
    }
  }

  private async handlePermissionRequest(params: Record<string, unknown>): Promise<string> {
    const requestId =
      this.permissionRequestIds.get(params) ?? `permission:${this.pendingPermissions.size + 1}`
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
      this.askUserRequestIds.get(params) ?? `ask-user:${this.pendingAskUser.size + 1}`
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

function toDroidMessages(result: ReturnType<typeof convertNotificationToStreamMessage>) {
  if (!result) {
    return []
  }

  return Array.isArray(result) ? result : [result]
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
