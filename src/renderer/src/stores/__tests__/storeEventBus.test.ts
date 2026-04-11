import { describe, expect, it, vi } from 'vitest'

import type { FoundationBootstrap, SessionRecord } from '../../../../shared/ipc/contracts'
import { createStoreEventBus } from '../storeEventBus'

function createSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-alpha',
    projectId: 'project-alpha',
    projectWorkspacePath: '/tmp/project-alpha',
    projectDisplayName: null,
    modelId: 'gpt-5.4',
    title: 'Alpha session',
    status: 'active',
    transport: 'artifacts',
    createdAt: '2026-03-24T23:30:00.000Z',
    lastActivityAt: '2026-03-24T23:40:00.000Z',
    updatedAt: '2026-03-24T23:40:00.000Z',
    ...overrides,
  }
}

function createBootstrap(overrides: Partial<FoundationBootstrap> = {}): FoundationBootstrap {
  return {
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
    ...overrides,
  }
}

describe('StoreEventBus', () => {
  it('delivers typed payloads to subscribers in registration order', () => {
    const bus = createStoreEventBus()
    const calls: string[] = []

    bus.subscribe('session-upsert', ({ record }) => {
      calls.push(record.id)
    })
    bus.subscribe('session-upsert', ({ record }) => {
      calls.push(`${record.id}:second`)
    })

    bus.emit('session-upsert', {
      record: createSessionRecord(),
    })

    expect(calls).toEqual(['session-alpha', 'session-alpha:second'])
  })

  it('stops delivering events after unsubscribe', () => {
    const bus = createStoreEventBus()
    const listener = vi.fn()
    const unsubscribe = bus.subscribe('foundation-hydrate', listener)

    unsubscribe()
    bus.emit('foundation-hydrate', {
      bootstrap: createBootstrap(),
    })

    expect(listener).not.toHaveBeenCalled()
  })
})
