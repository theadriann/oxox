import type {
  DatabaseDiagnostics,
  DroidCliStatus,
  FoundationBootstrap,
  ProjectRecord,
  SessionRecord,
  SessionTranscript,
  SyncMetadataRecord,
} from '../../../shared/ipc/contracts'
import type { DaemonTransport } from '../daemon/transport'
import type { DatabaseService } from '../database/service'
import { loadSessionTranscriptFromFile } from '../transcripts/service'
import type { FoundationSessionCatalog } from './sessionCatalog'

export interface FoundationQueries {
  getBootstrap: () => FoundationBootstrap
  getDatabaseDiagnostics: () => DatabaseDiagnostics
  listProjects: () => ProjectRecord[]
  listSessions: () => SessionRecord[]
  listSyncMetadata: () => SyncMetadataRecord[]
  getSessionTranscript: (sessionId: string) => Promise<SessionTranscript>
}

type LoadSessionTranscript = (sessionId: string, sourcePath: string) => Promise<SessionTranscript>

export interface CreateFoundationQueriesOptions {
  database: Pick<DatabaseService, 'getDiagnostics' | 'listProjects' | 'listSyncMetadata'>
  sessionCatalog: Pick<FoundationSessionCatalog, 'listSessions'>
  daemonTransport: Pick<DaemonTransport, 'getStatus'>
  droidCliStatus: DroidCliStatus
  getFactorySettingsBootstrap: () => Pick<
    FoundationBootstrap,
    'factoryModels' | 'factoryDefaultSettings'
  >
  loadSessionTranscript?: LoadSessionTranscript
}

export function createFoundationQueries(
  options: CreateFoundationQueriesOptions,
): FoundationQueries {
  const loadSessionTranscript = options.loadSessionTranscript ?? loadSessionTranscriptFromFile

  return {
    getBootstrap: () => {
      const factorySettingsBootstrap = options.getFactorySettingsBootstrap()

      return {
        database: options.database.getDiagnostics(),
        droidCli: options.droidCliStatus,
        daemon: options.daemonTransport.getStatus(),
        projects: options.database.listProjects(),
        sessions: options.sessionCatalog.listSessions(),
        syncMetadata: options.database.listSyncMetadata(),
        factoryModels: factorySettingsBootstrap.factoryModels,
        factoryDefaultSettings: factorySettingsBootstrap.factoryDefaultSettings,
      }
    },
    getDatabaseDiagnostics: () => options.database.getDiagnostics(),
    listProjects: () => options.database.listProjects(),
    listSessions: () => options.sessionCatalog.listSessions(),
    listSyncMetadata: () => options.database.listSyncMetadata(),
    getSessionTranscript: async (sessionId) => {
      const sourcePath = options.database
        .listSyncMetadata()
        .find((metadata) => metadata.sessionId === sessionId)?.sourcePath

      if (!sourcePath) {
        throw new Error(`Transcript artifact unavailable for session "${sessionId}".`)
      }

      return loadSessionTranscript(sessionId, sourcePath)
    },
  }
}
