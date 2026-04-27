import { IPC_CHANNELS } from '../shared/ipc/contracts'

interface BrowserWindowLike {
  isDestroyed: () => boolean
  webContents: {
    id: number
    send: (channel: string, payload: unknown) => void
  }
}

type TimerHandle = ReturnType<typeof setTimeout>

export interface CreateLiveSessionSnapshotBroadcasterOptions {
  getAllWindows: () => BrowserWindowLike[]
  getSessionSnapshot: (sessionId: string) => unknown
  isRendererAttachedToSession: (webContentsId: number, sessionId: string) => boolean
  schedule?: (callback: () => void, delayMs: number) => TimerHandle
  clearScheduled?: (timer: TimerHandle) => void
  coalesceWindowMs?: number
}

const DEFAULT_COALESCE_WINDOW_MS = 50

export function createLiveSessionSnapshotBroadcaster({
  clearScheduled = clearTimeout,
  coalesceWindowMs = DEFAULT_COALESCE_WINDOW_MS,
  getAllWindows,
  getSessionSnapshot,
  isRendererAttachedToSession,
  schedule = setTimeout,
}: CreateLiveSessionSnapshotBroadcasterOptions) {
  const pendingSessionIds = new Set<string>()
  let timer: TimerHandle | null = null

  const flush = () => {
    timer = null
    const sessionIds = [...pendingSessionIds]
    pendingSessionIds.clear()

    for (const sessionId of sessionIds) {
      const subscribedWindows = getAllWindows().filter(
        (window) =>
          !window.isDestroyed() && isRendererAttachedToSession(window.webContents.id, sessionId),
      )

      if (subscribedWindows.length === 0) {
        continue
      }

      const snapshot = getSessionSnapshot(sessionId)

      if (!snapshot) {
        continue
      }

      for (const window of subscribedWindows) {
        window.webContents.send(IPC_CHANNELS.sessionSnapshotChanged, { snapshot })
      }
    }
  }

  const ensureScheduled = () => {
    if (timer !== null) {
      return
    }

    timer = schedule(flush, coalesceWindowMs)
  }

  return {
    broadcast: ({ sessionId }: { sessionId: string }) => {
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
