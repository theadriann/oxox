import type {
  DatabaseDiagnostics,
  DroidCliStatus,
  FoundationBootstrap,
  ProjectRecord,
  SessionRecord,
  SessionReindexProgress,
  SessionTranscript,
  SessionTranscriptScrollState,
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
  getSessionTranscriptScrollState: (sessionId: string) => SessionTranscriptScrollState | null
  setSessionTranscriptScrollState: (state: SessionTranscriptScrollState) => void
}

type LoadSessionTranscript = (
  sessionId: string,
  sourcePath: string,
  rewindBoundaryMessageIdsByMessageId?: ReadonlyMap<string, string>,
) => Promise<SessionTranscript>
type SessionRewindBoundary = {
  messageId: string
  rewindBoundaryMessageId: string
}

export interface CreateFoundationQueriesOptions {
  database: Pick<
    DatabaseService,
    'getDiagnostics' | 'listProjects' | 'listSessionRewindBoundaries' | 'listSyncMetadata'
  > &
    Partial<
      Pick<
        DatabaseService,
        | 'getSessionTranscriptScrollState'
        | 'listSessionFolderAssignments'
        | 'listSessionFolders'
        | 'upsertSessionTranscriptScrollState'
      >
    >
  sessionCatalog: Pick<FoundationSessionCatalog, 'listSessions'>
  daemonTransport: Pick<DaemonTransport, 'getStatus'>
  droidCliStatus: DroidCliStatus
  getFactorySettingsBootstrap: () => Pick<
    FoundationBootstrap,
    'factoryModels' | 'factoryDefaultSettings'
  >
  getSessionReindexProgress?: () => SessionReindexProgress
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
        sessionFolders: options.database.listSessionFolders?.() ?? [],
        sessionFolderAssignments: options.database.listSessionFolderAssignments?.() ?? [],
        ...(options.getSessionReindexProgress
          ? { sessionReindexProgress: options.getSessionReindexProgress() }
          : {}),
        factoryModels: factorySettingsBootstrap.factoryModels,
        factoryDefaultSettings: factorySettingsBootstrap.factoryDefaultSettings,
      }
    },
    getDatabaseDiagnostics: () => options.database.getDiagnostics(),
    listProjects: () => options.database.listProjects(),
    listSessions: () => options.sessionCatalog.listSessions(),
    listSyncMetadata: () => options.database.listSyncMetadata(),
    getSessionTranscriptScrollState: (sessionId) =>
      options.database.getSessionTranscriptScrollState?.(sessionId) ?? null,
    setSessionTranscriptScrollState: (state) => {
      options.database.upsertSessionTranscriptScrollState?.(state)
    },
    getSessionTranscript: async (sessionId) => {
      const sourcePath = options.database
        .listSyncMetadata()
        .find((metadata) => metadata.sessionId === sessionId)?.sourcePath

      if (!sourcePath) {
        throw new Error(`Transcript artifact unavailable for session "${sessionId}".`)
      }

      const rewindBoundaryMessageIdsByMessageId = new Map<string, string>(
        options.database
          .listSessionRewindBoundaries(sessionId)
          .map((boundary: SessionRewindBoundary) => [
            boundary.messageId,
            boundary.rewindBoundaryMessageId,
          ]),
      )

      return loadSessionTranscript(sessionId, sourcePath, rewindBoundaryMessageIdsByMessageId)
    },
  }
}
