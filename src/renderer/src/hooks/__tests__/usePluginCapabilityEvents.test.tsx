// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { usePluginCapabilityEvents } from '../usePluginCapabilityEvents'

function PluginCapabilityEventsProbe({
  pluginApi,
  pluginCapabilityStore,
}: {
  pluginApi: {
    onCapabilitiesChanged?: (
      listener: (payload: { refreshedAt: string }) => void,
    ) => (() => void) | undefined
  }
  pluginCapabilityStore: {
    refresh: () => Promise<void>
  }
}) {
  usePluginCapabilityEvents({ pluginApi, pluginCapabilityStore })
  return null
}

describe('usePluginCapabilityEvents', () => {
  it('refreshes immediately and refreshes again when plugin capabilities change', async () => {
    const pluginCapabilityStore = {
      refresh: vi.fn().mockResolvedValue(undefined),
    }
    const unsubscribe = vi.fn()
    let capabilitiesListener: ((payload: { refreshedAt: string }) => void) | undefined
    const pluginApi = {
      onCapabilitiesChanged: vi.fn((listener: (payload: { refreshedAt: string }) => void) => {
        capabilitiesListener = listener
        return unsubscribe
      }),
    }

    const { unmount } = render(
      <PluginCapabilityEventsProbe
        pluginApi={pluginApi}
        pluginCapabilityStore={pluginCapabilityStore}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(pluginCapabilityStore.refresh).toHaveBeenCalledTimes(1)
    expect(pluginApi.onCapabilitiesChanged).toHaveBeenCalledTimes(1)

    await act(async () => {
      capabilitiesListener?.({ refreshedAt: '2026-04-01T18:00:00.000Z' })
      await Promise.resolve()
    })

    expect(pluginCapabilityStore.refresh).toHaveBeenCalledTimes(2)

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
