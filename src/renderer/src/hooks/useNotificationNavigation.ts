import type { NotificationNavigationPayload } from '../../../shared/ipc/contracts'
import type { PlatformApiClient } from '../platform/apiClient'
import { useMountEffect } from './useMountEffect'

export type NotificationNavigationAppApi = PlatformApiClient['app']

interface UseNotificationNavigationOptions {
  liveSessionStore: {
    refreshSnapshot: (sessionId: string) => Promise<void>
    snapshotsById: Map<string, unknown>
  }
  transcriptStore: {
    openSession: (sessionId: string) => Promise<void>
  }
  onSelectSession: (sessionId: string) => void
  appApi: NotificationNavigationAppApi
}

export function useNotificationNavigation({
  appApi,
  liveSessionStore,
  transcriptStore,
  onSelectSession,
}: UseNotificationNavigationOptions): void {
  useMountEffect(() => {
    const unsubscribe = appApi.onNotificationNavigation?.(
      async ({ sessionId }: NotificationNavigationPayload) => {
        const normalizedSessionId = sessionId.trim()
        if (!normalizedSessionId) return
        await liveSessionStore.refreshSnapshot(normalizedSessionId)
        if (!liveSessionStore.snapshotsById.get(normalizedSessionId)) {
          await transcriptStore.openSession(normalizedSessionId)
        }
        onSelectSession(normalizedSessionId)
      },
    )

    return () => unsubscribe?.()
  })
}
