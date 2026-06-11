import { type Observable, observable } from '@legendapp/state'
import type { SessionSearchMatch } from '../../../../../shared/ipc/contracts'
import type { DatePreset, OperatorChip, SearchScope } from './full-page-search.helpers'

export interface FullPageSearchChip extends OperatorChip {
  id: string
}

export interface FullPageSearchState {
  inputText: string
  chips: FullPageSearchChip[]
  scope: SearchScope
  selectedStatuses: string[]
  selectedProjects: string[]
  selectedSources: string[]
  datePreset: DatePreset
  projectSearchQuery: string
  matches: SessionSearchMatch[]
  isSearching: boolean
  error: string | null
  hasSearched: boolean
  selectedItemId: string | null
  previewItemId: string | null
}

export function createDefaultFullPageSearchState(): FullPageSearchState {
  return {
    inputText: '',
    chips: [],
    scope: 'all',
    selectedStatuses: [],
    selectedProjects: [],
    selectedSources: [],
    datePreset: 'any',
    projectSearchQuery: '',
    matches: [],
    isSearching: false,
    error: null,
    hasSearched: false,
    selectedItemId: null,
    previewItemId: null,
  }
}

export function createFullPageSearchState$(): Observable<FullPageSearchState> {
  return observable(createDefaultFullPageSearchState())
}
