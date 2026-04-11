// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PluginHostSnapshot } from '../../../../../shared/plugins/contracts'
import { usePluginHostEvents } from '../usePluginHostEvents'

function createHostSnapshot(overrides: Partial<PluginHostSnapshot> = {}): PluginHostSnapshot {
  return {
    pluginId: 'plugin.example',
    processId: 4242,
    status: 'running',
    lastError: null,
    ...overrides,
  }
}

function PluginHostEventsProbe({
  pluginApi,
  pluginHostStore,
}: {
  pluginApi: {
    onHostChanged?: (
      listener: (payload: { snapshot: PluginHostSnapshot }) => void,
    ) => (() => void) | undefined
  }
  pluginHostStore: {
    refresh: () => Promise<void>
    applySnapshot: (snapshot: PluginHostSnapshot) => void
  }
}) {
  usePluginHostEvents({ pluginApi, pluginHostStore })
  return null
}

describe('usePluginHostEvents', () => {
  it('refreshes immediately and applies plugin host updates from injected plugin events', async () => {
    const pluginHostStore = {
      refresh: vi.fn().mockResolvedValue(undefined),
      applySnapshot: vi.fn(),
    }
    const unsubscribe = vi.fn()
    let hostListener: ((payload: { snapshot: PluginHostSnapshot }) => void) | undefined
    const pluginApi = {
      onHostChanged: vi.fn((listener: (payload: { snapshot: PluginHostSnapshot }) => void) => {
        hostListener = listener
        return unsubscribe
      }),
    }

    const { unmount } = render(
      <PluginHostEventsProbe pluginApi={pluginApi} pluginHostStore={pluginHostStore} />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(pluginHostStore.refresh).toHaveBeenCalledTimes(1)
    expect(pluginApi.onHostChanged).toHaveBeenCalledTimes(1)

    await act(async () => {
      hostListener?.({ snapshot: createHostSnapshot({ pluginId: 'plugin.updated' }) })
      await Promise.resolve()
    })

    expect(pluginHostStore.applySnapshot).toHaveBeenCalledWith(
      createHostSnapshot({ pluginId: 'plugin.updated' }),
    )

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
