import { makeAutoObservable, observable } from 'mobx'

import type { LiveSessionSnapshot } from '../../../shared/ipc/contracts'
import {
  createLiveTimelineAccumulator,
  type LiveTimelineAccumulator,
  syncLiveTimelineAccumulator,
} from '../components/transcript/liveTimelineAccumulator'
import type { TimelineItem } from '../components/transcript/timelineTypes'

import { toSessionRecord } from './liveSessionRecord'
import type { SessionPreview } from './SessionStore'
import type { StoreEventBus } from './storeEventBus'

type SnapshotLoader = (sessionId: string) => Promise<LiveSessionSnapshot | null>
type SelectedSessionIdReader = () => string | null
type SessionPreviewReader = (sessionId: string) => SessionPreview | undefined
const EMPTY_SNAPSHOT_LOADER: SnapshotLoader = async () => null
const EMPTY_SELECTED_SESSION_ID_READER: SelectedSessionIdReader = () => null
const EMPTY_SESSION_PREVIEW_READER: SessionPreviewReader = () => undefined

export class LiveSessionStore {
  snapshotsById = observable.map<string, LiveSessionSnapshot>()
  timelineItemsById = observable.map<string, TimelineItem[]>(undefined, { deep: false })

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

    makeAutoObservable(
      this,
      {
        getSelectedSessionId: false,
        bus: false,
        snapshotLoader: false,
        getSessionPreview: false,
        snapshotsById: false,
        timelineItemsById: false,
        timelineAccumulatorsById: false,
      },
      { autoBind: true },
    )
  }

  get selectedSnapshot(): LiveSessionSnapshot | null {
    const selectedSessionId = this.getSelectedSessionId()

    return selectedSessionId ? (this.snapshotsById.get(selectedSessionId) ?? null) : null
  }

  get selectedSnapshotId(): string | null {
    return this.selectedSnapshot?.sessionId ?? null
  }

  get selectedTimelineItems(): TimelineItem[] {
    const selectedSessionId = this.getSelectedSessionId()

    return selectedSessionId ? (this.timelineItemsById.get(selectedSessionId) ?? []) : []
  }

  get selectedNeedsReconnect(): boolean {
    const selectedSnapshot = this.selectedSnapshot

    return Boolean(
      selectedSnapshot &&
        (selectedSnapshot.status === 'reconnecting' || selectedSnapshot.status === 'error'),
    )
  }

  upsertSnapshot(snapshot: LiveSessionSnapshot): void {
    const previousSnapshot = this.snapshotsById.get(snapshot.sessionId)

    if (!snapshotChanged(previousSnapshot, snapshot)) {
      return
    }

    this.snapshotsById.set(snapshot.sessionId, snapshot)
    this.syncTimeline(snapshot)

    this.bus.emit('session-upsert', {
      record: toSessionRecord(snapshot, this.getSessionPreview(snapshot.sessionId)),
    })
  }

  clearSnapshot(sessionId: string): void {
    this.snapshotsById.delete(sessionId)
    this.timelineItemsById.delete(sessionId)
    this.timelineAccumulatorsById.delete(sessionId)
  }

  async refreshSnapshot(sessionId: string): Promise<void> {
    const snapshot = await this.snapshotLoader(sessionId)

    if (!snapshot) {
      return
    }

    const previousSnapshot = this.snapshotsById.get(sessionId)

    if (!snapshotChanged(previousSnapshot, snapshot)) {
      return
    }

    this.upsertSnapshot(snapshot)
  }

  timelineItemsForSession(sessionId: string): TimelineItem[] {
    return this.timelineItemsById.get(sessionId) ?? []
  }

  private syncTimeline(snapshot: LiveSessionSnapshot): void {
    const existingAccumulator = this.timelineAccumulatorsById.get(snapshot.sessionId)
    const accumulator = existingAccumulator ?? createLiveTimelineAccumulator()
    const { didChange, items } = syncLiveTimelineAccumulator(accumulator, snapshot)

    this.timelineAccumulatorsById.set(snapshot.sessionId, accumulator)

    if (!didChange) {
      return
    }

    this.timelineItemsById.set(snapshot.sessionId, [...items])
  }
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
