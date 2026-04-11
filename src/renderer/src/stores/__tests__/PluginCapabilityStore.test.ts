import { describe, expect, it, vi } from 'vitest'

import type { PluginCapabilityRecord } from '../../../../../shared/plugins/contracts'
import { PluginCapabilityStore } from '../PluginCapabilityStore'

const CAPABILITIES: PluginCapabilityRecord[] = [
  {
    qualifiedId: 'plugin.example:open-dashboard',
    pluginId: 'plugin.example',
    kind: 'app-action',
    name: 'open-dashboard',
    displayName: 'Open Plugin Dashboard',
  },
  {
    qualifiedId: 'plugin.example:summarize',
    pluginId: 'plugin.example',
    kind: 'session-action',
    name: 'summarize',
    displayName: 'Summarize Session',
  },
]

describe('PluginCapabilityStore', () => {
  it('hydrates capability records and groups them by kind', async () => {
    const store = new PluginCapabilityStore(vi.fn().mockResolvedValue(CAPABILITIES), vi.fn())

    await store.refresh()

    expect(store.capabilities).toEqual(CAPABILITIES)
    expect(store.appActions).toEqual([CAPABILITIES[0]])
    expect(store.sessionActions).toEqual([CAPABILITIES[1]])
  })

  it('invokes capabilities through the injected bridge', async () => {
    const invokeCapability = vi.fn().mockResolvedValue({
      capabilityId: 'plugin.example:summarize',
      payload: { summary: 'Done' },
    })
    const store = new PluginCapabilityStore(
      vi.fn().mockResolvedValue(CAPABILITIES),
      invokeCapability,
    )

    await expect(
      store.invoke('plugin.example:summarize', {
        sessionId: 'session-1',
      }),
    ).resolves.toEqual({
      capabilityId: 'plugin.example:summarize',
      payload: { summary: 'Done' },
    })
    expect(invokeCapability).toHaveBeenCalledWith('plugin.example:summarize', {
      sessionId: 'session-1',
    })
    expect(store.invocationError).toBeNull()
  })
})
