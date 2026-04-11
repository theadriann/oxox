import { describe, expect, it } from 'vitest'

import type { FoundationBootstrap } from '../../../../shared/ipc/contracts'
import { createStoreEventBus } from '../storeEventBus'
import { TransportStore } from '../TransportStore'

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

describe('TransportStore', () => {
  it('hydrates transport state from foundation events through the bus', () => {
    const bus = createStoreEventBus()
    const store = new TransportStore()
    const disconnect = store.connectToEventBus(bus)

    bus.emit('foundation-hydrate', {
      bootstrap: createBootstrap(),
    })

    expect(store.status).toBe('connected')
    expect(store.protocol).toBe('daemon')

    disconnect()
  })

  it('sets protocol to artifacts when daemon is disconnected', () => {
    const bus = createStoreEventBus()
    const store = new TransportStore()
    const disconnect = store.connectToEventBus(bus)

    bus.emit('foundation-hydrate', {
      bootstrap: createBootstrap({
        daemon: {
          status: 'disconnected',
          connectedPort: null,
          lastError: null,
          lastConnectedAt: null,
          lastSyncAt: null,
          nextRetryDelayMs: null,
        },
      }),
    })

    expect(store.status).toBe('disconnected')
    expect(store.protocol).toBe('artifacts')

    disconnect()
  })
})
