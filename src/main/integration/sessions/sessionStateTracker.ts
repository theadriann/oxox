import type { SessionRuntimeUpsert, SessionUpsert } from '../database/service'
import type { SessionEvent } from '../protocol/sessionEvents'
import { toSnapshot, toVisibleStatus } from './snapshotConverter'
import type { LiveSessionNotificationSummary, ManagedSession, SessionEventSink } from './types'

export interface SessionStateTrackerOptions {
  database: {
    upsertSession: (upsert: SessionUpsert) => void
    upsertSessionRuntime: (upsert: SessionRuntimeUpsert) => void
    clearSessionRuntime: (sessionId: string) => void
    linkSessionParent: (childId: string, parentId: string, type: string, timestamp: string) => void
  }
  now: () => string
}

export function createSessionStateTracker(options: SessionStateTrackerOptions) {
  const { database } = options
  const sessions = new Map<string, ManagedSession>()
  const requestCounters = new Map<string, number>()

  const nextRequestId = (prefix: string): string => {
    const nextValue = (requestCounters.get(prefix) ?? 0) + 1
    requestCounters.set(prefix, nextValue)
    return `${prefix}:${nextValue}`
  }

  const persist = (session: ManagedSession): void => {
    const visibleStatus = toVisibleStatus(session)
    const timestamp = session.lastEventAt ?? session.updatedAt
    const persisted: SessionUpsert = {
      sessionId: session.sessionId,
      projectWorkspacePath: session.cwd,
      modelId: session.settings.modelId ?? null,
      hasUserMessage: session.messages.some(
        (message) => message.role === 'user' && message.content.trim().length > 0,
      ),
      title: session.title,
      status: visibleStatus,
      transport: 'stream-jsonrpc',
      createdAt: session.createdAt,
      lastActivityAt: timestamp,
      updatedAt: session.updatedAt,
    }
    const runtime: SessionRuntimeUpsert = {
      sessionId: session.sessionId,
      transport: 'stream-jsonrpc',
      status: visibleStatus,
      processId: session.processId,
      viewerCount: session.viewerIds.size,
      lastEventAt: session.lastEventAt,
      updatedAt: session.updatedAt,
    }

    database.upsertSession(persisted)
    database.upsertSessionRuntime(runtime)
  }

  const emitToSubscribers = (session: ManagedSession, event: SessionEvent): void => {
    for (const sink of session.subscribers) {
      sink(event)
    }
  }

  const toManagedSessionSnapshot = (session: ManagedSession) => toSnapshot(session)

  return {
    get: (sessionId: string): ManagedSession | undefined => sessions.get(sessionId),
    has: (sessionId: string): boolean => sessions.has(sessionId),
    set: (session: ManagedSession): void => {
      sessions.set(session.sessionId, session)
    },
    delete: (sessionId: string): boolean => sessions.delete(sessionId),
    forEach: (callback: (session: ManagedSession) => void): void => {
      for (const session of sessions.values()) {
        callback(session)
      }
    },
    nextRequestId,
    persist,
    emitToSubscribers,
    toSnapshot: toManagedSessionSnapshot,
    listSnapshots: () => Array.from(sessions.values(), (session) => toSnapshot(session)),
    listNotificationSummaries: (): LiveSessionNotificationSummary[] =>
      Array.from(sessions.values(), toNotificationSummary),
    subscribe: (sessionId: string, sink: SessionEventSink): (() => void) => {
      const session = sessions.get(sessionId)

      if (!session) {
        throw new Error(`Session "${sessionId}" is not being managed.`)
      }

      session.subscribers.add(sink)

      return () => {
        session.subscribers.delete(sink)
      }
    },
    clearAll: (): void => {
      sessions.clear()
    },
  }
}

function toNotificationSummary(session: ManagedSession): LiveSessionNotificationSummary {
  const pendingPermissions = new Map<
    string,
    LiveSessionNotificationSummary['pendingPermissions'][number]
  >()
  const pendingAskUser = new Map<string, LiveSessionNotificationSummary['pendingAskUser'][number]>()
  let completionCount = 0

  for (const event of session.events) {
    switch (event.type) {
      case 'permission.requested': {
        const requestId = toOptionalString(event.requestId)

        if (requestId) {
          pendingPermissions.set(requestId, {
            requestId,
            reason: toOptionalString(event.reason),
          })
        }
        break
      }

      case 'permission.resolved': {
        const requestId = toOptionalString(event.requestId)

        if (requestId) {
          pendingPermissions.delete(requestId)
        }
        break
      }

      case 'askUser.requested': {
        const requestId = toOptionalString(event.requestId)

        if (requestId) {
          pendingAskUser.set(requestId, {
            requestId,
            prompt: toOptionalString(event.prompt),
          })
        }
        break
      }

      case 'askUser.resolved': {
        const requestId = toOptionalString(event.requestId)

        if (requestId) {
          pendingAskUser.delete(requestId)
        }
        break
      }

      case 'stream.completed':
        completionCount += 1
        break
    }
  }

  return {
    sessionId: session.sessionId,
    title: session.title,
    pendingPermissions: [...pendingPermissions.values()],
    pendingAskUser: [...pendingAskUser.values()],
    completionCount,
  }
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}
