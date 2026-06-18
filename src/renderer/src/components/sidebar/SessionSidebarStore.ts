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
    return this.state$.editingProjectKey.get()
  }

  set editingProjectKey(value: string | null) {
    this.state$.editingProjectKey.set(value)
  }

  get draftProjectName(): string {
    return this.state$.draftProjectName.get()
  }

  set draftProjectName(value: string) {
    this.state$.draftProjectName.set(value)
  }

  get editingFolderId(): string | null {
    return this.state$.editingFolderId.get()
  }

  set editingFolderId(value: string | null) {
    this.state$.editingFolderId.set(value)
  }

  get draftFolderName(): string {
    return this.state$.draftFolderName.get()
  }

  set draftFolderName(value: string) {
    this.state$.draftFolderName.set(value)
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

  startEditingProject = (group: Pick<ProjectSessionGroup, 'key' | 'label'>): void => {
    batch(() => {
      this.editingProjectKey = group.key
      this.draftProjectName = group.label
    })
  }

  setDraftProjectName = (value: string): void => {
    this.draftProjectName = value
  }

  setSearchQueryDraft = (value: string): void => {
    this.searchQueryDraft = value
  }

  submitProjectDisplayName = (
    projectKey: string,
    onSetProjectDisplayName: (projectKey: string, value: string) => void,
  ): void => {
    onSetProjectDisplayName(projectKey, this.draftProjectName)
    this.cancelProjectEditing()
  }

  cancelProjectEditing = (): void => {
    batch(() => {
      this.editingProjectKey = null
      this.draftProjectName = ''
    })
  }

  startEditingFolder = (folder: Pick<SessionFolder, 'id' | 'name'>): void => {
    batch(() => {
      this.editingFolderId = folder.id
      this.draftFolderName = folder.name
    })
  }

  setDraftFolderName = (value: string): void => {
    this.draftFolderName = value
  }

  submitFolderName = (
    folderId: string,
    onRenameFolder: (folderId: string, value: string) => void,
  ): void => {
    onRenameFolder(folderId, this.draftFolderName)
    this.cancelFolderEditing()
  }

  cancelFolderEditing = (): void => {
    batch(() => {
      this.editingFolderId = null
      this.draftFolderName = ''
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
