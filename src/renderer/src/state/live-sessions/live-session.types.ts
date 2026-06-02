import type { LiveSessionSnapshot } from '../../../../shared/ipc/contracts'
import type { TimelineItem } from '../../components/transcript/timelineTypes'
import type { SessionPreview } from '../sessions/session.model'

export type SnapshotLoader = (sessionId: string) => Promise<LiveSessionSnapshot | null>
export type SelectedSessionIdReader = () => string | null
export type SessionPreviewReader = (sessionId: string) => SessionPreview | undefined

export interface LiveSessionState {
  snapshotsById: Record<string, LiveSessionSnapshot>
  timelineItemsById: Record<string, TimelineItem[]>
}
