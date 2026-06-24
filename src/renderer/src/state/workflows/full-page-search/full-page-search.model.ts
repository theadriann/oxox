import type { Observable } from '@legendapp/state'
import type { SessionSearchResponse } from '../../../../../shared/ipc/contracts'
import type { SessionPreview } from '../../sessions/session.model'
import type { SearchSessionsGateway } from '../session-search/session-search.model'
import {
  buildSearchQuery,
  countItemsByScope,
  createBrowseItems,
  createItemsFromHits,
  createItemsFromMatches,
  type DatePreset,
  extractCompletedOperatorChips,
  filterResultItems,
  MAX_RENDERED_RESULTS,
  type ResultType,
  type SearchResultItem,
  type SearchScope,
} from './full-page-search.helpers'
import {
  createFullPageSearchState$,
  type FullPageSearchChip,
  type FullPageSearchState,
} from './full-page-search.state'

export interface ProjectOption {
  label: string
  workspacePath: string | null
}

export interface FullPageSearchResultSection {
  type: ResultType
  items: SearchResultItem[]
}

export interface FullPageSearchViewModel {
  query: string
  hasQuery: boolean
  inputText: string
  chips: FullPageSearchChip[]
  scope: SearchScope
  scopeCounts: Record<SearchScope, number>
  visibleItems: SearchResultItem[]
  groupedSections: FullPageSearchResultSection[]
  selectedItem: SearchResultItem | null
  inspectorItem: SearchResultItem | null
  relatedMatches: SearchResultItem[]
  isSearching: boolean
  error: string | null
  hasSearched: boolean
  showEmptyState: boolean
  selectedStatuses: string[]
  selectedProjects: string[]
  selectedSources: string[]
  datePreset: DatePreset
  projects: ProjectOption[]
  projectSearchQuery: string
}

interface FullPageSearchControllerOptions {
  debounceMs?: number
  searchLimit?: number
}

const RESULT_TYPE_ORDER: ResultType[] = [
  'session',
  'message',
  'tool',
  'file',
  'summary',
  'todo',
  'detail',
]

const MAX_PROJECT_OPTIONS = 20

export class FullPageSearchController {
  readonly state$: Observable<FullPageSearchState> = createFullPageSearchState$()

  private requestSequence = 0
  private chipIdCounter = 0
  private scheduledSearchTimer: ReturnType<typeof setTimeout> | null = null
  private readonly debounceMs: number
  private readonly searchLimit: number

  constructor(
    private readonly searchSessions?: SearchSessionsGateway,
    options: FullPageSearchControllerOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 200
    this.searchLimit = options.searchLimit ?? 80
  }

  get query(): string {
    return buildSearchQuery(this.state$.chips.get(), this.state$.inputText.get())
  }

  get hasPendingSearch(): boolean {
    return this.scheduledSearchTimer !== null
  }

  setInputText = (rawValue: string): void => {
    const extracted = extractCompletedOperatorChips(rawValue)

    if (extracted.chips.length > 0) {
      this.state$.chips.set([
        ...this.state$.chips.get(),
        ...extracted.chips.map((chip) => this.withChipId(chip)),
      ])
    }

    this.state$.inputText.set(extracted.text)
    this.state$.selectedItemId.set(null)
    this.scheduleSearch()
  }

  removeChip = (chipId: string): void => {
    this.state$.chips.set(this.state$.chips.get().filter((chip) => chip.id !== chipId))
    this.scheduleSearch()
  }

  removeLastChip = (): FullPageSearchChip | null => {
    const lastChip = this.state$.chips.get().at(-1) ?? null

    if (lastChip) {
      this.removeChip(lastChip.id)
    }

    return lastChip
  }

  addOperatorExample = (example: string): void => {
    const extracted = extractCompletedOperatorChips(`${example} `)
    this.state$.chips.set([
      ...this.state$.chips.get(),
      ...extracted.chips.map((chip) => this.withChipId(chip)),
    ])
    this.scheduleSearch()
  }

  setScope = (scope: SearchScope): void => {
    this.state$.scope.set(scope)
  }

  toggleStatus = (status: string): void => {
    this.state$.selectedStatuses.set(toggleListValue(this.state$.selectedStatuses.get(), status))
  }

  toggleProject = (projectLabel: string): void => {
    this.state$.selectedProjects.set(
      toggleListValue(this.state$.selectedProjects.get(), projectLabel),
    )
  }

  toggleSource = (source: string): void => {
    this.state$.selectedSources.set(toggleListValue(this.state$.selectedSources.get(), source))
  }

  setDatePreset = (preset: DatePreset): void => {
    this.state$.datePreset.set(preset)
  }

  setProjectSearchQuery = (query: string): void => {
    this.state$.projectSearchQuery.set(query)
  }

  selectItem = (itemId: string | null): void => {
    this.state$.selectedItemId.set(itemId)
  }

  previewItem = (itemId: string | null): void => {
    this.state$.previewItemId.set(itemId)
  }

  moveSelection = (visibleItems: SearchResultItem[], delta: number): SearchResultItem | null => {
    if (visibleItems.length === 0) {
      return null
    }

    const selectedItemId = this.state$.selectedItemId.get()
    const currentIndex = selectedItemId
      ? visibleItems.findIndex((item) => item.id === selectedItemId)
      : 0
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), visibleItems.length - 1)
    const nextItem = visibleItems[nextIndex] ?? null

    if (nextItem) {
      this.state$.selectedItemId.set(nextItem.id)
    }

    return nextItem
  }

  /** Runs any pending debounced search immediately. Returns true when one was pending. */
  flushPendingSearch = (): boolean => {
    if (!this.scheduledSearchTimer) {
      return false
    }

    this.clearScheduledSearch()
    void this.executeSearch(this.query)
    return true
  }

  dispose = (): void => {
    this.clearScheduledSearch()
    this.requestSequence += 1
  }

  buildViewModel(sessions: SessionPreview[]): FullPageSearchViewModel {
    const state = this.state$.get()
    const query = buildSearchQuery(state.chips, state.inputText)
    const hasQuery = query.length > 0
    const hasBrowseFilters =
      state.selectedStatuses.length > 0 ||
      state.selectedProjects.length > 0 ||
      state.datePreset !== 'any'

    const baseItems = hasQuery
      ? state.hits.length > 0
        ? createItemsFromHits(state.hits, sessions)
        : createItemsFromMatches(state.matches, sessions)
      : hasBrowseFilters
        ? createBrowseItems(sessions)
        : []

    const allItems = filterResultItems(baseItems, {
      datePreset: state.datePreset,
      projects: state.selectedProjects,
      scope: 'all',
      sources: state.selectedSources,
      statuses: state.selectedStatuses,
    })

    const scopeCounts = countItemsByScope(allItems)
    const visibleItems = filterResultItems(allItems, { scope: state.scope })
      .slice(0, MAX_RENDERED_RESULTS)
      .sort(
        (left, right) =>
          RESULT_TYPE_ORDER.indexOf(left.type) - RESULT_TYPE_ORDER.indexOf(right.type),
      )

    const selectedItem =
      visibleItems.find((item) => item.id === state.selectedItemId) ?? visibleItems[0] ?? null
    const previewItem = state.previewItemId
      ? (visibleItems.find((item) => item.id === state.previewItemId) ?? null)
      : null
    const inspectorItem = previewItem ?? selectedItem
    const relatedMatches = inspectorItem
      ? visibleItems.filter(
          (item) => item.session.id === inspectorItem.session.id && item.id !== inspectorItem.id,
        )
      : []

    return {
      chips: state.chips,
      datePreset: state.datePreset,
      error: state.error,
      groupedSections: groupItemsByType(visibleItems),
      hasQuery,
      hasSearched: state.hasSearched,
      inputText: state.inputText,
      inspectorItem,
      isSearching: state.isSearching,
      projectSearchQuery: state.projectSearchQuery,
      projects: collectProjects(sessions, state.projectSearchQuery),
      query,
      relatedMatches,
      scope: state.scope,
      scopeCounts,
      selectedItem,
      selectedProjects: state.selectedProjects,
      selectedSources: state.selectedSources,
      selectedStatuses: state.selectedStatuses,
      showEmptyState: !state.error && !state.isSearching && visibleItems.length === 0,
      visibleItems,
    }
  }

  private scheduleSearch(): void {
    this.clearScheduledSearch()
    const nextQuery = this.query

    this.scheduledSearchTimer = setTimeout(() => {
      this.scheduledSearchTimer = null
      void this.executeSearch(nextQuery)
    }, this.debounceMs)
  }

  private async executeSearch(query: string): Promise<void> {
    this.requestSequence += 1
    const sequence = this.requestSequence

    if (!query) {
      this.state$.hits.set([])
      this.state$.matches.set([])
      this.state$.isSearching.set(false)
      this.state$.error.set(null)
      return
    }

    this.state$.hasSearched.set(true)

    if (!this.searchSessions) {
      this.state$.matches.set([])
      this.state$.hits.set([])
      this.state$.error.set('Search bridge unavailable.')
      return
    }

    this.state$.isSearching.set(true)
    this.state$.error.set(null)

    try {
      const response: SessionSearchResponse = await this.searchSessions({
        limit: this.searchLimit,
        query,
      })

      if (sequence !== this.requestSequence) {
        return
      }

      this.state$.hits.set(response.hits ?? [])
      this.state$.matches.set(response.matches)
    } catch (caughtError) {
      if (sequence !== this.requestSequence) {
        return
      }

      this.state$.matches.set([])
      this.state$.hits.set([])
      this.state$.error.set(caughtError instanceof Error ? caughtError.message : 'Search failed.')
    } finally {
      if (sequence === this.requestSequence) {
        this.state$.isSearching.set(false)
      }
    }
  }

  private clearScheduledSearch(): void {
    if (this.scheduledSearchTimer) {
      clearTimeout(this.scheduledSearchTimer)
      this.scheduledSearchTimer = null
    }
  }

  private withChipId(chip: { key: string; value: string }): FullPageSearchChip {
    this.chipIdCounter += 1
    return { ...chip, id: `chip-${this.chipIdCounter}` }
  }
}

function groupItemsByType(items: SearchResultItem[]): FullPageSearchResultSection[] {
  return RESULT_TYPE_ORDER.map((type) => ({
    type,
    items: items.filter((item) => item.type === type),
  })).filter((section) => section.items.length > 0)
}

function collectProjects(sessions: SessionPreview[], searchQuery: string): ProjectOption[] {
  const byLabel = new Map<string, ProjectOption>()

  for (const session of sessions) {
    if (!session.projectLabel || byLabel.has(session.projectLabel)) {
      continue
    }

    byLabel.set(session.projectLabel, {
      label: session.projectLabel,
      workspacePath: session.projectWorkspacePath,
    })
  }

  const query = searchQuery.trim().toLowerCase()
  const projects = [...byLabel.values()]
  const filtered = query
    ? projects.filter(
        (project) =>
          project.label.toLowerCase().includes(query) ||
          project.workspacePath?.toLowerCase().includes(query),
      )
    : projects

  return filtered.slice(0, MAX_PROJECT_OPTIONS)
}

function toggleListValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}
