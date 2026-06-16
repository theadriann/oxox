import { type Observable, observable } from '@legendapp/state'
import { DEFAULT_SIDEBAR_FILTERS, type SidebarFilters } from './sessionFiltering'

export interface SessionSidebarState {
  now: number
  focusedItemKey: string | null
  expandedProjectKeys: Record<string, true>
  projectRevealCounts: Record<string, number>
  editingProjectKey: string | null
  draftProjectName: string
  editingFolderId: string | null
  draftFolderName: string
  searchQueryDraft: string
  filters: SidebarFilters
  isFilterPanelOpen: boolean
  isSearchOpen: boolean
}

export function createDefaultSessionSidebarState(): SessionSidebarState {
  return {
    now: Date.now(),
    focusedItemKey: null,
    expandedProjectKeys: {},
    projectRevealCounts: {},
    editingProjectKey: null,
    draftProjectName: '',
    editingFolderId: null,
    draftFolderName: '',
    searchQueryDraft: DEFAULT_SIDEBAR_FILTERS.query,
    filters: { ...DEFAULT_SIDEBAR_FILTERS },
    isFilterPanelOpen: false,
    isSearchOpen: false,
  }
}

export function createSessionSidebarState$(): Observable<SessionSidebarState> {
  return observable(createDefaultSessionSidebarState())
}
