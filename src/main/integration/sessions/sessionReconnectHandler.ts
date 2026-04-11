import type { SessionEvent } from '../protocol/sessionEvents'
import type { ManagedSession } from './types'

export interface SessionReconnectHandlerOptions {
  reconnectDelayMs: number
  now: () => string
  createTransport: (
    sessionId: string | null,
    cwd: string | null,
  ) => import('./types').StreamJsonRpcProcessTransportLike
  hydrateManagedSession: (
    session: ManagedSession,
    result: import('./types').StreamJsonRpcLoadResult,
  ) => void
  bindTransport: (
    session: ManagedSession,
    transport: import('./types').StreamJsonRpcProcessTransportLike,
  ) => void
  persistManagedSession: (session: ManagedSession) => void
  nextRequestId: (prefix: string) => string
}

export function createSessionReconnectHandler(options: SessionReconnectHandlerOptions) {
  const reconnect = (session: ManagedSession): Promise<void> => {
    if (session.reconnectPromise) {
      return session.reconnectPromise
    }

    session.reconnectPromise = (async () => {
      if (options.reconnectDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.reconnectDelayMs))
      }

      const transport = options.createTransport(session.sessionId, session.cwd)

      try {
        const result = await transport.loadSession(
          options.nextRequestId('session:reattach'),
          session.sessionId,
        )

        options.hydrateManagedSession(session, result)
        options.bindTransport(session, transport)
        session.events = [
          ...session.events,
          {
            type: 'stream.warning',
            sessionId: session.sessionId,
            warning: 'Connection restored. Streaming resumed.',
            kind: 'reconnected',
          } satisfies SessionEvent,
        ]
        options.persistManagedSession(session)
      } catch {
        session.transport = null
        session.processId = null
        session.updatedAt = options.now()
        session.workingStatus = 'error'
        options.persistManagedSession(session)
      } finally {
        session.reconnectPromise = null
      }
    })()

    return session.reconnectPromise
  }

  return { reconnect }
}
