import { useObserveEffect } from '@legendapp/state/react'
import { useRef } from 'react'
import type {
  LiveSessionEventBatchPayload,
  LiveSessionSnapshot,
  LiveSessionSnapshotChangedPayload,
} from '../../../shared/ipc/contracts'
import { logTranscriptPerformanceEvent } from '../diagnostics/transcriptPerformance'
import { useMountEffect } from './useMountEffect'

interface UseLiveSessionPollOptions {
  liveSessionStore: {
    selectedSnapshotId: string | null
    applyEventBatch?: (payload: LiveSessionEventBatchPayload) => void
    refreshSnapshot: (sessionId: string) => Promise<void>
    upsertSnapshot: (snapshot: LiveSessionSnapshot) => void
  }
  sessionApi?: {
    onSnapshotChanged?: (
      listener: (payload: LiveSessionSnapshotChangedPayload) => void,
    ) => (() => void) | undefined
    onEventBatch?: (
      listener: (payload: LiveSessionEventBatchPayload) => void,
    ) => (() => void) | undefined
  }
}

export function useLiveSessionPoll({
  liveSessionStore,
  sessionApi,
}: UseLiveSessionPollOptions): void {
  const selectedSnapshotIdRef = useRef<string | null>(null)

  useObserveEffect(() => {
    const selectedSnapshotId = liveSessionStore.selectedSnapshotId

    if (selectedSnapshotIdRef.current === selectedSnapshotId) {
      return
    }

    selectedSnapshotIdRef.current = selectedSnapshotId

    if (selectedSnapshotId) {
      void liveSessionStore.refreshSnapshot(selectedSnapshotId)
    }
  })

  useMountEffect(() => {
    let latestSnapshot: LiveSessionSnapshot | null = null
    let pendingEventBatch: LiveSessionEventBatchPayload | null = null
    let pendingFrameId: number | null = null
    let pendingTimeoutId: ReturnType<typeof setTimeout> | null = null

    const flushLatestSnapshot = () => {
      const startedAt = performance.now()
      pendingFrameId = null
      pendingTimeoutId = null

      if (!latestSnapshot) {
        if (pendingEventBatch) {
          const eventBatch = pendingEventBatch
          pendingEventBatch = null
          if (eventBatch.sessionId !== selectedSnapshotIdRef.current) {
            return
          }

          liveSessionStore.applyEventBatch?.(eventBatch)
          logTranscriptPerformanceEvent({
            name: 'live_session_event_batch_flushed',
            sessionId: eventBatch.sessionId,
            durationMs: performance.now() - startedAt,
            details: {
              eventCount: eventBatch.events.length,
              sequenceStart: eventBatch.sequenceStart,
              sequenceEnd: eventBatch.sequenceEnd,
            },
          })
        }
        return
      }

      const snapshot = latestSnapshot
      latestSnapshot = null
      pendingEventBatch = null
      if (snapshot.sessionId !== selectedSnapshotIdRef.current) {
        return
      }

      liveSessionStore.upsertSnapshot(snapshot)
      logTranscriptPerformanceEvent({
        name: 'live_session_snapshot_flushed',
        sessionId: snapshot.sessionId,
        durationMs: performance.now() - startedAt,
        details: {
          eventCount: snapshot.events.length,
          messageCount: snapshot.messages.length,
        },
      })
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
      const selectedSnapshotId = selectedSnapshotIdRef.current
      if (snapshot.sessionId !== selectedSnapshotId) {
        return
      }

      latestSnapshot = snapshot
      logTranscriptPerformanceEvent({
        name: 'live_session_snapshot_received',
        sessionId: snapshot.sessionId,
        details: {
          eventCount: snapshot.events.length,
          messageCount: snapshot.messages.length,
        },
      })
      scheduleFlush()
    })
    const unsubscribeEventBatch = sessionApi?.onEventBatch?.((payload) => {
      const selectedSnapshotId = selectedSnapshotIdRef.current
      if (payload.sessionId !== selectedSnapshotId || payload.events.length === 0) {
        return
      }

      pendingEventBatch = mergeEventBatches(pendingEventBatch, payload)
      logTranscriptPerformanceEvent({
        name: 'live_session_event_batch_received',
        sessionId: payload.sessionId,
        details: {
          eventCount: payload.events.length,
          sequenceStart: payload.sequenceStart,
          sequenceEnd: payload.sequenceEnd,
        },
      })
      scheduleFlush()
    })

    return () => {
      unsubscribe?.()
      unsubscribeEventBatch?.()

      if (pendingFrameId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrameId)
      }

      if (pendingTimeoutId !== null) {
        clearTimeout(pendingTimeoutId)
      }
    }
  })
}

function mergeEventBatches(
  previous: LiveSessionEventBatchPayload | null,
  next: LiveSessionEventBatchPayload,
): LiveSessionEventBatchPayload {
  if (!previous) {
    return {
      ...next,
      events: [...next.events],
    }
  }

  return {
    sessionId: next.sessionId,
    sequenceStart: Math.min(previous.sequenceStart, next.sequenceStart),
    sequenceEnd: Math.max(previous.sequenceEnd, next.sequenceEnd),
    events: [...previous.events, ...next.events],
  }
}
