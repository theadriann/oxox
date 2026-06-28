import { type Observable, observable } from '@legendapp/state'
import type { SessionSearchMatch } from '../../../../../shared/ipc/contracts'

export interface SessionSearchState {
  lastQuery: string
  matches: SessionSearchMatch[]
  isSearching: boolean
  error: string | null
}

export function createDefaultSessionSearchState(): SessionSearchState {
  return {
    lastQuery: '',
    matches: [],
    isSearching: false,
    error: null,
  }
}

export function createSessionSearchState$(): Observable<SessionSearchState> {
  return observable(createDefaultSessionSearchState())
}
