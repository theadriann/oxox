import type { ManagedSession, StreamJsonRpcProcessTransportLike } from './types'

export function requireManagedSession(
  sessions: Map<string, ManagedSession>,
  sessionId: string,
): ManagedSession {
  const session = sessions.get(sessionId)

  if (!session) {
    throw new Error(`Session "${sessionId}" is not being managed.`)
  }

  return session
}

export function requireManagedTransport(
  session: ManagedSession,
): StreamJsonRpcProcessTransportLike {
  if (!session.transport) {
    throw new Error(
      `Session "${session.sessionId}" is not currently attached. Reconnect to continue.`,
    )
  }

  return session.transport
}
