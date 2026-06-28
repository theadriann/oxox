import type { LiveSessionSnapshot } from '../../../shared/ipc/contracts'
import type { FoundationLiveSessionRuntime } from '../foundation/liveSessionRuntime'
import type { FoundationSessionCatalog } from '../foundation/sessionCatalog'
import type { DaemonTransport } from './transport'

export interface DaemonSessionControl {
  getCapabilities: () => {
    canFork: boolean
    canRename: boolean
  }
  forkSession: (
    sessionId: string,
    viewerId?: string,
    title?: string,
  ) => Promise<LiveSessionSnapshot>
  renameSession: (sessionId: string, title: string) => Promise<void>
}

export function createDaemonSessionControl({
  daemonTransport,
  liveSessionRuntime,
  sessionCatalog,
}: {
  daemonTransport: Pick<
    DaemonTransport,
    'supportsMethod' | 'forkSession' | 'renameSession' | 'refreshSessions'
  >
  liveSessionRuntime: Pick<FoundationLiveSessionRuntime, 'attachSession' | 'renameSession'>
  sessionCatalog: Pick<FoundationSessionCatalog, 'syncArtifacts' | 'listSessions'>
  sessionsRoot: string
}): DaemonSessionControl {
  const refreshEvidence = async (): Promise<void> => {
    await daemonTransport.refreshSessions()
    await sessionCatalog.syncArtifacts()
  }

  const renameSession = async (sessionId: string, title: string): Promise<void> => {
    if (!daemonTransport.supportsMethod('daemon.rename_session')) {
      throw new Error('Daemon missing required capability: daemon.rename_session')
    }

    await daemonTransport.renameSession(sessionId, title)
    await refreshEvidence()
    await liveSessionRuntime.renameSession(sessionId, title)

    const renamedRecord = sessionCatalog.listSessions().find((session) => session.id === sessionId)

    if (!renamedRecord || renamedRecord.title !== title) {
      throw new Error(`Failed to verify daemon rename for ${sessionId}`)
    }
  }

  return {
    getCapabilities: () => ({
      canFork: daemonTransport.supportsMethod('daemon.fork_session'),
      canRename: daemonTransport.supportsMethod('daemon.rename_session'),
    }),

    async forkSession(
      sessionId: string,
      viewerId?: string,
      title?: string,
    ): Promise<LiveSessionSnapshot> {
      if (!daemonTransport.supportsMethod('daemon.fork_session')) {
        throw new Error('Daemon missing required capability: daemon.fork_session')
      }

      const { newSessionId } = await daemonTransport.forkSession(sessionId)
      await refreshEvidence()

      const forkedRecord = sessionCatalog
        .listSessions()
        .find((session) => session.id === newSessionId)

      if (!forkedRecord) {
        throw new Error(`Failed to verify daemon fork for ${newSessionId}`)
      }

      const snapshot = await liveSessionRuntime.attachSession(newSessionId, viewerId)
      const forkTitle = title?.trim()

      if (!forkTitle) {
        return snapshot
      }

      await renameSession(newSessionId, forkTitle)
      return { ...snapshot, title: forkTitle }
    },

    renameSession,
  }
}
