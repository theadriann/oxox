import { batch, type Observable } from '@legendapp/state'
import type {
  LiveSessionEventBatchPayload,
  LiveSessionEventRecord,
  LiveSessionSnapshot,
} from '../../../../shared/ipc/contracts'
import {
  appendLiveTimelineEvents,
  createLiveTimelineAccumulator,
  type LiveTimelineAccumulator,
  syncLiveTimelineAccumulator,
} from '../../components/transcript/liveTimelineAccumulator'
import type { TimelineItem } from '../../components/transcript/timelineTypes'
import { logTranscriptPerformanceEvent } from '../../diagnostics/transcriptPerformance'
import type { StoreEventBus } from '../events/store-event-bus'
import { applyEventsToSnapshot, snapshotChanged, sumDeltaChars } from './live-session.selectors'
import { createLiveSessionState$ } from './live-session.state'
import type {
  LiveSessionState,
  SelectedSessionIdReader,
  SessionPreviewReader,
  SnapshotLoader,
} from './live-session.types'
import { toSessionRecord } from './live-session-record.factories'

const EMPTY_SNAPSHOT_LOADER: SnapshotLoader = async () => null
const EMPTY_SELECTED_SESSION_ID_READER: SelectedSessionIdReader = () => null
const EMPTY_SESSION_PREVIEW_READER: SessionPreviewReader = () => undefined

export class LiveSessionStore {
  readonly state$: Observable<LiveSessionState> = createLiveSessionState$()

  private readonly getSelectedSessionId: SelectedSessionIdReader
  private readonly bus: StoreEventBus
  private readonly snapshotLoader: SnapshotLoader
  private readonly getSessionPreview: SessionPreviewReader
  private readonly timelineAccumulatorsById = new Map<string, LiveTimelineAccumulator>()

  constructor(
    getSelectedSessionId: SelectedSessionIdReader = EMPTY_SELECTED_SESSION_ID_READER,
    bus: StoreEventBus,
    snapshotLoader: SnapshotLoader = EMPTY_SNAPSHOT_LOADER,
    getSessionPreview: SessionPreviewReader = EMPTY_SESSION_PREVIEW_READER,
  ) {
    this.getSelectedSessionId = getSelectedSessionId
    this.bus = bus
    this.snapshotLoader = snapshotLoader
    this.getSessionPreview = getSessionPreview
  }

  get selectedSnapshot(): LiveSessionSnapshot | null {
    const selectedSessionId = this.getSelectedSessionId()

    return selectedSessionId ? this.snapshotForSession(selectedSessionId) : null
  }

  get selectedSnapshotId(): string | null {
    return this.selectedSnapshot?.sessionId ?? null
  }

  get selectedTimelineItems(): TimelineItem[] {
    const selectedSessionId = this.getSelectedSessionId()

    return selectedSessionId ? this.timelineItemsForSession(selectedSessionId) : []
  }

  get selectedNeedsReconnect(): boolean {
    const selectedSnapshot = this.selectedSnapshot

    return Boolean(
      selectedSnapshot &&
        (selectedSnapshot.status === 'reconnecting' || selectedSnapshot.status === 'error'),
    )
  }

  upsertSnapshot = (snapshot: LiveSessionSnapshot): void => {
    const startedAt = performance.now()
    const previousSnapshot = this.snapshotForSession(snapshot.sessionId)

    if (!snapshotChanged(previousSnapshot, snapshot)) {
      return
    }

    batch(() => {
      this.state$.snapshotsById[snapshot.sessionId].set(snapshot)
      this.syncTimeline(snapshot)
    })

    this.bus.emit('session-upsert', {
      record: toSessionRecord(snapshot, this.getSessionPreview(snapshot.sessionId)),
    })
    logTranscriptPerformanceEvent({
      name: 'live_session_store_upsert_snapshot',
      sessionId: snapshot.sessionId,
      durationMs: performance.now() - startedAt,
      details: {
        eventCount: snapshot.events.length,
        messageCount: snapshot.messages.length,
        timelineItemCount: this.timelineItemsForSession(snapshot.sessionId).length,
      },
    })
  }

  applyEventBatch = (payload: LiveSessionEventBatchPayload): void => {
    const startedAt = performance.now()
    if (payload.events.length === 0) {
      return
    }

    const previousSnapshot = this.snapshotForSession(payload.sessionId)

    if (!previousSnapshot) {
      return
    }

    const nextSnapshot = applyEventsToSnapshot(previousSnapshot, payload.events)

    batch(() => {
      this.state$.snapshotsById[payload.sessionId].set(nextSnapshot)
      this.appendTimelineEvents(previousSnapshot, nextSnapshot, payload.events)
    })

    this.bus.emit('session-upsert', {
      record: toSessionRecord(nextSnapshot, this.getSessionPreview(nextSnapshot.sessionId)),
    })
    logTranscriptPerformanceEvent({
      name: 'live_session_store_apply_event_batch',
      sessionId: payload.sessionId,
      durationMs: performance.now() - startedAt,
      details: {
        batchEventCount: payload.events.length,
        snapshotEventCount: nextSnapshot.events.length,
        messageCount: nextSnapshot.messages.length,
        timelineItemCount: this.timelineItemsForSession(payload.sessionId).length,
        deltaCharCount: sumDeltaChars(payload.events),
        sequenceStart: payload.sequenceStart,
        sequenceEnd: payload.sequenceEnd,
      },
    })
  }

  clearSnapshot = (sessionId: string): void => {
    batch(() => {
      this.state$.snapshotsById[sessionId].delete()
      this.state$.timelineItemsById[sessionId].delete()
      this.timelineAccumulatorsById.delete(sessionId)
    })
  }

  refreshSnapshot = async (sessionId: string): Promise<void> => {
    const snapshot = await this.snapshotLoader(sessionId)

    if (!snapshot) {
      return
    }

    const previousSnapshot = this.snapshotForSession(sessionId)

    if (!snapshotChanged(previousSnapshot, snapshot)) {
      return
    }

    this.upsertSnapshot(snapshot)
  }

  snapshotForSession = (sessionId: string): LiveSessionSnapshot | null => {
    return this.state$.snapshotsById[sessionId].get() ?? null
  }

  hasSnapshot = (sessionId: string): boolean => {
    return this.snapshotForSession(sessionId) !== null
  }

  get snapshotCount(): number {
    return Object.keys(this.state$.snapshotsById.peek()).length
  }

  timelineItemsForSession = (sessionId: string): TimelineItem[] => {
    return this.state$.timelineItemsById[sessionId].get() ?? []
  }

  private syncTimeline(snapshot: LiveSessionSnapshot): void {
    const existingAccumulator = this.timelineAccumulatorsById.get(snapshot.sessionId)
    const accumulator = existingAccumulator ?? createLiveTimelineAccumulator()
    const { didChange, items } = syncLiveTimelineAccumulator(accumulator, snapshot)

    this.timelineAccumulatorsById.set(snapshot.sessionId, accumulator)

    if (!didChange) {
      return
    }

    this.state$.timelineItemsById[snapshot.sessionId].set([...items])
  }

  private appendTimelineEvents(
    previousSnapshot: LiveSessionSnapshot,
    snapshot: LiveSessionSnapshot,
    events: LiveSessionEventRecord[],
  ): void {
    const existingAccumulator = this.timelineAccumulatorsById.get(snapshot.sessionId)
    const accumulator = existingAccumulator ?? createLiveTimelineAccumulator(previousSnapshot)
    const { didChange, items } = appendLiveTimelineEvents(accumulator, snapshot, events)

    this.timelineAccumulatorsById.set(snapshot.sessionId, accumulator)

    if (!didChange) {
      return
    }

    this.state$.timelineItemsById[snapshot.sessionId].set([...items])
  }
}
