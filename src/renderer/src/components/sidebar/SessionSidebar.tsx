import { ChevronsLeft, FolderSearch, GripVertical, Plus, Search } from 'lucide-react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { memo, type PointerEvent, useCallback, useMemo, useRef } from 'react'
import type { SessionSearchMatch } from '../../../../shared/ipc/contracts'
import { useValue } from '../../stores/legend'
import type { ProjectSessionGroup, SessionPreview } from '../../stores/SessionStore'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { SkeletonBlock } from '../ui/skeleton'
import { StateCard } from '../ui/state-card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { SessionFilterPanel } from './SessionFilterPanel'
import { buildFlatItems, buildVisibleItems, SessionList } from './SessionList'
import type { SessionSidebarStore } from './SessionSidebarStore'
import { filterSessionGroups, type SidebarFilters } from './sessionFiltering'

const SIDEBAR_SKELETON_IDS = [
  'sidebar-skeleton-a',
  'sidebar-skeleton-b',
  'sidebar-skeleton-c',
  'sidebar-skeleton-d',
  'sidebar-skeleton-e',
]

export interface SessionSidebarProps {
  groups: ProjectSessionGroup[]
  pinnedSessions: SessionPreview[]
  selectedSessionId: string
  activeCount: number
  isLoading?: boolean
  errorState?: {
    title: string
    description: string
    actionLabel: string
    onAction: () => void
  }
  isProjectCollapsed: (projectKey: string) => boolean
  onToggleProject: (projectKey: string) => void
  onSelectSession: (sessionId: string) => void
  onTogglePinnedSession: (sessionId: string) => void
  onSetProjectDisplayName: (projectKey: string, value: string) => void
  onArchiveProject?: (projectKey: string) => void
  onArchiveSession?: (sessionId: string) => void
  onCopySessionId?: (sessionId: string) => void
  onCompactSession?: (sessionId: string) => void
  onForkSession?: (sessionId: string) => void
  onRenameSession?: (sessionId: string) => void
  onRewindSession?: (sessionId: string) => void
  onNewSession: (workspacePath?: string) => void
  onHideSidebar?: () => void
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void
  searchMatches?: readonly SessionSearchMatch[] | null
  onSearchQueryChange?: (query: string) => void
}

interface SessionSidebarViewProps extends SessionSidebarProps {
  store: SessionSidebarStore
}

export function SessionSidebar({
  groups,
  pinnedSessions,
  selectedSessionId,
  activeCount,
  store,
  isLoading = false,
  errorState,
  isProjectCollapsed,
  onToggleProject,
  onSelectSession,
  onTogglePinnedSession,
  onSetProjectDisplayName,
  onArchiveProject,
  onArchiveSession,
  onCopySessionId,
  onCompactSession,
  onForkSession,
  onRenameSession,
  onRewindSession,
  onNewSession,
  onHideSidebar,
  onResizeStart,
  searchMatches,
  onSearchQueryChange,
}: SessionSidebarViewProps) {
  const sessionRefs = useRef(new Map<string, HTMLButtonElement>())
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const hasAnySessions = groups.length > 0 || pinnedSessions.length > 0
  const editingProjectKey = useValue(() =>
    store.isEditingProjectValid(groups) ? store.editingProjectKey : null,
  )
  const filters = useValue(() => store.filters)
  const isFilterPanelOpen = useValue(() => store.isFilterPanelOpen)
  const now = useValue(() => store.now)
  const filteredSidebar = useMemo(
    () => filterSessionGroups(groups, pinnedSessions, filters, searchMatches, now),
    [filters, groups, now, pinnedSessions, searchMatches],
  )

  const visibleItems = useValue(() =>
    buildVisibleItems(
      filteredSidebar.pinnedSessions,
      filteredSidebar.groups,
      filteredSidebar.isFiltering,
      isProjectCollapsed,
      store,
    ),
  )

  const flatItems = useValue(() =>
    buildFlatItems({
      pinnedSessions: filteredSidebar.pinnedSessions,
      groups: filteredSidebar.groups,
      isFiltering: filteredSidebar.isFiltering,
      isLoading,
      hasError: Boolean(errorState),
      editingProjectKey,
      isProjectCollapsed,
      store,
    }),
  )

  // Derive focused key inline (replaces useEffect + syncFocusedItemKey)
  const focusedKey = useValue(() => store.deriveFocusedItemKey(visibleItems, selectedSessionId))

  // Stable callback ref pattern (rerender-defer-reads / advanced-event-handler-refs)
  const visibleItemsRef = useRef(visibleItems)
  visibleItemsRef.current = visibleItems

  const handleSessionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, focusKey: string, sessionId: string) => {
      store.handleSessionKeyDown(
        event,
        focusKey,
        sessionId,
        visibleItemsRef.current,
        sessionRefs.current,
        onSelectSession,
      )
    },
    [onSelectSession, store],
  )

  // Stable handler for escape key on sidebar
  const handleSidebarKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (store.editingProjectKey) {
        event.preventDefault()
        store.cancelProjectEditing()
        return
      }
      if (store.isSearchOpen) {
        event.preventDefault()
        store.closeSearch()
      }
    },
    [store],
  )

  // Stable handlers for filter updates (rerender-functional-setstate / stable refs)
  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const query = event.target.value
      store.updateFilters({ query }, scrollAreaRef.current)
      onSearchQueryChange?.(query)
    },
    [onSearchQueryChange, store],
  )

  const handleClearQuery = useCallback(() => {
    store.updateFilters({ query: '' }, scrollAreaRef.current)
    onSearchQueryChange?.('')
  }, [onSearchQueryChange, store])

  const handleUpdateFilters = useCallback(
    (nextFilters: Partial<SidebarFilters>) => {
      store.updateFilters(nextFilters, scrollAreaRef.current)
    },
    [store],
  )

  const handleToggleTagFilter = useCallback(
    (tag: string) => {
      store.toggleTagFilter(tag, scrollAreaRef.current)
    },
    [store],
  )

  const handleClearFilters = useCallback(() => {
    store.clearFilters(scrollAreaRef.current)
  }, [store])

  const handleNewSession = useCallback(() => {
    onNewSession()
  }, [onNewSession])

  return (
    <TooltipProvider delayDuration={400}>
      <aside
        className="oxox-sidebar-shell flex h-full flex-col border-r border-fd-border-subtle bg-fd-surface pt-[50px]"
        aria-label="Session sidebar"
        onKeyDown={handleSidebarKeyDown}
      >
        {/* Header: New + Active count */}
        <SidebarHeader
          activeCount={activeCount}
          onNewSession={handleNewSession}
          onHideSidebar={onHideSidebar}
        />

        <SessionFilterPanel
          filters={filters}
          filteredSidebar={filteredSidebar}
          isFilterPanelOpen={isFilterPanelOpen}
          onQueryChange={handleQueryChange}
          onClearQuery={handleClearQuery}
          onToggleFilterPanel={store.toggleFilterPanel}
          onFocusSearch={store.openSearch}
          onUpdateFilters={handleUpdateFilters}
          onToggleTag={handleToggleTagFilter}
          onClearAll={handleClearFilters}
        />

        <div
          ref={scrollAreaRef}
          className="flex-1 overflow-y-auto px-1 py-1"
          data-testid="session-sidebar-scroll-area"
        >
          <SidebarEmptyStates
            isLoading={isLoading}
            errorState={errorState}
            hasAnySessions={hasAnySessions}
            hasMatches={filteredSidebar.hasMatches}
            onNewSession={handleNewSession}
            onClearFilters={handleClearFilters}
          />

          {flatItems.length > 0 ? (
            <SessionList
              flatItems={flatItems}
              focusedKey={focusedKey}
              selectedSessionId={selectedSessionId}
              store={store}
              sessionRefs={sessionRefs.current}
              scrollAreaRef={scrollAreaRef}
              onToggleProject={onToggleProject}
              onNewSession={onNewSession}
              onSetProjectDisplayName={onSetProjectDisplayName}
              onArchiveProject={onArchiveProject}
              onArchiveSession={onArchiveSession}
              onCopySessionId={onCopySessionId}
              onCompactSession={onCompactSession}
              onForkSession={onForkSession}
              onRenameSession={onRenameSession}
              onRewindSession={onRewindSession}
              onSelectSession={onSelectSession}
              onTogglePinnedSession={onTogglePinnedSession}
              onSessionKeyDown={handleSessionKeyDown}
              onFocus={store.setFocusedItemKey}
            />
          ) : null}
        </div>

        <div
          className="oxox-sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          data-sidebar-resize-handle="true"
          onPointerDown={onResizeStart}
        >
          <span className="sr-only">Resize sidebar</span>
          <GripVertical className="pointer-events-none size-4 text-fd-tertiary" />
        </div>
      </aside>
    </TooltipProvider>
  )
}

const SidebarHeader = memo(function SidebarHeader({
  activeCount,
  onNewSession,
  onHideSidebar,
}: {
  activeCount: number
  onNewSession: () => void
  onHideSidebar?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-1.5 border-b border-fd-border-subtle px-3 py-2">
      <Button size="xs" onClick={onNewSession}>
        <Plus />
        New
      </Button>
      <div className="flex items-center gap-1.5">
        {activeCount > 0 ? (
          <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-medium">
            {activeCount} active
          </Badge>
        ) : null}
        {onHideSidebar ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Hide sidebar"
                className="inline-flex size-6 items-center justify-center rounded-md text-fd-tertiary transition-colors hover:bg-white/[0.06] hover:text-fd-secondary"
                onClick={onHideSidebar}
              >
                <ChevronsLeft className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px]">
              Hide sidebar
              <kbd className="ml-1.5 rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] text-fd-tertiary">
                Cmd+B
              </kbd>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
})

const SidebarEmptyStates = memo(function SidebarEmptyStates({
  isLoading,
  errorState,
  hasAnySessions,
  hasMatches,
  onNewSession,
  onClearFilters,
}: {
  isLoading: boolean
  errorState: SessionSidebarProps['errorState']
  hasAnySessions: boolean
  hasMatches: boolean
  onNewSession: () => void
  onClearFilters: () => void
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 px-1 py-1">
        <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
          Loading sessions
        </p>
        {SIDEBAR_SKELETON_IDS.map((skeletonId) => (
          <div key={skeletonId} className="flex items-center gap-1.5 px-2 py-1.5">
            <SkeletonBlock className="size-1.5 rounded-full" />
            <SkeletonBlock className="h-3.5 flex-1 rounded" />
            <SkeletonBlock className="h-3 w-10 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (errorState) {
    return (
      <StateCard
        icon={FolderSearch}
        eyebrow="Recovery"
        title={errorState.title}
        description={errorState.description}
        actions={
          <Button type="button" size="xs" onClick={errorState.onAction}>
            {errorState.actionLabel}
          </Button>
        }
      />
    )
  }

  if (hasAnySessions && !hasMatches) {
    return (
      <StateCard
        icon={Search}
        eyebrow="Search"
        title="No matching sessions"
        description="Adjust the search query or clear filters to restore the full project-grouped list."
        actions={
          <Button type="button" size="xs" variant="secondary" onClick={onClearFilters}>
            Clear search & filters
          </Button>
        }
      />
    )
  }

  if (!hasAnySessions) {
    return (
      <StateCard
        icon={FolderSearch}
        eyebrow="Empty"
        title="No sessions yet"
        description="OXOX will group sessions here as soon as artifacts or daemon data become available."
        actions={
          <Button type="button" size="xs" variant="secondary" onClick={onNewSession}>
            Create session
          </Button>
        }
      />
    )
  }

  return null
})
