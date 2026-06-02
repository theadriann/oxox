import { batch, type Observable, observable } from '@legendapp/state'
import type {
  LiveSessionEventBatchPayload,
  LiveSessionEventRecord,
  LiveSessionMessage,
  LiveSessionSnapshot,
} from '../../../shared/ipc/contracts'
import {
  appendLiveTimelineEvents,
  createLiveTimelineAccumulator,
  type LiveTimelineAccumulator,
  syncLiveTimelineAccumulator,
} from '../components/transcript/liveTimelineAccumulator'
import type { TimelineItem } from '../components/transcript/timelineTypes'
import { logTranscriptPerformanceEvent } from '../diagnostics/transcriptPerformance'

import { toSessionRecord } from './liveSessionRecord'
import type { SessionPreview } from './SessionStore'
import type { StoreEventBus } from './storeEventBus'

type SnapshotLoader = (sessionId: string) => Promise<LiveSessionSnapshot | null>
type SelectedSessionIdReader = () => string | null
type SessionPreviewReader = (sessionId: string) => SessionPreview | undefined
const EMPTY_SNAPSHOT_LOADER: SnapshotLoader = async () => null
const EMPTY_SELECTED_SESSION_ID_READER: SelectedSessionIdReader = () => null
const EMPTY_SESSION_PREVIEW_READER: SessionPreviewReader = () => undefined

interface LiveSessionState {
  snapshotsById: Record<string, LiveSessionSnapshot>
  timelineItemsById: Record<string, TimelineItem[]>
}

export class LiveSessionStore {
  readonly state$: Observable<LiveSessionState> = observable({
    snapshotsById: {},
    timelineItemsById: {},
  })

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

function sumDeltaChars(events: LiveSessionEventRecord[]): number {
  return events.reduce((total, event) => {
    if (event.type !== 'message.delta') {
      return total
    }

    return total + event.delta.length
  }, 0)
}

function applyEventsToSnapshot(
  previousSnapshot: LiveSessionSnapshot,
  events: LiveSessionEventRecord[],
): LiveSessionSnapshot {
  let nextSnapshot: LiveSessionSnapshot = {
    ...previousSnapshot,
    events: [...previousSnapshot.events, ...events],
  }

  for (const event of events) {
    nextSnapshot = applyEventToSnapshot(nextSnapshot, event)
  }

  return nextSnapshot
}

function applyEventToSnapshot(
  snapshot: LiveSessionSnapshot,
  event: LiveSessionEventRecord,
): LiveSessionSnapshot {
  switch (event.type) {
    case 'message.completed':
      return {
        ...snapshot,
        messages: upsertMessage(snapshot.messages, {
          id: event.messageId,
          role: event.role,
          content: event.content,
          rewindBoundaryMessageId: event.rewindBoundaryMessageId,
          contentBlocks: event.contentBlocks,
        }),
      }
    case 'session.statusChanged':
      return {
        ...snapshot,
        status: event.status,
      }
    case 'session.titleChanged':
      return {
        ...snapshot,
        title: event.title,
      }
    case 'session.settingsChanged':
      return {
        ...snapshot,
        settings: {
          ...snapshot.settings,
          ...event.settings,
        },
      }
    case 'stream.completed':
      return {
        ...snapshot,
        status: event.reason === 'turn_complete' ? 'idle' : 'completed',
        processId: event.reason === 'turn_complete' ? snapshot.processId : null,
      }
    case 'stream.error':
      return {
        ...snapshot,
        status: event.recoverable ? 'reconnecting' : 'error',
        processId: null,
      }
    case 'session.result':
      return {
        ...snapshot,
        status: event.success ? 'idle' : 'error',
      }
    default:
      return snapshot
  }
}

function upsertMessage(
  messages: LiveSessionMessage[],
  nextMessage: LiveSessionMessage,
): LiveSessionMessage[] {
  const existingIndex = messages.findIndex((message) => message.id === nextMessage.id)

  if (existingIndex < 0) {
    return [...messages, nextMessage]
  }

  return messages.map((message, index) => (index === existingIndex ? nextMessage : message))
}

function snapshotChanged(
  previousSnapshot: LiveSessionSnapshot | undefined,
  nextSnapshot: LiveSessionSnapshot,
): boolean {
  if (!previousSnapshot) {
    return true
  }

  return (
    previousSnapshot.status !== nextSnapshot.status ||
    previousSnapshot.title !== nextSnapshot.title ||
    previousSnapshot.events.length !== nextSnapshot.events.length ||
    lastEventSignature(previousSnapshot) !== lastEventSignature(nextSnapshot) ||
    previousSnapshot.messages.length !== nextSnapshot.messages.length ||
    lastMessageSignature(previousSnapshot) !== lastMessageSignature(nextSnapshot) ||
    (previousSnapshot.transcriptRevision ?? 0) !== (nextSnapshot.transcriptRevision ?? 0) ||
    previousSnapshot.settings.modelId !== nextSnapshot.settings.modelId ||
    previousSnapshot.settings.interactionMode !== nextSnapshot.settings.interactionMode ||
    previousSnapshot.settings.reasoningEffort !== nextSnapshot.settings.reasoningEffort ||
    previousSnapshot.settings.autonomyLevel !== nextSnapshot.settings.autonomyLevel ||
    previousSnapshot.settings.autonomyMode !== nextSnapshot.settings.autonomyMode ||
    previousSnapshot.settings.specModeModelId !== nextSnapshot.settings.specModeModelId ||
    previousSnapshot.settings.specModeReasoningEffort !==
      nextSnapshot.settings.specModeReasoningEffort ||
    JSON.stringify(previousSnapshot.settings.enabledToolIds ?? []) !==
      JSON.stringify(nextSnapshot.settings.enabledToolIds ?? []) ||
    JSON.stringify(previousSnapshot.settings.disabledToolIds ?? []) !==
      JSON.stringify(nextSnapshot.settings.disabledToolIds ?? []) ||
    previousSnapshot.viewerCount !== nextSnapshot.viewerCount ||
    availableModelsSignature(previousSnapshot.availableModels) !==
      availableModelsSignature(nextSnapshot.availableModels)
  )
}

function availableModelsSignature(snapshotModels: LiveSessionSnapshot['availableModels']): string {
  return snapshotModels
    .map(
      (model) =>
        `${model.id}:${model.name}:${(model.supportedReasoningEfforts ?? []).join(',')}:${model.defaultReasoningEffort ?? ''}`,
    )
    .join('|')
}

function lastMessageSignature(snapshot: LiveSessionSnapshot): string {
  const lastMessage = snapshot.messages.at(-1)

  return lastMessage
    ? `${lastMessage.id}:${lastMessage.role ?? ''}:${lastMessage.content}:${JSON.stringify(lastMessage.contentBlocks ?? [])}`
    : ''
}

function lastEventSignature(snapshot: LiveSessionSnapshot): string {
  const lastEvent = snapshot.events.at(-1)

  return lastEvent ? JSON.stringify(lastEvent) : ''
}
