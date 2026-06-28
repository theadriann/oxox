import type { AppUpdateStateChangedPayload } from '../../../shared/ipc/contracts'
import type { PlatformApiClient } from '../platform/apiClient'
import { useMountEffect } from './useMountEffect'

interface UseAppUpdateEventsOptions {
  appApi: PlatformApiClient['app']
  updateStore: {
    refresh: () => Promise<void>
    applySnapshot: (snapshot: AppUpdateStateChangedPayload['snapshot']) => void
  }
}

export function useAppUpdateEvents({ appApi, updateStore }: UseAppUpdateEventsOptions): void {
  useMountEffect(() => {
    void updateStore.refresh()
    const unsubscribe = appApi.onUpdateStateChanged?.(({ snapshot }) => {
      updateStore.applySnapshot(snapshot)
    })

    return () => {
      unsubscribe?.()
    }
  })
}
