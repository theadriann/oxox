import { type Observable, observable } from '@legendapp/state'
import type { SessionTranscript } from '../../../../shared/ipc/contracts'

export interface TranscriptState {
  transcriptsBySession: Record<string, SessionTranscript>
  refreshErrorsBySession: Record<string, string>
  refreshingSessionIds: string[]
}

export function createDefaultTranscriptState(): TranscriptState {
  return {
    transcriptsBySession: {},
    refreshErrorsBySession: {},
    refreshingSessionIds: [],
  }
}

export function createTranscriptState$(): Observable<TranscriptState> {
  return observable(createDefaultTranscriptState())
}
