import { type Observable, observable } from '@legendapp/state'
import type { SessionState } from './session.types'

export function createDefaultSessionState(): SessionState {
  return {
    sessions: [],
    selectedSessionId: '',
    hasHydratedSessions: false,
    missingSelectedSession: false,
    isDraftSelectionActive: false,
    pinnedSessionIds: [],
    projectDisplayNames: {},
    archivedSessionIds: [],
    archivedProjectKeys: [],
  }
}

export function createSessionState$(): Observable<SessionState> {
  return observable(createDefaultSessionState())
}
