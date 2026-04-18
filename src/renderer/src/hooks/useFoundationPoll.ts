import type { FoundationChangedPayload } from '../../../shared/ipc/contracts'
import type { PlatformApiClient } from '../platform/apiClient'
import { useMountEffect } from './useMountEffect'

interface UseFoundationPollOptions {
  foundationApi?: PlatformApiClient['foundation']
  foundationStore: {
    initRuntime: () => Promise<void>
    refresh: () => Promise<void>
    applyUpdate: (payload: FoundationChangedPayload) => void
  }
}

export function useFoundationPoll({
  foundationApi,
  foundationStore,
}: UseFoundationPollOptions): void {
  useMountEffect(() => {
    void foundationStore.initRuntime()
    void foundationStore.refresh()
    const unsubscribe = foundationApi?.onChanged?.((payload) => {
      if (payload.changes) {
        foundationStore.applyUpdate(payload)
        return
      }

      void foundationStore.refresh()
    })

    return () => {
      unsubscribe?.()
    }
  })
}
