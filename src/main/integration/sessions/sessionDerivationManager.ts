import type {
  LiveSessionCompactResult,
  LiveSessionExecuteRewindResult,
  LiveSessionRewindInfo,
} from '../../../shared/ipc/contracts'
import { normalizeMessages } from './messageNormalizer'
import { normalizeAvailableModels, normalizeSessionSettings, toSnapshot } from './snapshotConverter'
import type { ManagedSession, StreamJsonRpcProcessTransportLike } from './types'

export interface SessionDerivationManagerOptions {
  now: () => string
  nextRequestId: (prefix: string) => string
  createTransport: (
    sessionId: string | null,
    cwd: string | null,
  ) => StreamJsonRpcProcessTransportLike
  hydrateManagedSession: (
    session: ManagedSession,
    result: import('./types').StreamJsonRpcLoadResult,
    viewerId?: string,
  ) => void
  bindTransport: (session: ManagedSession, transport: StreamJsonRpcProcessTransportLike) => void
  persistManagedSession: (session: ManagedSession) => void
  createManagedSession: (
    sessionId: string,
    transport: StreamJsonRpcProcessTransportLike,
    cwd: string | null,
    title: string,
    messages: import('./types').LiveSessionMessage[],
    events: import('../protocol/sessionEvents').SessionEvent[],
    settings: import('./types').LiveSessionSettings,
    availableModels: import('./types').LiveSessionModel[],
    viewerId: string | undefined,
    parentSessionId: string | null,
  ) => ManagedSession
}

export function createSessionDerivationManager(options: SessionDerivationManagerOptions) {
  const attachDerivedSession = async ({
    newSessionId,
    parentSession,
    viewerId,
    requestIdPrefix,
  }: {
    newSessionId: string
    parentSession: ManagedSession
    viewerId?: string
    requestIdPrefix: string
  }) => {
    const transport = options.createTransport(newSessionId, parentSession.cwd)
    const result = await transport.loadSession(options.nextRequestId(requestIdPrefix), newSessionId)

    const messages = normalizeMessages(result.session.messages)
    const settings = normalizeSessionSettings(
      result.settings ?? parentSession.settings,
      result.availableModels ?? parentSession.availableModels,
    )
    const availableModels = normalizeAvailableModels(
      result.availableModels ?? parentSession.availableModels,
      settings,
    )
    const managedSession = options.createManagedSession(
      newSessionId,
      transport,
      result.cwd ?? parentSession.cwd,
      parentSession.title,
      messages,
      [],
      settings,
      availableModels,
      viewerId,
      parentSession.sessionId,
    )
    managedSession.updatedAt = options.now()
    managedSession.workingStatus = result.isAgentLoopInProgress ? 'active' : 'idle'
    options.persistManagedSession(managedSession)

    return { managedSession, result }
  }

  const fork = async (parentSession: ManagedSession, request: { viewerId?: string } = {}) => {
    const transport = parentSession.transport
    if (!transport) {
      throw new Error(
        `Session "${parentSession.sessionId}" is not currently attached. Reconnect to continue.`,
      )
    }
    const { newSessionId } = await transport.forkSession(options.nextRequestId('session:fork'))
    const { managedSession } = await attachDerivedSession({
      newSessionId,
      parentSession,
      viewerId: request.viewerId,
      requestIdPrefix: 'session:fork:attach',
    })

    return toSnapshotFromManaged(managedSession)
  }

  const executeRewind = async (
    parentSession: ManagedSession,
    request: {
      messageId: string
      filesToRestore: LiveSessionRewindInfo['availableFiles']
      filesToDelete: LiveSessionRewindInfo['createdFiles']
      forkTitle: string
      viewerId?: string
    },
  ) => {
    const transport = parentSession.transport
    if (!transport) {
      throw new Error(
        `Session "${parentSession.sessionId}" is not currently attached. Reconnect to continue.`,
      )
    }
    const { viewerId, ...params } = request
    const result = await transport.executeRewind(
      options.nextRequestId('session:rewind:execute'),
      params,
    )
    const { managedSession } = await attachDerivedSession({
      newSessionId: result.newSessionId,
      parentSession,
      viewerId,
      requestIdPrefix: 'session:rewind:attach',
    })

    return {
      snapshot: toSnapshotFromManaged(managedSession),
      restoredCount: result.restoredCount,
      deletedCount: result.deletedCount,
      failedRestoreCount: result.failedRestoreCount,
      failedDeleteCount: result.failedDeleteCount,
    } satisfies LiveSessionExecuteRewindResult
  }

  const compact = async (
    parentSession: ManagedSession,
    request: { customInstructions?: string; viewerId?: string } = {},
  ) => {
    const transport = parentSession.transport
    if (!transport) {
      throw new Error(
        `Session "${parentSession.sessionId}" is not currently attached. Reconnect to continue.`,
      )
    }
    const result = await transport.compactSession(
      options.nextRequestId('session:compact'),
      request.customInstructions,
    )
    const { managedSession } = await attachDerivedSession({
      newSessionId: result.newSessionId,
      parentSession,
      viewerId: request.viewerId,
      requestIdPrefix: 'session:compact:attach',
    })

    return {
      snapshot: toSnapshotFromManaged(managedSession),
      removedCount: result.removedCount,
    } satisfies LiveSessionCompactResult
  }

  return { fork, executeRewind, compact }
}

function toSnapshotFromManaged(session: ManagedSession) {
  return toSnapshot(session)
}
