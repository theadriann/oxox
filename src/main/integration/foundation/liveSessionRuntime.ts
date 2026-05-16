import type {
  LiveSessionAddUserMessageRequest,
  LiveSessionAskUserAnswerRecord,
  LiveSessionBugReportRequest,
  LiveSessionBugReportResult,
  LiveSessionCompactResult,
  LiveSessionContextStatsInfo,
  LiveSessionEventRecord,
  LiveSessionExecuteRewindParams,
  LiveSessionExecuteRewindResult,
  LiveSessionMcpAuthCodeRequest,
  LiveSessionMcpRegistryServerInfo,
  LiveSessionMcpServerConfig,
  LiveSessionMcpServerInfo,
  LiveSessionMcpToolInfo,
  LiveSessionNotificationSummary,
  LiveSessionRewindInfo,
  LiveSessionSettings,
  LiveSessionSkillInfo,
  LiveSessionSnapshot,
  LiveSessionToolInfo,
} from '../../../shared/ipc/contracts'
import type { SessionEvent } from '../protocol/sessionEvents'
import type {
  LiveSessionSettings as RuntimeLiveSessionSettings,
  LiveSessionSnapshot as RuntimeLiveSessionSnapshot,
} from '../sessions/types'

interface SessionProcessManagerLike {
  createSession: (request: {
    cwd: string
    viewerId?: string
  }) => Promise<RuntimeLiveSessionSnapshot>
  getSessionSnapshot: (sessionId: string) => RuntimeLiveSessionSnapshot | null
  listSessionSnapshots: () => RuntimeLiveSessionSnapshot[]
  listSessionNotificationSummaries?: () => LiveSessionNotificationSummary[]
  subscribe: (sessionId: string, sink: (event: unknown) => void) => () => void
  attachSession: (
    sessionId: string,
    request?: {
      viewerId?: string
    },
  ) => Promise<RuntimeLiveSessionSnapshot>
  detachSession: (sessionId: string, viewerId?: string) => Promise<RuntimeLiveSessionSnapshot>
  addUserMessage: (
    sessionId: string,
    message: string | LiveSessionAddUserMessageRequest,
  ) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  listSessionTools: (sessionId: string) => Promise<LiveSessionToolInfo[]>
  listSessionSkills: (sessionId: string) => Promise<LiveSessionSkillInfo[]>
  listSessionMcpServers: (sessionId: string) => Promise<LiveSessionMcpServerInfo[]>
  listSessionMcpTools: (sessionId: string) => Promise<LiveSessionMcpToolInfo[]>
  listSessionMcpRegistry: (sessionId: string) => Promise<LiveSessionMcpRegistryServerInfo[]>
  addMcpServer: (sessionId: string, config: LiveSessionMcpServerConfig) => Promise<void>
  removeMcpServer: (sessionId: string, serverName: string) => Promise<void>
  toggleMcpServer: (sessionId: string, serverName: string, enabled: boolean) => Promise<void>
  authenticateMcpServer: (sessionId: string, serverName: string) => Promise<void>
  cancelMcpAuth: (sessionId: string, serverName: string) => Promise<void>
  clearMcpAuth: (sessionId: string, serverName: string) => Promise<void>
  submitMcpAuthCode: (sessionId: string, request: LiveSessionMcpAuthCodeRequest) => Promise<void>
  toggleMcpTool: (
    sessionId: string,
    serverName: string,
    toolName: string,
    enabled: boolean,
  ) => Promise<void>
  killWorkerSession: (sessionId: string, workerSessionId: string) => Promise<void>
  submitBugReport: (
    sessionId: string,
    request: LiveSessionBugReportRequest,
  ) => Promise<LiveSessionBugReportResult>
  getSessionContextStats?: (sessionId: string) => Promise<LiveSessionContextStatsInfo | null>
  updateSessionSettings: (
    sessionId: string,
    settings: Partial<RuntimeLiveSessionSettings>,
  ) => Promise<void>
  resolvePermissionRequest: (
    sessionId: string,
    requestId: string,
    selectedOption: string,
  ) => Promise<void>
  resolveAskUserRequest: (
    sessionId: string,
    requestId: string,
    answers: LiveSessionAskUserAnswerRecord[],
  ) => Promise<void>
  getRewindInfo: (sessionId: string, messageId: string) => Promise<LiveSessionRewindInfo>
  executeRewind: (
    sessionId: string,
    request: LiveSessionExecuteRewindParams & {
      viewerId?: string
    },
  ) => Promise<LiveSessionExecuteRewindResult>
  compactSession: (
    sessionId: string,
    request?: {
      customInstructions?: string
      viewerId?: string
    },
  ) => Promise<LiveSessionCompactResult>
  forkSession: (
    sessionId: string,
    request?: {
      viewerId?: string
    },
  ) => Promise<RuntimeLiveSessionSnapshot>
  interruptSession: (sessionId: string) => Promise<void>
  dispose: () => Promise<void>
}

export interface CreateFoundationLiveSessionRuntimeOptions {
  sessionProcessManager: SessionProcessManagerLike
  onChange?: () => void
}

export interface FoundationLiveSessionRuntime {
  createSession: (cwd: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  getSessionSnapshot: (sessionId: string) => LiveSessionSnapshot | null
  listLiveSessionSnapshots: () => LiveSessionSnapshot[]
  listLiveSessionNotificationSummaries: () => LiveSessionNotificationSummary[]
  attachSession: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  detachSession: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  addUserMessage: (
    sessionId: string,
    message: string | LiveSessionAddUserMessageRequest,
  ) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  listSessionTools: (sessionId: string) => Promise<LiveSessionToolInfo[]>
  listSessionSkills: (sessionId: string) => Promise<LiveSessionSkillInfo[]>
  listSessionMcpServers: (sessionId: string) => Promise<LiveSessionMcpServerInfo[]>
  listSessionMcpTools: (sessionId: string) => Promise<LiveSessionMcpToolInfo[]>
  listSessionMcpRegistry: (sessionId: string) => Promise<LiveSessionMcpRegistryServerInfo[]>
  addMcpServer: (sessionId: string, config: LiveSessionMcpServerConfig) => Promise<void>
  removeMcpServer: (sessionId: string, serverName: string) => Promise<void>
  toggleMcpServer: (sessionId: string, serverName: string, enabled: boolean) => Promise<void>
  authenticateMcpServer: (sessionId: string, serverName: string) => Promise<void>
  cancelMcpAuth: (sessionId: string, serverName: string) => Promise<void>
  clearMcpAuth: (sessionId: string, serverName: string) => Promise<void>
  submitMcpAuthCode: (sessionId: string, request: LiveSessionMcpAuthCodeRequest) => Promise<void>
  toggleMcpTool: (
    sessionId: string,
    serverName: string,
    toolName: string,
    enabled: boolean,
  ) => Promise<void>
  killWorkerSession: (sessionId: string, workerSessionId: string) => Promise<void>
  submitBugReport: (
    sessionId: string,
    request: LiveSessionBugReportRequest,
  ) => Promise<LiveSessionBugReportResult>
  getSessionContextStats: (sessionId: string) => Promise<LiveSessionContextStatsInfo | null>
  updateSessionSettings: (
    sessionId: string,
    settings: Partial<LiveSessionSettings>,
  ) => Promise<void>
  resolvePermissionRequest: (
    sessionId: string,
    requestId: string,
    selectedOption: string,
  ) => Promise<void>
  resolveAskUserRequest: (
    sessionId: string,
    requestId: string,
    answers: LiveSessionAskUserAnswerRecord[],
  ) => Promise<void>
  getRewindInfo: (sessionId: string, messageId: string) => Promise<LiveSessionRewindInfo>
  executeRewind: (
    sessionId: string,
    params: LiveSessionExecuteRewindParams,
    viewerId?: string,
  ) => Promise<LiveSessionExecuteRewindResult>
  compactSession: (
    sessionId: string,
    customInstructions?: string,
    viewerId?: string,
  ) => Promise<LiveSessionCompactResult>
  forkSession: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  interruptSession: (sessionId: string) => Promise<void>
  subscribeToSnapshots: (listener: (sessionId: string) => void) => () => void
  dispose: () => Promise<void>
}

export function createFoundationLiveSessionRuntime({
  onChange,
  sessionProcessManager,
}: CreateFoundationLiveSessionRuntimeOptions): FoundationLiveSessionRuntime {
  const snapshotListeners = new Set<(sessionId: string) => void>()
  const sessionEventUnsubscribers = new Map<string, () => void>()

  const emitSnapshot = (sessionId: string): void => {
    const snapshot = sessionProcessManager.getSessionSnapshot(sessionId)

    if (!snapshot) {
      return
    }

    ensureSessionSubscription(snapshot.sessionId)

    for (const listener of snapshotListeners) {
      listener(sessionId)
    }
  }

  const ensureSessionSubscription = (sessionId: string): void => {
    if (sessionEventUnsubscribers.has(sessionId)) {
      return
    }

    const unsubscribe = sessionProcessManager.subscribe(sessionId, () => {
      emitSnapshot(sessionId)
    })
    sessionEventUnsubscribers.set(sessionId, unsubscribe)
  }

  return {
    createSession: async (cwd, viewerId) => {
      const snapshot = await sessionProcessManager.createSession({ cwd, viewerId })
      ensureSessionSubscription(snapshot.sessionId)
      emitSnapshot(snapshot.sessionId)
      onChange?.()
      return serializeLiveSessionSnapshot(snapshot)
    },
    getSessionSnapshot: (sessionId) => {
      const snapshot = sessionProcessManager.getSessionSnapshot(sessionId)
      return snapshot ? serializeLiveSessionSnapshot(snapshot) : null
    },
    listLiveSessionSnapshots: () =>
      sessionProcessManager.listSessionSnapshots().map(serializeLiveSessionSnapshot),
    listLiveSessionNotificationSummaries: () =>
      sessionProcessManager.listSessionNotificationSummaries?.() ?? [],
    attachSession: async (sessionId, viewerId) => {
      const snapshot = await sessionProcessManager.attachSession(sessionId, { viewerId })
      ensureSessionSubscription(snapshot.sessionId)
      emitSnapshot(snapshot.sessionId)
      onChange?.()
      return serializeLiveSessionSnapshot(snapshot)
    },
    detachSession: async (sessionId, viewerId) => {
      const snapshot = await sessionProcessManager.detachSession(sessionId, viewerId)
      emitSnapshot(snapshot.sessionId)
      onChange?.()
      return serializeLiveSessionSnapshot(snapshot)
    },
    addUserMessage: async (sessionId, text) => {
      await sessionProcessManager.addUserMessage(sessionId, text)
      emitSnapshot(sessionId)
      onChange?.()
    },
    renameSession: async (sessionId, title) => {
      await sessionProcessManager.renameSession(sessionId, title)
      emitSnapshot(sessionId)
      onChange?.()
    },
    listSessionTools: (sessionId) => sessionProcessManager.listSessionTools(sessionId),
    listSessionSkills: (sessionId) => sessionProcessManager.listSessionSkills(sessionId),
    listSessionMcpServers: (sessionId) => sessionProcessManager.listSessionMcpServers(sessionId),
    listSessionMcpTools: (sessionId) => sessionProcessManager.listSessionMcpTools(sessionId),
    listSessionMcpRegistry: (sessionId) => sessionProcessManager.listSessionMcpRegistry(sessionId),
    addMcpServer: async (sessionId, config) => {
      await sessionProcessManager.addMcpServer(sessionId, config)
      emitSnapshot(sessionId)
      onChange?.()
    },
    removeMcpServer: async (sessionId, serverName) => {
      await sessionProcessManager.removeMcpServer(sessionId, serverName)
      emitSnapshot(sessionId)
      onChange?.()
    },
    toggleMcpServer: async (sessionId, serverName, enabled) => {
      await sessionProcessManager.toggleMcpServer(sessionId, serverName, enabled)
      emitSnapshot(sessionId)
      onChange?.()
    },
    authenticateMcpServer: async (sessionId, serverName) => {
      await sessionProcessManager.authenticateMcpServer(sessionId, serverName)
      emitSnapshot(sessionId)
      onChange?.()
    },
    cancelMcpAuth: async (sessionId, serverName) => {
      await sessionProcessManager.cancelMcpAuth(sessionId, serverName)
      emitSnapshot(sessionId)
      onChange?.()
    },
    clearMcpAuth: async (sessionId, serverName) => {
      await sessionProcessManager.clearMcpAuth(sessionId, serverName)
      emitSnapshot(sessionId)
      onChange?.()
    },
    submitMcpAuthCode: async (sessionId, request) => {
      await sessionProcessManager.submitMcpAuthCode(sessionId, request)
      emitSnapshot(sessionId)
      onChange?.()
    },
    toggleMcpTool: async (sessionId, serverName, toolName, enabled) => {
      await sessionProcessManager.toggleMcpTool(sessionId, serverName, toolName, enabled)
      emitSnapshot(sessionId)
      onChange?.()
    },
    killWorkerSession: async (sessionId, workerSessionId) => {
      await sessionProcessManager.killWorkerSession(sessionId, workerSessionId)
      emitSnapshot(sessionId)
      onChange?.()
    },
    submitBugReport: (sessionId, request) =>
      sessionProcessManager.submitBugReport(sessionId, request),
    getSessionContextStats: (sessionId) =>
      sessionProcessManager.getSessionContextStats?.(sessionId) ?? Promise.resolve(null),
    updateSessionSettings: (sessionId, settings) =>
      sessionProcessManager.updateSessionSettings(sessionId, settings).then(() => {
        emitSnapshot(sessionId)
        onChange?.()
      }),
    resolvePermissionRequest: async (sessionId, requestId, selectedOption) => {
      await sessionProcessManager.resolvePermissionRequest(sessionId, requestId, selectedOption)
      emitSnapshot(sessionId)
      onChange?.()
    },
    resolveAskUserRequest: async (sessionId, requestId, answers) => {
      await sessionProcessManager.resolveAskUserRequest(sessionId, requestId, answers)
      emitSnapshot(sessionId)
      onChange?.()
    },
    getRewindInfo: (sessionId, messageId) =>
      sessionProcessManager.getRewindInfo(sessionId, messageId),
    executeRewind: async (sessionId, params, viewerId) => {
      const result = await sessionProcessManager.executeRewind(sessionId, {
        ...params,
        viewerId,
      })
      ensureSessionSubscription(result.snapshot.sessionId)
      emitSnapshot(result.snapshot.sessionId)
      onChange?.()
      return serializeExecuteRewindResult(result)
    },
    compactSession: async (sessionId, customInstructions, viewerId) => {
      const result = await sessionProcessManager.compactSession(sessionId, {
        customInstructions,
        viewerId,
      })
      ensureSessionSubscription(result.snapshot.sessionId)
      emitSnapshot(result.snapshot.sessionId)
      onChange?.()
      return serializeCompactResult(result)
    },
    forkSession: async (sessionId, viewerId) => {
      const snapshot = await sessionProcessManager.forkSession(sessionId, { viewerId })
      ensureSessionSubscription(snapshot.sessionId)
      emitSnapshot(snapshot.sessionId)
      onChange?.()
      return serializeLiveSessionSnapshot(snapshot)
    },
    interruptSession: async (sessionId) => {
      await sessionProcessManager.interruptSession(sessionId)
      emitSnapshot(sessionId)
      onChange?.()
    },
    subscribeToSnapshots: (listener) => {
      snapshotListeners.add(listener)

      return () => {
        snapshotListeners.delete(listener)
      }
    },
    dispose: async () => {
      for (const unsubscribe of sessionEventUnsubscribers.values()) {
        unsubscribe()
      }
      sessionEventUnsubscribers.clear()
      await sessionProcessManager.dispose()
    },
  }
}

function serializeLiveSessionSnapshot(snapshot: RuntimeLiveSessionSnapshot): LiveSessionSnapshot {
  return {
    ...snapshot,
    events: snapshot.events.map(serializeLiveSessionEvent),
  }
}

function serializeExecuteRewindResult(
  result: LiveSessionExecuteRewindResult,
): LiveSessionExecuteRewindResult {
  return {
    ...result,
    snapshot: serializeLiveSessionSnapshot(result.snapshot),
  }
}

function serializeCompactResult(result: LiveSessionCompactResult): LiveSessionCompactResult {
  return {
    ...result,
    snapshot: serializeLiveSessionSnapshot(result.snapshot),
  }
}

function serializeLiveSessionEvent(event: SessionEvent): LiveSessionEventRecord {
  if (event.type !== 'stream.error') {
    return {
      ...event,
    }
  }

  const error = event.error
  return {
    ...event,
    error:
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown stream error',
  }
}
