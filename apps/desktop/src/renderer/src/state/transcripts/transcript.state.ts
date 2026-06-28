import { type Observable, observable } from '@legendapp/state'
import type {
  SessionTranscript,
  SessionTranscriptScrollState,
} from '../../../../shared/ipc/contracts'

export interface TranscriptState {
  transcriptsBySession: Record<string, SessionTranscript>
  transcriptRevisionsBySession: Record<string, number>
  scrollStatesBySession: Record<string, SessionTranscriptScrollState | null>
  refreshErrorsBySession: Record<string, string>
  refreshingSessionIds: string[]
}

export function createDefaultTranscriptState(): TranscriptState {
  return {
    transcriptsBySession: {},
    transcriptRevisionsBySession: {},
    scrollStatesBySession: {},
    refreshErrorsBySession: {},
    refreshingSessionIds: [],
  }
}

export function createTranscriptState$(): Observable<TranscriptState> {
  return observable(createDefaultTranscriptState())
}
