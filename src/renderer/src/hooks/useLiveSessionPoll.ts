import type {
  LiveSessionSnapshot,
  LiveSessionSnapshotChangedPayload,
} from '../../../shared/ipc/contracts'
import { useObserveEffect } from '../stores/legend'

interface UseLiveSessionPollOptions {
  liveSessionStore: {
    selectedSnapshotId: string | null
    refreshSnapshot: (sessionId: string) => Promise<void>
    upsertSnapshot: (snapshot: LiveSessionSnapshot) => void
  }
  sessionApi?: {
    onSnapshotChanged?: (
      listener: (payload: LiveSessionSnapshotChangedPayload) => void,
    ) => (() => void) | undefined
  }
}

export function useLiveSessionPoll({
  liveSessionStore,
  sessionApi,
}: UseLiveSessionPollOptions): void {
  useObserveEffect(() => {
    const selectedSnapshotId = liveSessionStore.selectedSnapshotId
    let latestSnapshot: LiveSessionSnapshot | null = null
    let pendingFrameId: number | null = null
    let pendingTimeoutId: ReturnType<typeof setTimeout> | null = null

    if (!selectedSnapshotId) {
      return
    }

    void liveSessionStore.refreshSnapshot(selectedSnapshotId)

    const flushLatestSnapshot = () => {
      pendingFrameId = null
      pendingTimeoutId = null

      if (!latestSnapshot) {
        return
      }

      const snapshot = latestSnapshot
      latestSnapshot = null
      liveSessionStore.upsertSnapshot(snapshot)
    }

    const scheduleFlush = () => {
      if (pendingFrameId !== null || pendingTimeoutId !== null) {
        return
      }

      if (typeof requestAnimationFrame === 'function') {
        pendingFrameId = requestAnimationFrame(flushLatestSnapshot)
        return
      }

      pendingTimeoutId = setTimeout(flushLatestSnapshot, 16)
    }

    const unsubscribe = sessionApi?.onSnapshotChanged?.(({ snapshot }) => {
      if (snapshot.sessionId !== selectedSnapshotId) {
        return
      }

      latestSnapshot = snapshot
      scheduleFlush()
    })

    return () => {
      unsubscribe?.()

      if (pendingFrameId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrameId)
      }

      if (pendingTimeoutId !== null) {
        clearTimeout(pendingTimeoutId)
      }
    }
  })
}
