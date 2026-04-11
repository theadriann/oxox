import { useEffect } from 'react'

import type { PluginHostSnapshot } from '../../../shared/plugins/contracts'
import type { PlatformApiClient } from '../platform/apiClient'

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
  useEffect(() => {
    void pluginHostStore.refresh()
    const unsubscribe = pluginApi?.onHostChanged?.(({ snapshot }) => {
      pluginHostStore.applySnapshot(snapshot)
    })

    return () => {
      unsubscribe?.()
    }
  }, [pluginApi, pluginHostStore])
}
