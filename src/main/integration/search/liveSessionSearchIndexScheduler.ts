type TimerHandle = ReturnType<typeof setTimeout>

export interface CreateLiveSessionSearchIndexSchedulerOptions<TSnapshot> {
  getSessionSnapshot: (sessionId: string) => TSnapshot | null
  scheduleLiveSnapshotUpdate: (snapshot: TSnapshot) => void
  schedule?: (callback: () => void, delayMs: number) => TimerHandle
  clearScheduled?: (timer: TimerHandle) => void
  debounceMs?: number
}

const DEFAULT_DEBOUNCE_MS = 250

export function createLiveSessionSearchIndexScheduler<TSnapshot>({
  clearScheduled = clearTimeout,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  getSessionSnapshot,
  schedule = setTimeout,
  scheduleLiveSnapshotUpdate,
}: CreateLiveSessionSearchIndexSchedulerOptions<TSnapshot>) {
  const pendingSessionIds = new Set<string>()
  let timer: TimerHandle | null = null

  const flush = () => {
    timer = null
    const sessionIds = [...pendingSessionIds]
    pendingSessionIds.clear()

    for (const sessionId of sessionIds) {
      const snapshot = getSessionSnapshot(sessionId)

      if (snapshot) {
        scheduleLiveSnapshotUpdate(snapshot)
      }
    }
  }

  const ensureScheduled = () => {
    if (timer !== null) {
      return
    }

    timer = schedule(flush, debounceMs)
  }

  return {
    schedule: (sessionId: string) => {
      pendingSessionIds.add(sessionId)
      ensureScheduled()
    },
    dispose: () => {
      pendingSessionIds.clear()

      if (timer !== null) {
        clearScheduled(timer)
        timer = null
      }
    },
  }
}
