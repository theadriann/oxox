import { describe, expect, it, vi } from 'vitest'

import type {
  DatabaseDiagnostics,
  FoundationBootstrap,
  ProjectRecord,
  SessionRecord,
  SessionTranscript,
  SyncMetadataRecord,
} from '../../../shared/ipc/contracts'
import { createFoundationQueries } from '../foundation/queries'

function createProject(
  overrides: Partial<ProjectRecord> & Pick<ProjectRecord, 'id'>,
): ProjectRecord {
  return {
    id: overrides.id,
    workspacePath: overrides.workspacePath ?? `/tmp/${overrides.id}`,
    displayName: overrides.displayName ?? null,
    createdAt: overrides.createdAt ?? '2026-03-24T20:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-24T20:00:00.000Z',
  }
}

function createSession(
  overrides: Partial<SessionRecord> & Pick<SessionRecord, 'id'>,
): SessionRecord {
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? null,
    projectWorkspacePath: overrides.projectWorkspacePath ?? null,
    projectDisplayName: overrides.projectDisplayName ?? null,
    modelId: overrides.modelId ?? null,
    parentSessionId: overrides.parentSessionId ?? null,
    derivationType: overrides.derivationType ?? null,
    title: overrides.title ?? 'Untitled session',
    status: overrides.status ?? 'idle',
    transport: overrides.transport ?? null,
    createdAt: overrides.createdAt ?? '2026-03-24T20:00:00.000Z',
    lastActivityAt: overrides.lastActivityAt ?? null,
    updatedAt: overrides.updatedAt ?? '2026-03-24T20:05:00.000Z',
  }
}

function createSyncMetadata(
  overrides: Partial<SyncMetadataRecord> & Pick<SyncMetadataRecord, 'sessionId' | 'sourcePath'>,
): SyncMetadataRecord {
  return {
    sessionId: overrides.sessionId,
    sourcePath: overrides.sourcePath,
    lastByteOffset: overrides.lastByteOffset ?? 0,
    lastMtimeMs: overrides.lastMtimeMs ?? 0,
    lastSyncedAt: overrides.lastSyncedAt ?? '2026-03-24T20:05:00.000Z',
    checksum: overrides.checksum ?? null,
  }
}

describe('createFoundationQueries', () => {
  it('builds the foundation bootstrap DTO from injected collaborators', () => {
    const diagnostics: DatabaseDiagnostics = {
      path: '/tmp/oxox.sqlite',
      exists: true,
      journalMode: 'wal',
      tableNames: ['projects', 'sessions'],
    }
    const projects = [createProject({ id: 'project-1', displayName: 'Workspace One' })]
    const sessions = [createSession({ id: 'session-1', title: 'Session One', status: 'active' })]
    const syncMetadata = [
      createSyncMetadata({
        sessionId: 'session-1',
        sourcePath: '/tmp/session-1/transcript.jsonl',
      }),
    ]
    const droidCliStatus: FoundationBootstrap['droidCli'] = {
      available: true,
      path: '/opt/homebrew/bin/droid',
      version: 'droid 1.2.3',
      searchedLocations: ['/opt/homebrew/bin/droid'],
      error: null,
    }
    const daemonStatus: FoundationBootstrap['daemon'] = {
      status: 'connected',
      connectedPort: 4312,
      lastError: null,
      lastConnectedAt: '2026-03-24T20:05:00.000Z',
      lastSyncAt: '2026-03-24T20:05:00.000Z',
      nextRetryDelayMs: null,
    }
    const factorySettingsBootstrap: Pick<
      FoundationBootstrap,
      'factoryModels' | 'factoryDefaultSettings'
    > = {
      factoryModels: [{ id: 'gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI' }],
      factoryDefaultSettings: {
        model: 'gpt-5.4',
        interactionMode: 'spec',
      },
    }
    const database = {
      getDiagnostics: vi.fn(() => diagnostics),
      listProjects: vi.fn(() => projects),
      listSyncMetadata: vi.fn(() => syncMetadata),
    }
    const sessionCatalog = {
      listSessions: vi.fn(() => sessions),
    }
    const daemonTransport = {
      getStatus: vi.fn(() => daemonStatus),
    }

    const queries = createFoundationQueries({
      database,
      sessionCatalog,
      daemonTransport,
      droidCliStatus,
      getFactorySettingsBootstrap: () => factorySettingsBootstrap,
    })

    expect(queries.getBootstrap()).toEqual({
      database: diagnostics,
      droidCli: droidCliStatus,
      daemon: daemonStatus,
      projects,
      sessions,
      syncMetadata,
      factoryModels: factorySettingsBootstrap.factoryModels,
      factoryDefaultSettings: factorySettingsBootstrap.factoryDefaultSettings,
    })
  })

  it('passes through database and session catalog methods', () => {
    const diagnostics: DatabaseDiagnostics = {
      path: '/tmp/oxox.sqlite',
      exists: true,
      journalMode: 'wal',
      tableNames: ['projects', 'sessions'],
    }
    const projects = [createProject({ id: 'project-1' })]
    const sessions = [createSession({ id: 'session-1' })]
    const syncMetadata = [
      createSyncMetadata({
        sessionId: 'session-1',
        sourcePath: '/tmp/session-1/transcript.jsonl',
      }),
    ]
    const database = {
      getDiagnostics: vi.fn(() => diagnostics),
      listProjects: vi.fn(() => projects),
      listSyncMetadata: vi.fn(() => syncMetadata),
    }
    const sessionCatalog = {
      listSessions: vi.fn(() => sessions),
    }
    const daemonTransport = {
      getStatus: vi.fn(),
    }

    const queries = createFoundationQueries({
      database,
      sessionCatalog,
      daemonTransport,
      droidCliStatus: {
        available: false,
        path: null,
        version: null,
        searchedLocations: [],
        error: 'not found',
      },
      getFactorySettingsBootstrap: () => ({
        factoryModels: [],
        factoryDefaultSettings: {},
      }),
    })

    expect(queries.getDatabaseDiagnostics()).toEqual(diagnostics)
    expect(queries.listProjects()).toEqual(projects)
    expect(queries.listSessions()).toEqual(sessions)
    expect(queries.listSyncMetadata()).toEqual(syncMetadata)
  })

  it('loads transcript artifacts using sync metadata source paths', async () => {
    const syncMetadata = [
      createSyncMetadata({
        sessionId: 'session-1',
        sourcePath: '/tmp/session-1/transcript.jsonl',
      }),
    ]
    const transcript: SessionTranscript = {
      sessionId: 'session-1',
      sourcePath: '/tmp/session-1/transcript.jsonl',
      loadedAt: '2026-03-24T20:06:00.000Z',
      entries: [],
    }
    const loadSessionTranscript = vi.fn(() => transcript)
    const queries = createFoundationQueries({
      database: {
        getDiagnostics: vi.fn(),
        listProjects: vi.fn(() => []),
        listSessionRewindBoundaries: vi.fn(() => [
          {
            messageId: 'message-user-1',
            rewindBoundaryMessageId: 'rewind-boundary-1',
          },
        ]),
        listSyncMetadata: vi.fn(() => syncMetadata),
      },
      sessionCatalog: {
        listSessions: vi.fn(() => []),
      },
      daemonTransport: {
        getStatus: vi.fn(),
      },
      droidCliStatus: {
        available: false,
        path: null,
        version: null,
        searchedLocations: [],
        error: 'not found',
      },
      getFactorySettingsBootstrap: () => ({
        factoryModels: [],
        factoryDefaultSettings: {},
      }),
      loadSessionTranscript,
    })

    await expect(queries.getSessionTranscript('session-1')).resolves.toEqual(transcript)
    expect(loadSessionTranscript).toHaveBeenCalledWith(
      'session-1',
      '/tmp/session-1/transcript.jsonl',
      new Map([['message-user-1', 'rewind-boundary-1']]),
    )
  })

  it('throws when transcript metadata is unavailable', async () => {
    const queries = createFoundationQueries({
      database: {
        getDiagnostics: vi.fn(),
        listProjects: vi.fn(() => []),
        listSessionRewindBoundaries: vi.fn(() => []),
        listSyncMetadata: vi.fn(() => []),
      },
      sessionCatalog: {
        listSessions: vi.fn(() => []),
      },
      daemonTransport: {
        getStatus: vi.fn(),
      },
      droidCliStatus: {
        available: false,
        path: null,
        version: null,
        searchedLocations: [],
        error: 'not found',
      },
      getFactorySettingsBootstrap: () => ({
        factoryModels: [],
        factoryDefaultSettings: {},
      }),
    })

    await expect(queries.getSessionTranscript('missing-session')).rejects.toThrow(
      'Transcript artifact unavailable for session "missing-session".',
    )
  })

  it('reads factory bootstrap values from the injected getter on every bootstrap request', () => {
    const currentBootstrap: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'> =
      {
        factoryModels: [],
        factoryDefaultSettings: {},
      }

    const queries = createFoundationQueries({
      database: {
        getDiagnostics: vi.fn(() => ({
          path: '/tmp/oxox.sqlite',
          exists: true,
          journalMode: 'wal',
          tableNames: [],
        })),
        listProjects: vi.fn(() => []),
        listSessionRewindBoundaries: vi.fn(() => []),
        listSyncMetadata: vi.fn(() => []),
      },
      sessionCatalog: {
        listSessions: vi.fn(() => []),
      },
      daemonTransport: {
        getStatus: vi.fn(() => ({
          status: 'disconnected',
          connectedPort: null,
          lastError: null,
          lastConnectedAt: null,
          lastSyncAt: null,
          nextRetryDelayMs: null,
        })),
      },
      droidCliStatus: {
        available: false,
        path: null,
        version: null,
        searchedLocations: [],
        error: 'not found',
      },
      getFactorySettingsBootstrap: () => currentBootstrap,
    })

    expect(queries.getBootstrap().factoryModels).toEqual([])

    currentBootstrap.factoryModels = [{ id: 'gpt-5.4', name: 'GPT-5.4' }]
    currentBootstrap.factoryDefaultSettings = { model: 'gpt-5.4' }

    expect(queries.getBootstrap().factoryModels).toEqual([{ id: 'gpt-5.4', name: 'GPT-5.4' }])
    expect(queries.getBootstrap().factoryDefaultSettings).toEqual({ model: 'gpt-5.4' })
  })
})
