import { type Observable, observable } from '@legendapp/state'
import { DEFAULT_SIDEBAR_FILTERS, type SidebarFilters } from './sessionFiltering'

export interface SessionSidebarState {
  now: number
  focusedItemKey: string | null
  expandedProjectKeys: Record<string, true>
  projectRevealCounts: Record<string, number>
  projectRenameProjectKey: string | null
  projectRenameLabel: string
  projectRenameWorkspacePath: string | null
  projectRenameDraft: string
  folderCreateProjectKey: string | null
  folderCreateParentFolderId: string | null
  folderCreateDraft: string
  folderRenameFolderId: string | null
  folderRenameName: string
  folderRenameDraft: string
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
    projectRenameProjectKey: null,
    projectRenameLabel: '',
    projectRenameWorkspacePath: null,
    projectRenameDraft: '',
    folderCreateProjectKey: null,
    folderCreateParentFolderId: null,
    folderCreateDraft: 'New folder',
    folderRenameFolderId: null,
    folderRenameName: '',
    folderRenameDraft: '',
    searchQueryDraft: DEFAULT_SIDEBAR_FILTERS.query,
    filters: { ...DEFAULT_SIDEBAR_FILTERS },
    isFilterPanelOpen: false,
    isSearchOpen: false,
  }
}

export function createSessionSidebarState$(): Observable<SessionSidebarState> {
  return observable(createDefaultSessionSidebarState())
}
