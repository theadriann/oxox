import { useEffect } from 'react'

import type {
  LiveSessionSnapshot,
  LiveSessionSnapshotChangedPayload,
} from '../../../shared/ipc/contracts'

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
  const selectedSnapshotId = liveSessionStore.selectedSnapshotId

  useEffect(() => {
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
  }, [liveSessionStore, selectedSnapshotId, sessionApi])
}
