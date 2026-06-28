import { performance } from 'node:perf_hooks'

import { IPC_CHANNELS, type TranscriptPerformanceEvent } from '../shared/ipc/contracts'

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
  logPerformanceEvent?: (events: TranscriptPerformanceEvent[]) => void
}

const DEFAULT_COALESCE_WINDOW_MS = 50

export function createLiveSessionSnapshotBroadcaster({
  clearScheduled = clearTimeout,
  coalesceWindowMs = DEFAULT_COALESCE_WINDOW_MS,
  getAllWindows,
  getSessionSnapshot,
  isRendererAttachedToSession,
  logPerformanceEvent,
  schedule = setTimeout,
}: CreateLiveSessionSnapshotBroadcasterOptions) {
  const pendingSessionIds = new Set<string>()
  let timer: TimerHandle | null = null

  const flush = () => {
    timer = null
    const sessionIds = [...pendingSessionIds]
    pendingSessionIds.clear()

    for (const sessionId of sessionIds) {
      const startedAt = performance.now()
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

      logPerformanceEvent?.([
        {
          source: 'main',
          name: 'live_session_snapshot_sent',
          timestamp: new Date().toISOString(),
          sessionId,
          durationMs: performance.now() - startedAt,
          details: {
            subscriberCount: subscribedWindows.length,
            eventCount: Array.isArray((snapshot as { events?: unknown[] }).events)
              ? (snapshot as { events: unknown[] }).events.length
              : null,
            messageCount: Array.isArray((snapshot as { messages?: unknown[] }).messages)
              ? (snapshot as { messages: unknown[] }).messages.length
              : null,
          },
        },
      ])
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
