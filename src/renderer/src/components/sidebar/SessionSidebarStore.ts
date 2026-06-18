import { batch, type Observable } from '@legendapp/state'
import type { KeyboardEvent } from 'react'
import type { ProjectSessionGroup, SessionFolder } from '../../state/sessions/session.model'
import { createSessionSidebarState$, type SessionSidebarState } from './SessionSidebarStore.state'
import { DEFAULT_SIDEBAR_FILTERS, type SidebarFilters } from './sessionFiltering'

export interface RenderedSessionItem {
  focusKey: string
  sessionId: string
}

export class SessionSidebarStore {
  readonly state$: Observable<SessionSidebarState> = createSessionSidebarState$()
  private storedScrollTop = 0

  get now(): number {
    return this.state$.now.get()
  }

  set now(value: number) {
    this.state$.now.set(value)
  }

  get focusedItemKey(): string | null {
    return this.state$.focusedItemKey.get()
  }

  set focusedItemKey(value: string | null) {
    this.state$.focusedItemKey.set(value)
  }

  get editingProjectKey(): string | null {
    return this.projectRenameProjectKey
  }

  set editingProjectKey(value: string | null) {
    this.state$.projectRenameProjectKey.set(value)
  }

  get draftProjectName(): string {
    return this.projectRenameDraft
  }

  set draftProjectName(value: string) {
    this.projectRenameDraft = value
  }

  get editingFolderId(): string | null {
    return this.folderRenameFolderId
  }

  set editingFolderId(value: string | null) {
    this.state$.folderRenameFolderId.set(value)
  }

  get draftFolderName(): string {
    return this.folderRenameDraft
  }

  set draftFolderName(value: string) {
    this.folderRenameDraft = value
  }

  get projectRenameProjectKey(): string | null {
    return this.state$.projectRenameProjectKey.get()
  }

  set projectRenameProjectKey(value: string | null) {
    this.state$.projectRenameProjectKey.set(value)
  }

  get projectRenameLabel(): string {
    return this.state$.projectRenameLabel.get()
  }

  set projectRenameLabel(value: string) {
    this.state$.projectRenameLabel.set(value)
  }

  get projectRenameWorkspacePath(): string | null {
    return this.state$.projectRenameWorkspacePath.get()
  }

  set projectRenameWorkspacePath(value: string | null) {
    this.state$.projectRenameWorkspacePath.set(value)
  }

  get projectRenameDraft(): string {
    return this.state$.projectRenameDraft.get()
  }

  set projectRenameDraft(value: string) {
    this.state$.projectRenameDraft.set(value)
  }

  get isProjectRenameDialogOpen(): boolean {
    return this.projectRenameProjectKey !== null
  }

  get folderCreateProjectKey(): string | null {
    return this.state$.folderCreateProjectKey.get()
  }

  set folderCreateProjectKey(value: string | null) {
    this.state$.folderCreateProjectKey.set(value)
  }

  get folderCreateParentFolderId(): string | null {
    return this.state$.folderCreateParentFolderId.get()
  }

  set folderCreateParentFolderId(value: string | null) {
    this.state$.folderCreateParentFolderId.set(value)
  }

  get folderCreateDraft(): string {
    return this.state$.folderCreateDraft.get()
  }

  set folderCreateDraft(value: string) {
    this.state$.folderCreateDraft.set(value)
  }

  get isFolderCreateDialogOpen(): boolean {
    return this.folderCreateProjectKey !== null
  }

  get folderRenameFolderId(): string | null {
    return this.state$.folderRenameFolderId.get()
  }

  set folderRenameFolderId(value: string | null) {
    this.state$.folderRenameFolderId.set(value)
  }

  get folderRenameName(): string {
    return this.state$.folderRenameName.get()
  }

  set folderRenameName(value: string) {
    this.state$.folderRenameName.set(value)
  }

  get folderRenameDraft(): string {
    return this.state$.folderRenameDraft.get()
  }

  set folderRenameDraft(value: string) {
    this.state$.folderRenameDraft.set(value)
  }

  get isFolderRenameDialogOpen(): boolean {
    return this.folderRenameFolderId !== null
  }

  get searchQueryDraft(): string {
    return this.state$.searchQueryDraft.get()
  }

  set searchQueryDraft(value: string) {
    this.state$.searchQueryDraft.set(value)
  }

  get filters(): SidebarFilters {
    return this.state$.filters.get()
  }

  set filters(value: SidebarFilters) {
    this.state$.filters.set(value)
  }

  get isFilterPanelOpen(): boolean {
    return this.state$.isFilterPanelOpen.get()
  }

  set isFilterPanelOpen(value: boolean) {
    this.state$.isFilterPanelOpen.set(value)
  }

  get isSearchOpen(): boolean {
    return this.state$.isSearchOpen.get()
  }

  set isSearchOpen(value: boolean) {
    this.state$.isSearchOpen.set(value)
  }

  tickNow = (): void => {
    this.now = Date.now()
  }

  isProjectExpanded = (projectKey: string): boolean => {
    return this.state$.expandedProjectKeys[projectKey].get() === true
  }

  setFocusedItemKey = (focusKey: string | null): void => {
    this.focusedItemKey = focusKey
  }

  deriveFocusedItemKey = (
    visibleItems: RenderedSessionItem[],
    selectedSessionId: string,
  ): string | null => {
    if (visibleItems.length === 0) return null

    if (this.focusedItemKey && visibleItems.some((item) => item.focusKey === this.focusedItemKey)) {
      return this.focusedItemKey
    }

    return (
      visibleItems.find((item) => item.sessionId === selectedSessionId)?.focusKey ??
      visibleItems[0]?.focusKey ??
      null
    )
  }

  focusSession = (focusKey: string, sessionRefs: Map<string, HTMLButtonElement>): void => {
    const element = sessionRefs.get(focusKey)
    if (!element) return

    this.focusedItemKey = focusKey
    element.focus()
  }

  moveFocus = (
    currentFocusKey: string,
    direction: -1 | 1,
    visibleItems: RenderedSessionItem[],
    sessionRefs: Map<string, HTMLButtonElement>,
  ): void => {
    const currentIndex = visibleItems.findIndex((item) => item.focusKey === currentFocusKey)
    if (currentIndex === -1 || visibleItems.length === 0) return

    const nextIndex = (currentIndex + direction + visibleItems.length) % visibleItems.length
    const nextItem = visibleItems[nextIndex]
    if (nextItem) {
      this.focusSession(nextItem.focusKey, sessionRefs)
    }
  }

  handleSessionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    focusKey: string,
    sessionId: string,
    visibleItems: RenderedSessionItem[],
    sessionRefs: Map<string, HTMLButtonElement>,
    onSelectSession: (sessionId: string) => void,
  ): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this.moveFocus(focusKey, 1, visibleItems, sessionRefs)
        break
      case 'ArrowUp':
        event.preventDefault()
        this.moveFocus(focusKey, -1, visibleItems, sessionRefs)
        break
      case 'Home':
        event.preventDefault()
        if (visibleItems[0]) {
          this.focusSession(visibleItems[0].focusKey, sessionRefs)
        }
        break
      case 'End':
        event.preventDefault()
        if (visibleItems.at(-1)) {
          this.focusSession(visibleItems.at(-1)?.focusKey ?? '', sessionRefs)
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onSelectSession(sessionId)
        break
      default:
        break
    }
  }

  toggleProjectExpansion = (projectKey: string): void => {
    batch(() => {
      const current = this.state$.projectRevealCounts[projectKey].peek() ?? 0
      if (current > 0) {
        this.removeProjectRevealCount(projectKey)
        this.removeExpandedProjectKey(projectKey)
      } else {
        this.addExpandedProjectKey(projectKey)
      }
    })
  }

  revealMoreSessions = (projectKey: string, batchSize: number): void => {
    batch(() => {
      const current = this.state$.projectRevealCounts[projectKey].peek() ?? 0
      this.state$.projectRevealCounts[projectKey].set(current + batchSize)
      this.addExpandedProjectKey(projectKey)
    })
  }

  revealAllSessions = (projectKey: string): void => {
    batch(() => {
      this.state$.projectRevealCounts[projectKey].set(Infinity)
      this.addExpandedProjectKey(projectKey)
    })
  }

  collapseProjectSessions = (projectKey: string): void => {
    batch(() => {
      this.removeProjectRevealCount(projectKey)
      this.removeExpandedProjectKey(projectKey)
    })
  }

  getRevealLimit = (projectKey: string, baseLimit: number): number => {
    const extra = this.state$.projectRevealCounts[projectKey].get() ?? 0
    return baseLimit + extra
  }

  startEditingProject = (
    group: Pick<ProjectSessionGroup, 'key' | 'label' | 'workspacePath'>,
  ): void => {
    this.openProjectRenameDialog(group)
  }

  openProjectRenameDialog = (
    group: Pick<ProjectSessionGroup, 'key' | 'label' | 'workspacePath'>,
  ): void => {
    batch(() => {
      this.projectRenameProjectKey = group.key
      this.projectRenameLabel = group.label
      this.projectRenameWorkspacePath = group.workspacePath
      this.projectRenameDraft = group.label
    })
  }

  setDraftProjectName = (value: string): void => {
    this.setProjectRenameDraft(value)
  }

  setProjectRenameDraft = (value: string): void => {
    this.projectRenameDraft = value
  }

  setSearchQueryDraft = (value: string): void => {
    this.searchQueryDraft = value
  }

  submitProjectDisplayName = (
    projectKey: string,
    onSetProjectDisplayName: (projectKey: string, value: string) => void,
  ): void => {
    this.submitProjectRename(onSetProjectDisplayName, projectKey)
  }

  submitProjectRename = (
    onSetProjectDisplayName: (projectKey: string, value: string) => void,
    fallbackProjectKey?: string,
  ): void => {
    const projectKey = this.projectRenameProjectKey ?? fallbackProjectKey
    const nextName = this.projectRenameDraft.trim()

    if (!projectKey || !nextName) {
      return
    }

    onSetProjectDisplayName(projectKey, nextName)
    this.closeProjectRenameDialog()
  }

  cancelProjectEditing = (): void => {
    this.closeProjectRenameDialog()
  }

  closeProjectRenameDialog = (): void => {
    batch(() => {
      this.projectRenameProjectKey = null
      this.projectRenameLabel = ''
      this.projectRenameWorkspacePath = null
      this.projectRenameDraft = ''
    })
  }

  startEditingFolder = (folder: Pick<SessionFolder, 'id' | 'name'>): void => {
    this.openFolderRenameDialog(folder)
  }

  openFolderCreateDialog = (projectKey: string, parentFolderId: string | null = null): void => {
    batch(() => {
      this.folderCreateProjectKey = projectKey
      this.folderCreateParentFolderId = parentFolderId
      this.folderCreateDraft = 'New folder'
    })
  }

  setFolderCreateDraft = (value: string): void => {
    this.folderCreateDraft = value
  }

  submitFolderCreate = (
    onCreateFolder: (
      projectKey: string,
      name: string,
      parentFolderId?: string | null,
    ) => SessionFolder | undefined,
  ): SessionFolder | undefined => {
    const projectKey = this.folderCreateProjectKey
    const name = this.folderCreateDraft.trim()

    if (!projectKey || !name) {
      return undefined
    }

    const folder = onCreateFolder(projectKey, name, this.folderCreateParentFolderId)
    this.closeFolderCreateDialog()

    return folder
  }

  closeFolderCreateDialog = (): void => {
    batch(() => {
      this.folderCreateProjectKey = null
      this.folderCreateParentFolderId = null
      this.folderCreateDraft = 'New folder'
    })
  }

  openFolderRenameDialog = (folder: Pick<SessionFolder, 'id' | 'name'>): void => {
    batch(() => {
      this.folderRenameFolderId = folder.id
      this.folderRenameName = folder.name
      this.folderRenameDraft = folder.name
    })
  }

  setDraftFolderName = (value: string): void => {
    this.setFolderRenameDraft(value)
  }

  setFolderRenameDraft = (value: string): void => {
    this.folderRenameDraft = value
  }

  submitFolderName = (
    folderId: string,
    onRenameFolder: (folderId: string, value: string) => void,
  ): void => {
    this.submitFolderRename(onRenameFolder, folderId)
  }

  submitFolderRename = (
    onRenameFolder: (folderId: string, value: string) => void,
    fallbackFolderId?: string,
  ): void => {
    const folderId = this.folderRenameFolderId ?? fallbackFolderId
    const nextName = this.folderRenameDraft.trim()

    if (!folderId || !nextName) {
      return
    }

    onRenameFolder(folderId, nextName)
    this.closeFolderRenameDialog()
  }

  cancelFolderEditing = (): void => {
    this.closeFolderRenameDialog()
  }

  closeFolderRenameDialog = (): void => {
    batch(() => {
      this.folderRenameFolderId = null
      this.folderRenameName = ''
      this.folderRenameDraft = ''
    })
  }

  isEditingProjectValid = (groups: ProjectSessionGroup[]): boolean => {
    if (!this.editingProjectKey) return true
    return groups.some((group) => group.key === this.editingProjectKey)
  }

  updateFilters = (
    nextFilters: Partial<SidebarFilters>,
    scrollElement?: HTMLDivElement | null,
  ): void => {
    this.applyFilters(
      {
        ...this.filters,
        ...nextFilters,
      },
      scrollElement,
    )
  }

  toggleTagFilter = (tag: string, scrollElement?: HTMLDivElement | null): void => {
    this.applyFilters(
      {
        ...this.filters,
        tags: this.filters.tags.includes(tag)
          ? this.filters.tags.filter((value) => value !== tag)
          : [...this.filters.tags, tag],
      },
      scrollElement,
    )
  }

  clearFilters = (scrollElement?: HTMLDivElement | null): void => {
    this.searchQueryDraft = ''
    this.applyFilters({ ...DEFAULT_SIDEBAR_FILTERS }, scrollElement)
  }

  toggleFilterPanel = (): void => {
    this.isFilterPanelOpen = !this.isFilterPanelOpen
  }

  closeFilterPanel = (focusTarget?: HTMLButtonElement | null): void => {
    this.isFilterPanelOpen = false
    if (document.activeElement !== focusTarget) {
      focusTarget?.focus()
    }
  }

  openSearch = (): void => {
    this.isSearchOpen = true
  }

  closeSearch = (): void => {
    batch(() => {
      this.isSearchOpen = false
      this.isFilterPanelOpen = false
      this.searchQueryDraft = ''
    })
    if (this.filters.query.length > 0) {
      this.updateFilters({ query: '' })
    }
  }

  private addExpandedProjectKey(projectKey: string): void {
    if (this.state$.expandedProjectKeys[projectKey].peek()) {
      return
    }

    this.state$.expandedProjectKeys[projectKey].set(true)
  }

  private removeExpandedProjectKey(projectKey: string): void {
    this.state$.expandedProjectKeys[projectKey].delete()
  }

  private removeProjectRevealCount(projectKey: string): void {
    this.state$.projectRevealCounts[projectKey].delete()
  }

  private applyFilters(nextFilters: SidebarFilters, scrollElement?: HTMLDivElement | null): void {
    const wasFiltering = hasActiveFilters(this.filters)
    const isFiltering = hasActiveFilters(nextFilters)
    const previousQuery = this.filters.query

    if (!wasFiltering && isFiltering) {
      this.storedScrollTop = scrollElement?.scrollTop ?? 0
    }

    batch(() => {
      this.filters = nextFilters
      if (nextFilters.query !== previousQuery) {
        this.searchQueryDraft = nextFilters.query
      }
    })

    if (wasFiltering && !isFiltering && scrollElement) {
      scrollElement.scrollTop = this.storedScrollTop
    }
  }
}

function hasActiveFilters(filters: SidebarFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.projectKey !== DEFAULT_SIDEBAR_FILTERS.projectKey ||
    filters.status !== DEFAULT_SIDEBAR_FILTERS.status ||
    filters.dateRange !== DEFAULT_SIDEBAR_FILTERS.dateRange ||
    filters.tags.length > 0
  )
}
