// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  FoundationBootstrap,
  LiveSessionSnapshot,
  RuntimeInfo,
  SessionRecord,
  SessionTranscript,
} from '../../../../shared/ipc/contracts'
import type {
  PluginCapabilityRecord,
  PluginHostSnapshot,
} from '../../../../shared/plugins/contracts'
import { createPlatformApiClient } from '../../platform/apiClient'
import { createMemoryPersistencePort } from '../../platform/persistence'
import { RootStore } from '../RootStore'

const FOUNDATION_BOOTSTRAP: FoundationBootstrap = {
  database: {
    exists: true,
    journalMode: 'wal',
    path: '/tmp/oxox.db',
    tableNames: ['sessions'],
  },
  droidCli: {
    available: true,
    path: '/Users/test/.local/bin/droid',
    version: '0.84.0',
    searchedLocations: ['/Users/test/.local/bin/droid'],
    error: null,
  },
  daemon: {
    status: 'connected',
    connectedPort: 37643,
    lastError: null,
    lastConnectedAt: '2026-03-24T23:41:00.000Z',
    lastSyncAt: '2026-03-24T23:41:01.000Z',
    nextRetryDelayMs: null,
  },
  projects: [],
  sessions: [],
  syncMetadata: [],
  factoryModels: [],
  factoryDefaultSettings: {},
}

const RUNTIME_INFO: RuntimeInfo = {
  appVersion: '0.1.0',
  chromeVersion: '136.0.0.0',
  electronVersion: '41.0.3',
  nodeVersion: '24.11.1',
  platform: 'darwin',
  isDarkModeForced: true,
  hasRequire: false,
  hasProcess: false,
}

const SESSION_TRANSCRIPT: SessionTranscript = {
  sessionId: 'session-live-1',
  sourcePath: '/tmp/session-live-1.jsonl',
  loadedAt: '2026-03-24T23:42:00.000Z',
  entries: [
    {
      kind: 'message',
      id: 'entry-1',
      occurredAt: '2026-03-24T23:42:00.000Z',
      role: 'assistant',
      markdown: 'Transcript entry',
    },
  ],
}

const LIVE_SESSION_SNAPSHOT: LiveSessionSnapshot = {
  sessionId: 'session-live-1',
  title: 'Injected live session',
  status: 'active',
  transport: 'stream-jsonrpc',
  processId: 4242,
  viewerCount: 1,
  projectWorkspacePath: '/tmp/live-session',
  parentSessionId: null,
  availableModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
  settings: {
    modelId: 'gpt-5.4',
    interactionMode: 'spec',
  },
  messages: [],
  events: [],
}

const SESSION_RECORD: SessionRecord = {
  id: 'session-live-1',
  projectId: 'project-live-1',
  projectWorkspacePath: '/tmp/live-session',
  projectDisplayName: null,
  modelId: 'gpt-5.4',
  parentSessionId: null,
  derivationType: null,
  title: 'Stored session',
  status: 'idle',
  transport: 'artifacts',
  createdAt: '2026-03-24T23:30:00.000Z',
  lastActivityAt: '2026-03-24T23:40:00.000Z',
  updatedAt: '2026-03-24T23:40:00.000Z',
}

const PLUGIN_HOST_SNAPSHOT: PluginHostSnapshot = {
  pluginId: 'plugin.example',
  processId: 4242,
  status: 'running',
  lastError: null,
}

const PLUGIN_CAPABILITY: PluginCapabilityRecord = {
  qualifiedId: 'plugin.example:summarize',
  pluginId: 'plugin.example',
  kind: 'session-action',
  name: 'summarize',
  displayName: 'Summarize Session',
}

describe('RootStore', () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, 'oxox')
  })

  it('hydrates stores through the injected platform client instead of a global bridge lookup', async () => {
    const platform = createPlatformApiClient({
      oxox: {
        foundation: {
          getBootstrap: vi.fn().mockResolvedValue(FOUNDATION_BOOTSTRAP),
        },
        runtime: {
          getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
        },
        plugin: {
          listCapabilities: vi.fn().mockResolvedValue([PLUGIN_CAPABILITY]),
          listHosts: vi.fn().mockResolvedValue([PLUGIN_HOST_SNAPSHOT]),
          invokeCapability: vi.fn(),
          onHostChanged: vi.fn(),
        },
        transcript: {
          getSessionTranscript: vi.fn().mockResolvedValue(SESSION_TRANSCRIPT),
        },
        dialog: {
          selectDirectory: vi.fn(),
        },
        database: {
          listProjects: vi.fn(),
          listSessions: vi.fn(),
          listSyncMetadata: vi.fn(),
        },
        session: {
          create: vi.fn(),
          getSnapshot: vi.fn().mockResolvedValue(LIVE_SESSION_SNAPSHOT),
          attach: vi.fn(),
          detach: vi.fn(),
          addUserMessage: vi.fn(),
          updateSettings: vi.fn(),
          interrupt: vi.fn(),
          fork: vi.fn(),
          resolvePermissionRequest: vi.fn(),
          resolveAskUser: vi.fn(),
        },
      },
    })
    const rootStore = new RootStore(platform)

    await rootStore.foundationStore.refresh()
    await rootStore.foundationStore.initRuntime()
    await rootStore.transcriptStore.openSession('session-live-1')
    await rootStore.liveSessionStore.refreshSnapshot('session-live-1')
    await rootStore.pluginCapabilityStore.refresh()
    await rootStore.pluginHostStore.refresh()

    expect(platform.foundation.getBootstrap).toHaveBeenCalledTimes(1)
    expect(platform.runtime.getInfo).toHaveBeenCalledTimes(1)
    expect(platform.plugin.listCapabilities).toHaveBeenCalledTimes(1)
    expect(platform.plugin.listHosts).toHaveBeenCalledTimes(1)
    expect(platform.transcript.getSessionTranscript).toHaveBeenCalledWith('session-live-1')
    expect(platform.session.getSnapshot).toHaveBeenCalledWith('session-live-1')
    expect(rootStore.transcriptStore.transcriptForSession('session-live-1')).toEqual(
      SESSION_TRANSCRIPT,
    )
    expect(rootStore.liveSessionStore.snapshotsById.get('session-live-1')).toEqual(
      LIVE_SESSION_SNAPSHOT,
    )
    expect(rootStore.pluginCapabilityStore.capabilities).toEqual([PLUGIN_CAPABILITY])
    expect(rootStore.pluginHostStore.hosts).toEqual([PLUGIN_HOST_SNAPSHOT])
    expect(rootStore.api).toBe(platform)
  })

  it('does not fall back to the ambient bridge when the injected session snapshot loader is absent', async () => {
    const ambientGetSnapshot = vi.fn().mockResolvedValue(LIVE_SESSION_SNAPSHOT)

    window.oxox = {
      session: {
        getSnapshot: ambientGetSnapshot,
      },
    } as never

    const platform = createPlatformApiClient({
      oxox: {
        foundation: {
          getBootstrap: vi.fn().mockResolvedValue(FOUNDATION_BOOTSTRAP),
        },
        runtime: {
          getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
        },
        plugin: {
          listCapabilities: vi.fn(),
          invokeCapability: vi.fn(),
          onHostChanged: vi.fn(),
        },
        transcript: {
          getSessionTranscript: vi.fn().mockResolvedValue(SESSION_TRANSCRIPT),
        },
        dialog: {
          selectDirectory: vi.fn(),
        },
        database: {
          listProjects: vi.fn(),
          listSessions: vi.fn(),
          listSyncMetadata: vi.fn(),
        },
        session: {
          create: vi.fn(),
          attach: vi.fn(),
          detach: vi.fn(),
          addUserMessage: vi.fn(),
          updateSettings: vi.fn(),
          interrupt: vi.fn(),
          fork: vi.fn(),
          resolvePermissionRequest: vi.fn(),
          resolveAskUser: vi.fn(),
        },
      },
    })
    const rootStore = new RootStore(platform)

    await rootStore.liveSessionStore.refreshSnapshot('session-live-1')

    expect(ambientGetSnapshot).not.toHaveBeenCalled()
    expect(rootStore.liveSessionStore.snapshotsById.size).toBe(0)
    expect(rootStore.pluginHostStore.hosts).toEqual([])
  })

  it('wires composer session actions through the injected platform client instead of the ambient bridge', async () => {
    const ambientAttach = vi.fn().mockResolvedValue(LIVE_SESSION_SNAPSHOT)
    const attach = vi.fn().mockResolvedValue(LIVE_SESSION_SNAPSHOT)

    window.oxox = {
      session: {
        attach: ambientAttach,
      },
    } as never

    const platform = createPlatformApiClient({
      oxox: {
        foundation: {
          getBootstrap: vi.fn().mockResolvedValue(FOUNDATION_BOOTSTRAP),
        },
        runtime: {
          getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
        },
        plugin: {
          listCapabilities: vi.fn(),
          invokeCapability: vi.fn(),
          onHostChanged: vi.fn(),
        },
        transcript: {
          getSessionTranscript: vi.fn().mockResolvedValue(SESSION_TRANSCRIPT),
        },
        dialog: {
          selectDirectory: vi.fn(),
        },
        database: {
          listProjects: vi.fn(),
          listSessions: vi.fn(),
          listSyncMetadata: vi.fn(),
        },
        session: {
          create: vi.fn(),
          getSnapshot: vi.fn().mockResolvedValue(LIVE_SESSION_SNAPSHOT),
          attach,
          detach: vi.fn(),
          addUserMessage: vi.fn(),
          updateSettings: vi.fn(),
          interrupt: vi.fn(),
          fork: vi.fn(),
          resolvePermissionRequest: vi.fn(),
          resolveAskUser: vi.fn(),
        },
      },
    })
    const rootStore = new RootStore(platform)

    rootStore.sessionStore.hydrateSessions([SESSION_RECORD])

    await rootStore.composerStore.attachSelected()

    expect(attach).toHaveBeenCalledWith('session-live-1')
    expect(ambientAttach).not.toHaveBeenCalled()
    expect(rootStore.liveSessionStore.selectedSnapshot).toEqual(LIVE_SESSION_SNAPSHOT)
  })

  it('injects a shared persistence port into renderer stores', () => {
    const persistence = createMemoryPersistencePort()
    const rootStore = new RootStore(createPlatformApiClient({}), persistence)

    rootStore.sessionStore.hydrateSessions([SESSION_RECORD])
    rootStore.sessionStore.togglePinnedSession('session-live-1')

    expect(persistence.get('oxox.session.preferences', {})).toEqual(
      expect.objectContaining({
        pinnedSessionIds: ['session-live-1'],
      }),
    )
  })

  it('keeps live snapshot updates flowing into session state through bus wiring', async () => {
    const platform = createPlatformApiClient({
      oxox: {
        foundation: {
          getBootstrap: vi.fn().mockResolvedValue(FOUNDATION_BOOTSTRAP),
        },
        runtime: {
          getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
        },
        plugin: {
          listCapabilities: vi.fn(),
          invokeCapability: vi.fn(),
          onHostChanged: vi.fn(),
        },
        transcript: {
          getSessionTranscript: vi.fn().mockResolvedValue(SESSION_TRANSCRIPT),
        },
        dialog: {
          selectDirectory: vi.fn(),
        },
        database: {
          listProjects: vi.fn(),
          listSessions: vi.fn(),
          listSyncMetadata: vi.fn(),
        },
        session: {
          create: vi.fn(),
          getSnapshot: vi.fn().mockResolvedValue(LIVE_SESSION_SNAPSHOT),
          attach: vi.fn(),
          detach: vi.fn(),
          addUserMessage: vi.fn(),
          updateSettings: vi.fn(),
          interrupt: vi.fn(),
          fork: vi.fn(),
          resolvePermissionRequest: vi.fn(),
          resolveAskUser: vi.fn(),
        },
      },
    })
    const rootStore = new RootStore(platform)

    rootStore.sessionStore.hydrateSessions([SESSION_RECORD])
    rootStore.sessionStore.selectSession('session-live-1')

    await rootStore.liveSessionStore.refreshSnapshot('session-live-1')

    expect(rootStore.sessionStore.selectedSession?.title).toBe('Injected live session')
    expect(rootStore.sessionStore.selectedSession?.status).toBe('active')
  })
})
