import { describe, expect, it, vi } from 'vitest'

import type { PluginHostSnapshot } from '../../../../shared/plugins/contracts'
import { PluginHostStore } from '../PluginHostStore'

function createHostSnapshot(overrides: Partial<PluginHostSnapshot> = {}): PluginHostSnapshot {
  return {
    pluginId: 'plugin.example',
    processId: 4242,
    status: 'running',
    lastError: null,
    ...overrides,
  }
}

describe('PluginHostStore', () => {
  it('refreshes host snapshots through an injected loader and exposes computed state', async () => {
    const listHosts = vi
      .fn()
      .mockResolvedValue([createHostSnapshot(), createHostSnapshot({ pluginId: 'plugin.two' })])
    const store = new PluginHostStore(listHosts)

    await store.refresh()

    expect(listHosts).toHaveBeenCalledTimes(1)
    expect(store.hosts).toEqual([
      createHostSnapshot(),
      createHostSnapshot({ pluginId: 'plugin.two' }),
    ])
    expect(store.runningHosts).toEqual([
      createHostSnapshot(),
      createHostSnapshot({ pluginId: 'plugin.two' }),
    ])
    expect(store.refreshError).toBeNull()
  })

  it('applies incremental host snapshots and captures refresh failures', async () => {
    const listHosts = vi.fn().mockRejectedValue(new Error('Plugin host list unavailable'))
    const store = new PluginHostStore(listHosts)

    await store.refresh()

    expect(store.refreshError).toBe('Plugin host list unavailable')
    expect(store.hosts).toEqual([])

    store.applySnapshot(createHostSnapshot({ pluginId: 'plugin.recovered', status: 'error' }))

    expect(store.hosts).toEqual([
      createHostSnapshot({ pluginId: 'plugin.recovered', status: 'error' }),
    ])
    expect(store.runningHosts).toEqual([])
  })
})
