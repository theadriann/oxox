import { useEffect } from 'react'

import type { PlatformApiClient } from '../platform/apiClient'

interface UsePluginCapabilityEventsOptions {
  pluginApi?: PlatformApiClient['plugin']
  pluginCapabilityStore: {
    refresh: () => Promise<void>
  }
}

export function usePluginCapabilityEvents({
  pluginApi,
  pluginCapabilityStore,
}: UsePluginCapabilityEventsOptions): void {
  useEffect(() => {
    void pluginCapabilityStore.refresh()
    const unsubscribe = pluginApi?.onCapabilitiesChanged?.(() => {
      void pluginCapabilityStore.refresh()
    })

    return () => {
      unsubscribe?.()
    }
  }, [pluginApi, pluginCapabilityStore])
}
