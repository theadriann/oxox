import type { PlatformApiClient } from '../platform/apiClient'
import { useMountEffect } from './useMountEffect'

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
  useMountEffect(() => {
    void pluginCapabilityStore.refresh()
    const unsubscribe = pluginApi?.onCapabilitiesChanged?.(() => {
      void pluginCapabilityStore.refresh()
    })

    return () => {
      unsubscribe?.()
    }
  })
}
