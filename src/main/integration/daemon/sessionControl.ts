import type { LiveSessionSnapshot } from '../../../shared/ipc/contracts'
import type { FoundationLiveSessionRuntime } from '../foundation/liveSessionRuntime'
import type { FoundationSessionCatalog } from '../foundation/sessionCatalog'
import { findSessionTranscriptPath, renameSessionTitleInTranscript } from '../transcripts/mutations'
import type { DaemonTransport } from './transport'

export interface DaemonSessionControl {
  getCapabilities: () => {
    canFork: boolean
    canRename: boolean
  }
  forkSession: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  renameSession: (sessionId: string, title: string) => Promise<void>
}

export function createDaemonSessionControl({
  daemonTransport,
  liveSessionRuntime,
  sessionCatalog,
  sessionsRoot,
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

  return {
    getCapabilities: () => ({
      canFork: daemonTransport.supportsMethod('daemon.fork_session'),
      canRename: true,
    }),

    async forkSession(sessionId: string, viewerId?: string): Promise<LiveSessionSnapshot> {
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

      return liveSessionRuntime.attachSession(newSessionId, viewerId)
    },

    async renameSession(sessionId: string, title: string): Promise<void> {
      const sourcePath = findSessionTranscriptPath(sessionsRoot, sessionId)

      if (!sourcePath) {
        throw new Error(`Session transcript not found for ${sessionId}`)
      }

      await renameSessionTitleInTranscript(sourcePath, title)
      await liveSessionRuntime.renameSession(sessionId, title)
      await sessionCatalog.syncArtifacts()

      const renamedRecord = sessionCatalog
        .listSessions()
        .find((session) => session.id === sessionId)

      if (!renamedRecord || renamedRecord.title !== title) {
        throw new Error(`Failed to verify daemon rename for ${sessionId}`)
      }
    },
  }
}
