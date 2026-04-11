// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  FoundationBootstrap,
  FoundationChangedPayload,
  OxoxBridge,
  RuntimeInfo,
} from '../../../../shared/ipc/contracts'
import { FoundationStore } from '../FoundationStore'
import { SessionStore } from '../SessionStore'
import { createStoreEventBus } from '../storeEventBus'
import { TransportStore } from '../TransportStore'

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

function createBootstrap(overrides: Partial<FoundationBootstrap> = {}): FoundationBootstrap {
  return {
    database: {
      exists: true,
      journalMode: 'wal',
      path: '/tmp/oxox.db',
      tableNames: ['projects', 'sessions', 'sync_metadata'],
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
    sessions: [
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        modelId: 'gpt-5.4',
        parentSessionId: null,
        derivationType: null,
        title: 'Alpha session',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T23:30:00.000Z',
        lastActivityAt: '2026-03-24T23:40:00.000Z',
        updatedAt: '2026-03-24T23:40:00.000Z',
      },
    ],
    syncMetadata: [],
    factoryModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
    factoryDefaultSettings: {
      model: 'gpt-5.4',
      interactionMode: 'auto',
    },
    ...overrides,
  }
}

function createStoreHarness(bridge: ConstructorParameters<typeof FoundationStore>[1] = {}): {
  store: FoundationStore
  sessionStore: SessionStore
  transportStore: TransportStore
} {
  const bus = createStoreEventBus()
  const sessionStore = new SessionStore()
  const transportStore = new TransportStore()

  sessionStore.connectToEventBus(bus)
  transportStore.connectToEventBus(bus)

  return {
    store: new FoundationStore(bus, bridge),
    sessionStore,
    transportStore,
  }
}

describe('FoundationStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('refreshes foundation state and hydrates dependent stores', async () => {
    const bootstrap = createBootstrap()
    const getBootstrap = vi.fn().mockResolvedValue(bootstrap)

    const { store, sessionStore, transportStore } = createStoreHarness({
      getBootstrap,
      getRuntimeInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
    })

    await store.refresh()

    expect(getBootstrap).toHaveBeenCalledTimes(1)
    expect(store.foundation).toEqual(bootstrap)
    expect(store.hasLoadedFoundation).toBe(true)
    expect(store.foundationLoadError).toBeNull()
    expect(store.isLoading).toBe(false)
    expect(store.hasError).toBe(false)
    expect(store.isDroidMissing).toBe(false)
    expect(store.factoryModels).toEqual(bootstrap.factoryModels)
    expect(store.factoryDefaultSettings).toEqual(bootstrap.factoryDefaultSettings)
    expect(sessionStore.sessions.map((session) => session.id)).toEqual(['session-alpha'])
    expect(sessionStore.selectedSessionId).toBe('session-alpha')
    expect(transportStore.status).toBe('connected')
  })

  it('emits sessions-hydrate and foundation-hydrate during refresh', async () => {
    const bootstrap = createBootstrap()
    const bus = createStoreEventBus()
    const emittedSessions = vi.fn()
    const emittedFoundation = vi.fn()

    bus.subscribe('sessions-hydrate', emittedSessions)
    bus.subscribe('foundation-hydrate', emittedFoundation)

    const store = new FoundationStore(bus, {
      getBootstrap: vi.fn().mockResolvedValue(bootstrap),
      getRuntimeInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
    })

    await store.refresh()

    expect(emittedSessions).toHaveBeenCalledWith({ sessions: bootstrap.sessions })
    expect(emittedFoundation).toHaveBeenCalledWith({ bootstrap })
  })

  it('skips replacing foundation state and dependent hydrations when bootstrap is unchanged', async () => {
    const bootstrap = createBootstrap()
    const getBootstrap = vi.fn().mockResolvedValue(bootstrap)

    const { store, sessionStore, transportStore } = createStoreHarness({
      getBootstrap,
      getRuntimeInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
    })

    await store.refresh()

    const initialFoundationReference = store.foundation
    const initialSessionsReference = sessionStore.sessions
    const initialTransportState = {
      status: transportStore.status,
      protocol: transportStore.protocol,
    }

    await store.refresh()

    expect(getBootstrap).toHaveBeenCalledTimes(2)
    expect(store.foundation).toBe(initialFoundationReference)
    expect(sessionStore.sessions).toBe(initialSessionsReference)
    expect({
      status: transportStore.status,
      protocol: transportStore.protocol,
    }).toEqual(initialTransportState)
  })

  it('refreshes when daemon sync metadata changes even if counts stay the same', async () => {
    const getBootstrap = vi
      .fn()
      .mockResolvedValueOnce(createBootstrap())
      .mockResolvedValueOnce(
        createBootstrap({
          daemon: {
            status: 'connected',
            connectedPort: 37643,
            lastError: null,
            lastConnectedAt: '2026-03-24T23:41:00.000Z',
            lastSyncAt: '2026-03-24T23:46:01.000Z',
            nextRetryDelayMs: null,
          },
        }),
      )

    const { store } = createStoreHarness({
      getBootstrap,
      getRuntimeInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
    })

    await store.refresh()
    await store.refresh()

    expect(store.foundation.daemon.lastSyncAt).toBe('2026-03-24T23:46:01.000Z')
  })

  it('applies incremental foundation updates without refetching the full bootstrap', () => {
    const { store, sessionStore, transportStore } = createStoreHarness({
      getBootstrap: vi.fn().mockResolvedValue(createBootstrap()),
      getRuntimeInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
    })

    store.foundation = createBootstrap()
    store.hasLoadedFoundation = true
    sessionStore.hydrateSessions(store.foundation.sessions)
    const initialSessionsReference = sessionStore.sessions

    const payload: FoundationChangedPayload = {
      refreshedAt: '2026-04-04T19:00:00.000Z',
      changes: {
        daemon: {
          status: 'reconnecting',
          connectedPort: null,
          lastError: 'Daemon authentication credentials are unavailable.',
          lastConnectedAt: null,
          lastSyncAt: null,
          nextRetryDelayMs: 30_000,
        },
        factoryModels: [
          { id: 'gpt-5.4', name: 'GPT 5.4' },
          { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
        ],
        factoryDefaultSettings: {
          model: 'claude-opus-4-6',
          interactionMode: 'spec',
        },
        sessions: {
          upserted: [
            {
              id: 'session-alpha',
              projectId: 'project-alpha',
              projectWorkspacePath: '/tmp/project-alpha',
              projectDisplayName: null,
              parentSessionId: null,
              derivationType: null,
              modelId: 'claude-opus-4-6',
              title: 'Alpha session renamed',
              status: 'waiting',
              transport: 'artifacts',
              createdAt: '2026-03-24T23:30:00.000Z',
              lastActivityAt: '2026-03-24T23:50:00.000Z',
              updatedAt: '2026-03-24T23:50:00.000Z',
            },
            {
              id: 'session-beta',
              projectId: 'project-beta',
              projectWorkspacePath: '/tmp/project-beta',
              projectDisplayName: null,
              parentSessionId: null,
              derivationType: null,
              modelId: 'claude-opus-4-6',
              title: 'Beta session',
              status: 'active',
              transport: 'artifacts',
              createdAt: '2026-03-24T23:45:00.000Z',
              lastActivityAt: '2026-03-24T23:55:00.000Z',
              updatedAt: '2026-03-24T23:55:00.000Z',
            },
          ],
          removedIds: [],
        },
      },
    }

    store.applyUpdate(payload)

    expect(store.foundation.daemon.status).toBe('reconnecting')
    expect(store.factoryModels).toEqual(payload.changes?.factoryModels)
    expect(store.factoryDefaultSettings).toEqual(payload.changes?.factoryDefaultSettings)
    expect(sessionStore.sessions).not.toBe(initialSessionsReference)
    expect(sessionStore.sessions.map((session) => session.id)).toEqual([
      'session-beta',
      'session-alpha',
    ])
    expect(sessionStore.sessions.find((session) => session.id === 'session-alpha')?.title).toBe(
      'Alpha session renamed',
    )
    expect(transportStore.status).toBe('reconnecting')
  })

  it('keeps the foundation object reference stable for session-only incremental updates', () => {
    const { store, sessionStore } = createStoreHarness({
      getBootstrap: vi.fn().mockResolvedValue(createBootstrap()),
      getRuntimeInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
    })

    store.foundation = createBootstrap()
    store.hasLoadedFoundation = true
    sessionStore.hydrateSessions(store.foundation.sessions)

    const initialFoundationReference = store.foundation

    store.applyUpdate({
      refreshedAt: '2026-04-04T19:00:00.000Z',
      changes: {
        sessions: {
          upserted: [
            {
              id: 'session-beta',
              projectId: 'project-beta',
              projectWorkspacePath: '/tmp/project-beta',
              projectDisplayName: null,
              parentSessionId: null,
              derivationType: null,
              modelId: 'gpt-5.4',
              title: 'Beta session',
              status: 'active',
              transport: 'artifacts',
              createdAt: '2026-03-24T23:45:00.000Z',
              lastActivityAt: '2026-03-24T23:55:00.000Z',
              updatedAt: '2026-03-24T23:55:00.000Z',
            },
          ],
          removedIds: [],
        },
      },
    })

    expect(store.foundation).toBe(initialFoundationReference)
    expect(sessionStore.sessions.map((session) => session.id)).toEqual([
      'session-beta',
      'session-alpha',
    ])
  })

  it('captures refresh failures and exposes error computeds', async () => {
    const { store } = createStoreHarness({
      getBootstrap: vi.fn().mockRejectedValue(new Error('Bootstrap unavailable')),
      getRuntimeInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
    })

    await store.refresh()

    expect(store.hasLoadedFoundation).toBe(false)
    expect(store.foundationLoadError).toBe('Bootstrap unavailable')
    expect(store.hasError).toBe(true)
    expect(store.isLoading).toBe(false)
    expect(store.isDroidMissing).toBe(false)
  })

  it('resets dependent store state when a later refresh fails', async () => {
    const getBootstrap = vi
      .fn()
      .mockResolvedValueOnce(createBootstrap())
      .mockRejectedValueOnce(new Error('Bootstrap unavailable'))

    const { store, sessionStore, transportStore } = createStoreHarness({
      getBootstrap,
      getRuntimeInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
    })

    await store.refresh()
    await store.refresh()

    expect(store.foundationLoadError).toBe('Bootstrap unavailable')
    expect(sessionStore.sessions).toHaveLength(0)
    expect(transportStore.status).toBe('disconnected')
  })

  it('initializes runtime only once', async () => {
    const getInfo = vi.fn().mockResolvedValue(RUNTIME_INFO)

    const bus = createStoreEventBus()
    const store = new FoundationStore(bus, {
      getBootstrap: vi.fn().mockResolvedValue(createBootstrap()),
      getRuntimeInfo: getInfo,
    })

    await store.initRuntime()
    await store.initRuntime()

    expect(getInfo).toHaveBeenCalledTimes(1)
  })

  it('does not read from the ambient bridge when no foundation bridge is provided', async () => {
    const getBootstrap = vi.fn().mockResolvedValue(createBootstrap())
    const getInfo = vi.fn().mockResolvedValue(RUNTIME_INFO)

    window.oxox = {
      foundation: {
        getBootstrap,
      },
      runtime: {
        getInfo,
      },
    } as OxoxBridge

    const bus = createStoreEventBus()
    const store = new FoundationStore(bus)

    await store.refresh()
    await store.initRuntime()

    expect(getBootstrap).not.toHaveBeenCalled()
    expect(getInfo).not.toHaveBeenCalled()
    expect(store.foundationLoadError).toBe('Unable to load session data.')
  })
})
