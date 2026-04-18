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

    if (!selectedSnapshotId) {
      return
    }

    void liveSessionStore.refreshSnapshot(selectedSnapshotId)

    return sessionApi?.onSnapshotChanged?.(({ snapshot }) => {
      if (snapshot.sessionId !== selectedSnapshotId) {
        return
      }

      liveSessionStore.upsertSnapshot(snapshot)
    })
  })
}
