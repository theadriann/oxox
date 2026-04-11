import type {
  LiveSessionAskUserAnswerRecord,
  LiveSessionCompactResult,
  LiveSessionExecuteRewindResult,
  LiveSessionRewindInfo,
} from '../../../shared/ipc/contracts'
import { DroidSdkSessionTransport } from '../droidSdk/transport'
import type { SessionEvent } from '../protocol/sessionEvents'
import { applyEventToSession } from './eventApplier'
import { extractHistoryEvents, normalizeMessages, resolveSessionTitle } from './messageNormalizer'
import {
  defaultIsDroidProcess,
  defaultIsProcessAlive,
  reconcilePersistedRuntimeStates,
} from './processLifecycle'
import { createSessionDerivationManager } from './sessionDerivationManager'
import { createSessionReconnectHandler } from './sessionReconnectHandler'
import { createSessionRequestResolver } from './sessionRequestResolver'
import { requireManagedTransport } from './sessionState'
import { createSessionStateTracker } from './sessionStateTracker'
import {
  cloneAvailableModels,
  cloneSessionSettings,
  filterDefinedSettings,
  mergeMessages,
  normalizeAvailableModels,
  normalizeSessionSettings,
} from './snapshotConverter'
import type {
  AttachSessionRequest,
  CompactSessionRequest,
  CreateSessionProcessManagerOptions,
  CreateSessionRequest,
  ExecuteRewindRequest,
  ForkSessionRequest,
  LiveSessionMessage,
  LiveSessionModel,
  LiveSessionNotificationSummary,
  LiveSessionSettings,
  LiveSessionSnapshot,
  ManagedSession,
  SessionEventSink,
  StreamJsonRpcLoadResult,
  StreamJsonRpcProcessTransportLike,
} from './types'

export type {
  AttachSessionRequest,
  CreateSessionProcessManagerOptions,
  CreateSessionRequest,
  ForkSessionRequest,
  LiveSessionMessage,
  LiveSessionModel,
  LiveSessionSettings,
  LiveSessionSnapshot,
  SessionChildProcess,
  SpawnProcessRequest,
} from './types'

export function createSessionProcessManager(options: CreateSessionProcessManagerOptions) {
  const now = options.now ?? (() => new Date().toISOString())
  const reconnectDelayMs = options.reconnectDelayMs ?? 250
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive
  const isDroidProcess = options.isDroidProcess ?? defaultIsDroidProcess
  const tracker = createSessionStateTracker({
    database: options.database,
    now,
  })
  const nextRequestId = tracker.nextRequestId
  const persistManagedSession = tracker.persist
  const emitToSubscribers = tracker.emitToSubscribers

  const requireTrackedSession = (sessionId: string): ManagedSession => {
    const session = tracker.get(sessionId)

    if (!session) {
      throw new Error(`Session "${sessionId}" is not being managed.`)
    }

    return session
  }

  const bindTransport = (
    session: ManagedSession,
    transport: StreamJsonRpcProcessTransportLike,
  ): void => {
    session.transport = transport
    session.processId = transport.processId

    transport.subscribe((event) => {
      applyEventToSession(session, event, now())
      persistManagedSession(session)
      emitToSubscribers(session, event)

      if (event.type === 'stream.error' && event.recoverable && session.viewerIds.size > 0) {
        void reconnectHandler.reconnect(session)
      }
    })
  }

  const hydrateManagedSession = (
    session: ManagedSession,
    result: StreamJsonRpcLoadResult,
    viewerId?: string,
  ): void => {
    const hadExistingTranscript = session.messages.length > 0 || session.events.length > 0
    session.cwd = result.cwd ?? session.cwd
    session.messages = mergeMessages(session.messages, normalizeMessages(result.session.messages))
    session.title = resolveSessionTitle(result.session, session.messages, session.title)
    if (session.events.length === 0) {
      session.events = extractHistoryEvents(result.session.messages)
    }
    session.settings = normalizeSessionSettings(result.settings, result.availableModels)
    session.availableModels = normalizeAvailableModels(result.availableModels, result.settings)

    if (viewerId) {
      session.viewerIds.add(viewerId)
    }

    session.updatedAt = now()
    session.workingStatus = result.isAgentLoopInProgress ? 'active' : 'idle'

    if (hadExistingTranscript) {
      session.transcriptRevision += 1
    }
  }

  const createTransport = (sessionId: string | null, cwd: string | null) =>
    new DroidSdkSessionTransport(
      {
        cwd: cwd ?? undefined,
        droidPath: options.droidPath,
        sessionId,
      },
      options.droidSdkSessionFactory,
    )

  const createManagedSession = (
    sessionId: string,
    transport: StreamJsonRpcProcessTransportLike,
    cwd: string | null,
    title: string,
    messages: LiveSessionMessage[],
    events: SessionEvent[],
    settings: LiveSessionSettings,
    availableModels: LiveSessionModel[],
    viewerId: string | undefined,
    parentSessionId: string | null,
  ): ManagedSession => {
    const timestamp = now()
    const managedSession: ManagedSession = {
      sessionId,
      title,
      cwd,
      createdAt: timestamp,
      updatedAt: timestamp,
      parentSessionId,
      processId: transport.processId,
      transport,
      messages: [...messages],
      events: [...events],
      availableModels: cloneAvailableModels(availableModels),
      settings: cloneSessionSettings(settings),
      transcriptRevision: 0,
      viewerIds: viewerId ? new Set([viewerId]) : new Set(),
      subscribers: new Set(),
      reconnectPromise: null,
      workingStatus: 'active',
      lastEventAt: timestamp,
    }

    bindTransport(managedSession, transport)
    tracker.set(managedSession)
    persistManagedSession(managedSession)

    if (parentSessionId) {
      options.database.linkSessionParent(sessionId, parentSessionId, 'fork', timestamp)
    }

    return managedSession
  }

  const reconnectHandler = createSessionReconnectHandler({
    reconnectDelayMs,
    now,
    createTransport,
    hydrateManagedSession,
    bindTransport,
    persistManagedSession,
    nextRequestId,
  })

  const derivationManager = createSessionDerivationManager({
    now,
    nextRequestId,
    createTransport,
    hydrateManagedSession,
    bindTransport,
    persistManagedSession,
    createManagedSession,
  })

  const requestResolver = createSessionRequestResolver({
    getSession: requireTrackedSession,
  })

  const ensureLoadedSession = async (sessionId: string): Promise<ManagedSession> => {
    const existing = tracker.get(sessionId)

    if (existing?.transport) {
      return existing
    }

    const persistedSession = options.database.getSession(sessionId)
    const cwd = persistedSession?.projectWorkspacePath ?? null
    const transport = createTransport(sessionId, cwd)
    const result = await transport.loadSession(nextRequestId('session:load'), sessionId)

    if (existing) {
      hydrateManagedSession(existing, result)
      bindTransport(existing, transport)
      persistManagedSession(existing)
      return existing
    }

    const messages = normalizeMessages(result.session.messages)
    const managedSession = createManagedSession(
      sessionId,
      transport,
      result.cwd ?? cwd,
      resolveSessionTitle(result.session, messages),
      messages,
      extractHistoryEvents(result.session.messages),
      normalizeSessionSettings(result.settings, result.availableModels),
      normalizeAvailableModels(result.availableModels, result.settings),
      undefined,
      null,
    )
    managedSession.workingStatus = result.isAgentLoopInProgress ? 'active' : 'idle'
    managedSession.updatedAt = now()
    persistManagedSession(managedSession)
    return managedSession
  }

  reconcilePersistedRuntimeStates(options.database.listSessionRuntimes(), {
    database: options.database,
    isDroidProcess,
    isProcessAlive,
    now,
  })

  return {
    async createSession(request: CreateSessionRequest): Promise<LiveSessionSnapshot> {
      const transport = createTransport(null, request.cwd)
      const result = await transport.initializeSession(nextRequestId('session:create'), request.cwd)
      const messages = normalizeMessages(result.session.messages)
      const managedSession = createManagedSession(
        result.sessionId,
        transport,
        request.cwd,
        resolveSessionTitle(result.session, messages),
        messages,
        extractHistoryEvents(result.session.messages),
        normalizeSessionSettings(result.settings, result.availableModels),
        normalizeAvailableModels(result.availableModels, result.settings),
        request.viewerId,
        null,
      )

      return tracker.toSnapshot(managedSession)
    },

    async attachSession(
      sessionId: string,
      request: AttachSessionRequest = {},
    ): Promise<LiveSessionSnapshot> {
      const existing = tracker.get(sessionId)

      if (existing?.transport) {
        if (request.viewerId) {
          existing.viewerIds.add(request.viewerId)
        }
        existing.updatedAt = now()
        persistManagedSession(existing)
        return tracker.toSnapshot(existing)
      }

      const persistedSession = options.database.getSession(sessionId)
      const cwd = persistedSession?.projectWorkspacePath ?? null
      const transport = createTransport(sessionId, cwd)
      const result = await transport.loadSession(nextRequestId('session:attach'), sessionId)

      if (existing) {
        hydrateManagedSession(existing, result, request.viewerId)
        bindTransport(existing, transport)
        persistManagedSession(existing)
        return tracker.toSnapshot(existing)
      }

      const messages = normalizeMessages(result.session.messages)
      const managedSession = createManagedSession(
        sessionId,
        transport,
        result.cwd ?? cwd,
        resolveSessionTitle(result.session, messages),
        messages,
        extractHistoryEvents(result.session.messages),
        normalizeSessionSettings(result.settings, result.availableModels),
        normalizeAvailableModels(result.availableModels, result.settings),
        request.viewerId,
        null,
      )
      managedSession.workingStatus = result.isAgentLoopInProgress ? 'active' : 'idle'
      managedSession.updatedAt = now()
      persistManagedSession(managedSession)

      return tracker.toSnapshot(managedSession)
    },

    async detachSession(sessionId: string, viewerId?: string): Promise<LiveSessionSnapshot> {
      const session = requireTrackedSession(sessionId)

      if (viewerId) {
        session.viewerIds.delete(viewerId)
      } else {
        session.viewerIds.clear()
      }

      session.updatedAt = now()
      persistManagedSession(session)
      return tracker.toSnapshot(session)
    },

    async interruptSession(sessionId: string): Promise<void> {
      const session = requireTrackedSession(sessionId)
      await requireManagedTransport(session).interruptSession(nextRequestId('session:interrupt'))
    },

    async addUserMessage(sessionId: string, text: string): Promise<void> {
      const session = requireTrackedSession(sessionId)
      await requireManagedTransport(session).addUserMessage(nextRequestId('session:message'), text)
    },

    async renameSession(sessionId: string, title: string): Promise<void> {
      const session = tracker.get(sessionId)

      if (!session) {
        return
      }

      session.title = title
      session.updatedAt = now()
      persistManagedSession(session)
    },

    async updateSessionSettings(
      sessionId: string,
      settings: Partial<LiveSessionSettings>,
    ): Promise<void> {
      const session = requireTrackedSession(sessionId)
      const nextSettings = filterDefinedSettings(settings)

      if (Object.keys(nextSettings).length === 0) {
        return
      }

      await requireManagedTransport(session).updateSessionSettings(
        nextRequestId('session:settings'),
        nextSettings,
      )
      session.settings = {
        ...session.settings,
        ...nextSettings,
      }
      session.availableModels = normalizeAvailableModels(session.availableModels, session.settings)
      session.updatedAt = now()
      persistManagedSession(session)
    },

    async resolvePermissionRequest(
      sessionId: string,
      requestId: string,
      selectedOption: string,
    ): Promise<void> {
      await requestResolver.resolvePermissionRequest(sessionId, requestId, selectedOption)
    },

    async resolveAskUserRequest(
      sessionId: string,
      requestId: string,
      answers: LiveSessionAskUserAnswerRecord[],
    ): Promise<void> {
      await requestResolver.resolveAskUserRequest(sessionId, requestId, answers)
    },

    async forkSession(
      sessionId: string,
      request: ForkSessionRequest = {},
    ): Promise<LiveSessionSnapshot> {
      const parentSession = await ensureLoadedSession(sessionId)
      return derivationManager.fork(parentSession, request)
    },

    async getRewindInfo(sessionId: string, messageId: string): Promise<LiveSessionRewindInfo> {
      const session = await ensureLoadedSession(sessionId)
      return requireManagedTransport(session).getRewindInfo(
        nextRequestId('session:rewind:info'),
        messageId,
      )
    },

    async executeRewind(
      sessionId: string,
      request: ExecuteRewindRequest,
    ): Promise<LiveSessionExecuteRewindResult> {
      const parentSession = await ensureLoadedSession(sessionId)
      return derivationManager.executeRewind(parentSession, request)
    },

    async compactSession(
      sessionId: string,
      request: CompactSessionRequest = {},
    ): Promise<LiveSessionCompactResult> {
      const parentSession = requireTrackedSession(sessionId)
      return derivationManager.compact(parentSession, request)
    },

    getSessionSnapshot(sessionId: string): LiveSessionSnapshot | null {
      const session = tracker.get(sessionId)
      return session ? tracker.toSnapshot(session) : null
    },

    listSessionSnapshots(): LiveSessionSnapshot[] {
      return tracker.listSnapshots()
    },

    listSessionNotificationSummaries(): LiveSessionNotificationSummary[] {
      return tracker.listNotificationSummaries()
    },

    subscribe(sessionId: string, sink: SessionEventSink): () => void {
      return tracker.subscribe(sessionId, sink)
    },

    async dispose(): Promise<void> {
      const sessionsToDispose: ManagedSession[] = []
      tracker.forEach((session) => {
        sessionsToDispose.push(session)
      })

      for (const session of sessionsToDispose) {
        session.viewerIds.clear()
        session.updatedAt = now()
        if (session.transport) {
          await session.transport.dispose()
        }
        options.database.clearSessionRuntime(session.sessionId)
      }

      tracker.clearAll()
    },
  }
}
