import type { PluginHostSnapshot } from '../../../shared/plugins/contracts'
import type { PlatformApiClient } from '../platform/apiClient'
import { useMountEffect } from './useMountEffect'

interface UsePluginHostEventsOptions {
  pluginApi?: PlatformApiClient['plugin']
  pluginHostStore: {
    refresh: () => Promise<void>
    applySnapshot: (snapshot: PluginHostSnapshot) => void
  }
}

export function usePluginHostEvents({
  pluginApi,
  pluginHostStore,
}: UsePluginHostEventsOptions): void {
  useMountEffect(() => {
    void pluginHostStore.refresh()
    const unsubscribe = pluginApi?.onHostChanged?.(({ snapshot }) => {
      pluginHostStore.applySnapshot(snapshot)
    })

    return () => {
      unsubscribe?.()
    }
  })
}
