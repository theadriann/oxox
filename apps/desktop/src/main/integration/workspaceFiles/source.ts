export type WorkspaceFileAccessTarget =
  | { kind: 'local'; workspacePath: string }
  | { kind: 'daemon' }

interface WorkspaceFileLiveSession {
  sessionId: string
  projectWorkspacePath?: string | null
}

interface WorkspaceFileCatalogSession {
  id: string
  projectWorkspacePath?: string | null
}

interface ResolveWorkspaceFileAccessTargetOptions {
  sessionId: string
  isDaemonBackedSession: boolean
  liveSessions: WorkspaceFileLiveSession[]
  catalogSessions: WorkspaceFileCatalogSession[]
}

export function resolveWorkspaceFileAccessTarget({
  sessionId,
  isDaemonBackedSession,
  liveSessions,
  catalogSessions,
}: ResolveWorkspaceFileAccessTargetOptions): WorkspaceFileAccessTarget {
  const liveSessionPath =
    liveSessions.find((session) => session.sessionId === sessionId)?.projectWorkspacePath ?? null
  const catalogSessionPath =
    catalogSessions.find((session) => session.id === sessionId)?.projectWorkspacePath ?? null
  const workspacePath = liveSessionPath ?? catalogSessionPath

  if (workspacePath) {
    return { kind: 'local', workspacePath }
  }

  if (isDaemonBackedSession) {
    return { kind: 'daemon' }
  }

  throw new Error('Workspace file APIs require a session with a workspace path.')
}
