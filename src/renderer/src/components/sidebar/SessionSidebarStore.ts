import type { KeyboardEvent } from 'react'
import {
  batch,
  bindMethods,
  observable,
  readField,
  readMapValue,
  writeField,
} from '../../stores/legend'
import type { ProjectSessionGroup, SessionPreview } from '../../stores/SessionStore'
import { DEFAULT_SIDEBAR_FILTERS, type SidebarFilters } from './sessionFiltering'

export interface RenderedSessionItem {
  focusKey: string
  session: SessionPreview
}

export class SessionSidebarStore {
  readonly stateNode = observable({
    now: Date.now(),
    focusedItemKey: null as string | null,
    expandedProjectKeys: new Set<string>(),
    projectRevealCounts: new Map<string, number>(),
    editingProjectKey: null as string | null,
    draftProjectName: '',
    filters: { ...DEFAULT_SIDEBAR_FILTERS } as SidebarFilters,
    isFilterPanelOpen: false,
    isSearchOpen: false,
  })
  private storedScrollTop = 0

  constructor() {
    bindMethods(this)
  }

  get now(): number {
    return readField(this.stateNode, 'now')
  }

  set now(value: number) {
    writeField(this.stateNode, 'now', value)
  }

  get focusedItemKey(): string | null {
    return readField(this.stateNode, 'focusedItemKey')
  }

  set focusedItemKey(value: string | null) {
    writeField(this.stateNode, 'focusedItemKey', value)
  }

  get expandedProjectKeys(): Set<string> {
    return readField(this.stateNode, 'expandedProjectKeys')
  }

  get projectRevealCounts(): Map<string, number> {
    return readField(this.stateNode, 'projectRevealCounts')
  }

  get editingProjectKey(): string | null {
    return readField(this.stateNode, 'editingProjectKey')
  }

  set editingProjectKey(value: string | null) {
    writeField(this.stateNode, 'editingProjectKey', value)
  }

  get draftProjectName(): string {
    return readField(this.stateNode, 'draftProjectName')
  }

  set draftProjectName(value: string) {
    writeField(this.stateNode, 'draftProjectName', value)
  }

  get filters(): SidebarFilters {
    return readField(this.stateNode, 'filters')
  }

  set filters(value: SidebarFilters) {
    writeField(this.stateNode, 'filters', value)
  }

  get isFilterPanelOpen(): boolean {
    return readField(this.stateNode, 'isFilterPanelOpen')
  }

  set isFilterPanelOpen(value: boolean) {
    writeField(this.stateNode, 'isFilterPanelOpen', value)
  }

  get isSearchOpen(): boolean {
    return readField(this.stateNode, 'isSearchOpen')
  }

  set isSearchOpen(value: boolean) {
    writeField(this.stateNode, 'isSearchOpen', value)
  }

  tickNow(): void {
    this.now = Date.now()
  }

  isProjectExpanded(projectKey: string): boolean {
    return this.stateNode.expandedProjectKeys.has(projectKey)
  }

  setFocusedItemKey(focusKey: string | null): void {
    this.focusedItemKey = focusKey
  }

  /**
   * Pure computation: given visible items and selected session, returns the
   * correct focused key. Callers use this as derived state instead of syncing
   * via useEffect.
   */
  deriveFocusedItemKey(
    visibleItems: RenderedSessionItem[],
    selectedSessionId: string,
  ): string | null {
    if (visibleItems.length === 0) return null

    if (this.focusedItemKey && visibleItems.some((item) => item.focusKey === this.focusedItemKey)) {
      return this.focusedItemKey
    }

    return (
      visibleItems.find((item) => item.session.id === selectedSessionId)?.focusKey ??
      visibleItems[0]?.focusKey ??
      null
    )
  }

  focusSession(focusKey: string, sessionRefs: Map<string, HTMLButtonElement>): void {
    const element = sessionRefs.get(focusKey)
    if (!element) return

    this.focusedItemKey = focusKey
    element.focus()
  }

  moveFocus(
    currentFocusKey: string,
    direction: -1 | 1,
    visibleItems: RenderedSessionItem[],
    sessionRefs: Map<string, HTMLButtonElement>,
  ): void {
    const currentIndex = visibleItems.findIndex((item) => item.focusKey === currentFocusKey)
    if (currentIndex === -1 || visibleItems.length === 0) return

    const nextIndex = (currentIndex + direction + visibleItems.length) % visibleItems.length
    const nextItem = visibleItems[nextIndex]
    if (nextItem) {
      this.focusSession(nextItem.focusKey, sessionRefs)
    }
  }

  handleSessionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    focusKey: string,
    sessionId: string,
    visibleItems: RenderedSessionItem[],
    sessionRefs: Map<string, HTMLButtonElement>,
    onSelectSession: (sessionId: string) => void,
  ): void {
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

  toggleProjectExpansion(projectKey: string): void {
    batch(() => {
      const current = readMapValue(this.stateNode.projectRevealCounts, projectKey) ?? 0
      if (current > 0) {
        this.stateNode.projectRevealCounts.delete(projectKey)
        this.stateNode.expandedProjectKeys.delete(projectKey)
      } else {
        this.stateNode.expandedProjectKeys.add(projectKey)
      }
    })
  }

  revealMoreSessions(projectKey: string, batchSize: number): void {
    batch(() => {
      const current = readMapValue(this.stateNode.projectRevealCounts, projectKey) ?? 0
      this.stateNode.projectRevealCounts.set(projectKey, current + batchSize)
      this.stateNode.expandedProjectKeys.add(projectKey)
    })
  }

  collapseProjectSessions(projectKey: string): void {
    batch(() => {
      this.stateNode.projectRevealCounts.delete(projectKey)
      this.stateNode.expandedProjectKeys.delete(projectKey)
    })
  }

  getRevealLimit(projectKey: string, baseLimit: number): number {
    const extra = readMapValue(this.stateNode.projectRevealCounts, projectKey) ?? 0
    return baseLimit + extra
  }

  startEditingProject(group: ProjectSessionGroup): void {
    batch(() => {
      this.editingProjectKey = group.key
      this.draftProjectName = group.label
    })
  }

  setDraftProjectName(value: string): void {
    this.draftProjectName = value
  }

  submitProjectDisplayName(
    projectKey: string,
    onSetProjectDisplayName: (projectKey: string, value: string) => void,
  ): void {
    onSetProjectDisplayName(projectKey, this.draftProjectName)
    this.cancelProjectEditing()
  }

  cancelProjectEditing(): void {
    batch(() => {
      this.editingProjectKey = null
      this.draftProjectName = ''
    })
  }

  /**
   * Pure check: returns whether the editing project still exists.
   * Called during render -- if it returns false, the caller should
   * cancel editing via an event handler or MobX reaction.
   */
  isEditingProjectValid(groups: ProjectSessionGroup[]): boolean {
    if (!this.editingProjectKey) return true
    return groups.some((group) => group.key === this.editingProjectKey)
  }

  updateFilters(nextFilters: Partial<SidebarFilters>, scrollElement?: HTMLDivElement | null): void {
    this.applyFilters(
      {
        ...this.filters,
        ...nextFilters,
      },
      scrollElement,
    )
  }

  toggleTagFilter(tag: string, scrollElement?: HTMLDivElement | null): void {
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

  clearFilters(scrollElement?: HTMLDivElement | null): void {
    this.applyFilters({ ...DEFAULT_SIDEBAR_FILTERS }, scrollElement)
  }

  toggleFilterPanel(): void {
    this.isFilterPanelOpen = !this.isFilterPanelOpen
  }

  closeFilterPanel(focusTarget?: HTMLButtonElement | null): void {
    this.isFilterPanelOpen = false
    if (document.activeElement !== focusTarget) {
      focusTarget?.focus()
    }
  }

  openSearch(): void {
    this.isSearchOpen = true
  }

  closeSearch(): void {
    batch(() => {
      this.isSearchOpen = false
      this.isFilterPanelOpen = false
    })
    if (this.filters.query.length > 0) {
      this.updateFilters({ query: '' })
    }
  }

  private applyFilters(nextFilters: SidebarFilters, scrollElement?: HTMLDivElement | null): void {
    const wasFiltering = hasActiveFilters(this.filters)
    const isFiltering = hasActiveFilters(nextFilters)

    if (!wasFiltering && isFiltering) {
      this.storedScrollTop = scrollElement?.scrollTop ?? 0
    }

    this.filters = nextFilters

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
