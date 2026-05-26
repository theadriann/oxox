import { performance } from 'node:perf_hooks'

import {
  IPC_CHANNELS,
  type LiveSessionEventBatchPayload,
  type LiveSessionEventRecord,
  type TranscriptPerformanceEvent,
} from '../shared/ipc/contracts'

interface BrowserWindowLike {
  isDestroyed: () => boolean
  webContents: {
    id: number
    send: (channel: string, payload: unknown) => void
  }
}

type TimerHandle = ReturnType<typeof setTimeout>

export interface CreateLiveSessionEventBroadcasterOptions {
  getAllWindows: () => BrowserWindowLike[]
  isRendererAttachedToSession: (webContentsId: number, sessionId: string) => boolean
  schedule?: (callback: () => void, delayMs: number) => TimerHandle
  clearScheduled?: (timer: TimerHandle) => void
  coalesceWindowMs?: number
  logPerformanceEvent?: (events: TranscriptPerformanceEvent[]) => void
}

const DEFAULT_COALESCE_WINDOW_MS = 16

export function createLiveSessionEventBroadcaster({
  clearScheduled = clearTimeout,
  coalesceWindowMs = DEFAULT_COALESCE_WINDOW_MS,
  getAllWindows,
  isRendererAttachedToSession,
  logPerformanceEvent,
  schedule = setTimeout,
}: CreateLiveSessionEventBroadcasterOptions) {
  const pendingEventsBySessionId = new Map<string, LiveSessionEventRecord[]>()
  const nextSequenceBySessionId = new Map<string, number>()
  let timer: TimerHandle | null = null

  const flush = () => {
    timer = null
    const entries = [...pendingEventsBySessionId.entries()]
    pendingEventsBySessionId.clear()

    for (const [sessionId, events] of entries) {
      const startedAt = performance.now()
      if (events.length === 0) {
        continue
      }

      const subscribedWindows = getAllWindows().filter(
        (window) =>
          !window.isDestroyed() && isRendererAttachedToSession(window.webContents.id, sessionId),
      )

      if (subscribedWindows.length === 0) {
        logPerformanceEvent?.([
          {
            source: 'main',
            name: 'live_session_event_batch_dropped',
            timestamp: new Date().toISOString(),
            sessionId,
            details: {
              eventCount: events.length,
              reason: 'no_attached_renderer',
            },
          },
        ])
        continue
      }

      const sequenceStart = nextSequenceBySessionId.get(sessionId) ?? 1
      const sequenceEnd = sequenceStart + events.length - 1
      nextSequenceBySessionId.set(sessionId, sequenceEnd + 1)

      const payload: LiveSessionEventBatchPayload = {
        sessionId,
        sequenceStart,
        sequenceEnd,
        events,
      }

      for (const window of subscribedWindows) {
        window.webContents.send(IPC_CHANNELS.sessionEventBatch, payload)
      }

      logPerformanceEvent?.([
        {
          source: 'main',
          name: 'live_session_event_batch_sent',
          timestamp: new Date().toISOString(),
          sessionId,
          durationMs: performance.now() - startedAt,
          details: {
            eventCount: events.length,
            subscriberCount: subscribedWindows.length,
            sequenceStart,
            sequenceEnd,
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
    broadcast: ({ sessionId, event }: { sessionId: string; event: LiveSessionEventRecord }) => {
      const events = pendingEventsBySessionId.get(sessionId) ?? []
      events.push(event)
      pendingEventsBySessionId.set(sessionId, events)
      ensureScheduled()
    },
    dispose: () => {
      pendingEventsBySessionId.clear()

      if (timer !== null) {
        clearScheduled(timer)
        timer = null
      }
    },
  }
}
