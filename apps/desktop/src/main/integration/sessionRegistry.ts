export interface ActiveSessionHandle {
  detach: () => void | Promise<void>
}

const activeSessions = new Set<ActiveSessionHandle>()

export function registerActiveSession(sessionHandle: ActiveSessionHandle): () => void {
  activeSessions.add(sessionHandle)

  return () => {
    activeSessions.delete(sessionHandle)
  }
}

export async function detachActiveSessions(): Promise<void> {
  const sessions = [...activeSessions]
  activeSessions.clear()

  for (const session of sessions) {
    await session.detach()
  }
}

export function clearActiveSessions(): void {
  activeSessions.clear()
}
