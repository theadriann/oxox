import { type Observable, observable } from '@legendapp/state'
import type { SessionTranscript } from '../../../../shared/ipc/contracts'

export interface TranscriptState {
  transcriptsBySession: Record<string, SessionTranscript>
  transcriptRevisionsBySession: Record<string, number>
  refreshErrorsBySession: Record<string, string>
  refreshingSessionIds: string[]
}

export function createDefaultTranscriptState(): TranscriptState {
  return {
    transcriptsBySession: {},
    transcriptRevisionsBySession: {},
    refreshErrorsBySession: {},
    refreshingSessionIds: [],
  }
}

export function createTranscriptState$(): Observable<TranscriptState> {
  return observable(createDefaultTranscriptState())
}
