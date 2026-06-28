import type { FoundationBootstrap, FoundationChangedPayload } from '../../../shared/ipc/contracts'
import { diffFoundationBootstraps } from '../../../shared/ipc/foundationUpdates'

export interface CreateFoundationChangeBroadcasterOptions {
  getSnapshot: () => FoundationBootstrap
  emit: (payload: FoundationChangedPayload) => void
}

export interface FoundationChangeBroadcaster {
  prime: (snapshot?: FoundationBootstrap) => void
  broadcast: () => void
}

export function createFoundationChangeBroadcaster({
  emit,
  getSnapshot,
}: CreateFoundationChangeBroadcasterOptions): FoundationChangeBroadcaster {
  let previousSnapshot: FoundationBootstrap | null = null

  return {
    prime: (snapshot = getSnapshot()) => {
      previousSnapshot = snapshot
    },
    broadcast: () => {
      const nextSnapshot = getSnapshot()

      if (!previousSnapshot) {
        previousSnapshot = nextSnapshot
        return
      }

      const changes = diffFoundationBootstraps(previousSnapshot, nextSnapshot)
      previousSnapshot = nextSnapshot

      if (!changes) {
        return
      }

      emit({
        refreshedAt: new Date().toISOString(),
        changes,
      })
    },
  }
}
