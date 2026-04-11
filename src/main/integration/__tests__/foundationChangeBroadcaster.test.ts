import { describe, expect, it, vi } from 'vitest'

import type { FoundationBootstrap } from '../../../shared/ipc/contracts'
import { createFoundationChangeBroadcaster } from '../foundation/changeBroadcaster'

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
        parentSessionId: null,
        derivationType: null,
        modelId: 'gpt-5.4',
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

describe('createFoundationChangeBroadcaster', () => {
  it('suppresses no-op broadcasts and emits only changed slices', () => {
    const initial = createBootstrap()
    const initialSession = initial.sessions[0]

    if (!initialSession) {
      throw new Error('Expected initial session fixture')
    }

    const modelsChanged = createBootstrap({
      factoryModels: [
        { id: 'gpt-5.4', name: 'GPT 5.4' },
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      ],
      factoryDefaultSettings: {
        model: 'claude-opus-4-6',
        interactionMode: 'spec',
      },
    })
    const sessionChanged = createBootstrap({
      factoryModels: modelsChanged.factoryModels,
      factoryDefaultSettings: modelsChanged.factoryDefaultSettings,
      sessions: [
        {
          ...initialSession,
          title: 'Renamed alpha session',
          updatedAt: '2026-03-24T23:45:00.000Z',
          lastActivityAt: '2026-03-24T23:45:00.000Z',
        },
      ],
    })

    const getSnapshot = vi
      .fn<() => FoundationBootstrap>()
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce(modelsChanged)
      .mockReturnValueOnce(modelsChanged)
      .mockReturnValueOnce(sessionChanged)
    const emit = vi.fn()

    const broadcaster = createFoundationChangeBroadcaster({ emit, getSnapshot })

    broadcaster.prime()
    broadcaster.broadcast()
    broadcaster.broadcast()
    broadcaster.broadcast()
    broadcaster.broadcast()

    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        changes: {
          factoryModels: modelsChanged.factoryModels,
          factoryDefaultSettings: modelsChanged.factoryDefaultSettings,
        },
      }),
    )
    expect(emit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        changes: {
          sessions: {
            upserted: sessionChanged.sessions,
            removedIds: [],
          },
        },
      }),
    )
  })
})
