import { useVirtualizer } from '@tanstack/react-virtual'
import { Pin } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { ProjectSessionGroup, SessionPreview } from '../../stores/SessionStore'
import { ProjectGroup } from './ProjectGroup'
import { SessionItem } from './SessionItem'
import type { RenderedSessionItem, SessionSidebarStore } from './SessionSidebarStore'

export const SESSION_OVERFLOW_LIMIT = 5
export const SESSION_REVEAL_BATCH = 10

const VIRTUAL_ITEM_HEIGHT = {
  pinnedHeader: 28,
  projectHeader: 50,
  session: 36,
  showMore: 28,
  showLess: 28,
} as const

export type VirtualSidebarItem =
  | { kind: 'pinned-header'; count: number }
  | {
      kind: 'session'
      focusKey: string
      session: SessionPreview
      isPinned: boolean
    }
  | {
      kind: 'project-header'
      group: ProjectSessionGroup
      collapsed: boolean
      isEditing: boolean
    }
  | {
      kind: 'show-more'
      groupKey: string
      groupLabel: string
      remainingCount: number
    }
  | {
      kind: 'show-less'
      groupKey: string
      groupLabel: string
    }

interface SessionListProps {
  flatItems: VirtualSidebarItem[]
  focusedKey: string | null
  selectedSessionId: string
  store: SessionSidebarStore
  sessionRefs: Map<string, HTMLButtonElement>
  scrollAreaRef: React.RefObject<HTMLDivElement | null>
  onToggleProject: (projectKey: string) => void
  onNewSession: (workspacePath?: string) => void
  onSetProjectDisplayName: (projectKey: string, value: string) => void
  onArchiveProject?: (projectKey: string) => void
  onArchiveSession?: (sessionId: string) => void
  onCopySessionId?: (sessionId: string) => void
  onCompactSession?: (sessionId: string) => void
  onForkSession?: (sessionId: string) => void
  onRenameSession?: (sessionId: string) => void
  onRewindSession?: (sessionId: string) => void
  onSelectSession: (sessionId: string) => void
  onTogglePinnedSession: (sessionId: string) => void
  onSessionKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    focusKey: string,
    sessionId: string,
  ) => void
  onFocus: (focusKey: string | null) => void
}

export function SessionList({
  flatItems,
  focusedKey,
  selectedSessionId,
  store,
  sessionRefs,
  scrollAreaRef,
  onToggleProject,
  onNewSession,
  onSetProjectDisplayName,
  onArchiveProject,
  onArchiveSession,
  onCopySessionId,
  onCompactSession,
  onForkSession,
  onRenameSession,
  onRewindSession,
  onSelectSession,
  onTogglePinnedSession,
  onSessionKeyDown,
  onFocus,
}: SessionListProps) {
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollAreaRef.current,
    estimateSize: (index) => {
      const item = flatItems[index]
      if (!item) return VIRTUAL_ITEM_HEIGHT.session
      switch (item.kind) {
        case 'pinned-header':
          return VIRTUAL_ITEM_HEIGHT.pinnedHeader
        case 'project-header':
          return VIRTUAL_ITEM_HEIGHT.projectHeader
        case 'session':
          return VIRTUAL_ITEM_HEIGHT.session
        case 'show-more':
          return VIRTUAL_ITEM_HEIGHT.showMore
        case 'show-less':
          return VIRTUAL_ITEM_HEIGHT.showLess
      }
    },
    initialRect: { height: 600, width: 280 },
    overscan: 10,
  })

  const virtualRows =
    virtualizer.getVirtualItems().length > 0
      ? virtualizer.getVirtualItems()
      : createFallbackVirtualRows(flatItems)

  return (
    <div
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        position: 'relative',
        width: '100%',
      }}
    >
      {virtualRows.map((virtualRow) => {
        const item = flatItems[virtualRow.index]
        if (!item) return null

        return (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {item.kind === 'pinned-header' ? (
              <PinnedHeader count={item.count} />
            ) : item.kind === 'project-header' ? (
              <ProjectGroup
                group={item.group}
                collapsed={item.collapsed}
                isEditing={item.isEditing}
                store={store}
                onToggleProject={onToggleProject}
                onNewSession={onNewSession}
                onSetProjectDisplayName={onSetProjectDisplayName}
                onArchiveProject={onArchiveProject}
              />
            ) : item.kind === 'session' ? (
              <SessionItem
                focusKey={item.focusKey}
                isFocused={item.focusKey === focusedKey}
                isChild={item.session.derivationType === 'subagent'}
                isPinned={item.isPinned}
                isSelected={item.session.id === selectedSessionId}
                now={store.now}
                onFocus={onFocus}
                onKeyDown={onSessionKeyDown}
                onArchiveSession={onArchiveSession}
                onCopySessionId={onCopySessionId}
                onCompactSession={onCompactSession}
                onForkSession={onForkSession}
                onRenameSession={onRenameSession}
                onRewindSession={onRewindSession}
                onSelectSession={onSelectSession}
                onTogglePinnedSession={onTogglePinnedSession}
                setSessionRef={(focusKey, element) => {
                  if (element) {
                    sessionRefs.set(focusKey, element)
                    return
                  }
                  sessionRefs.delete(focusKey)
                }}
                session={item.session}
              />
            ) : item.kind === 'show-more' ? (
              <ShowMoreButton
                groupKey={item.groupKey}
                groupLabel={item.groupLabel}
                remainingCount={item.remainingCount}
                onRevealMore={store.revealMoreSessions}
              />
            ) : item.kind === 'show-less' ? (
              <ShowLessButton
                groupKey={item.groupKey}
                groupLabel={item.groupLabel}
                onCollapse={store.collapseProjectSessions}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function buildVisibleItems(
  pinnedSessions: SessionPreview[],
  groups: ProjectSessionGroup[],
  isFiltering: boolean,
  isProjectCollapsed: (projectKey: string) => boolean,
  store: SessionSidebarStore,
): RenderedSessionItem[] {
  const nextVisibleItems: RenderedSessionItem[] = pinnedSessions.map((session) => ({
    focusKey: `pinned:${session.id}`,
    session,
  }))

  for (const group of groups) {
    if (isProjectCollapsed(group.key)) continue

    const revealLimit = store.getRevealLimit(group.key, SESSION_OVERFLOW_LIMIT)
    const visibleSessions = isFiltering ? group.sessions : group.sessions.slice(0, revealLimit)

    for (const session of visibleSessions) {
      nextVisibleItems.push({
        focusKey: `project:${group.key}:${session.id}`,
        session,
      })
    }
  }

  return nextVisibleItems
}

export function buildFlatItems({
  pinnedSessions,
  groups,
  isFiltering,
  isLoading,
  hasError,
  editingProjectKey,
  isProjectCollapsed,
  store,
}: {
  pinnedSessions: SessionPreview[]
  groups: ProjectSessionGroup[]
  isFiltering: boolean
  isLoading: boolean
  hasError: boolean
  editingProjectKey: string | null
  isProjectCollapsed: (projectKey: string) => boolean
  store: SessionSidebarStore
}): VirtualSidebarItem[] {
  if (isLoading || hasError) return []

  const items: VirtualSidebarItem[] = []
  const pinnedSessionIds = new Set(pinnedSessions.map((session) => session.id))

  if (pinnedSessions.length > 0) {
    items.push({ kind: 'pinned-header', count: pinnedSessions.length })
    for (const session of pinnedSessions) {
      items.push({
        kind: 'session',
        focusKey: `pinned:${session.id}`,
        session,
        isPinned: true,
      })
    }
  }

  for (const group of groups) {
    const collapsed = isProjectCollapsed(group.key)
    const isEditing = editingProjectKey === group.key

    items.push({ kind: 'project-header', group, collapsed, isEditing })

    if (collapsed) continue

    const revealLimit = store.getRevealLimit(group.key, SESSION_OVERFLOW_LIMIT)
    const visibleSessions = isFiltering ? group.sessions : group.sessions.slice(0, revealLimit)

    for (const session of visibleSessions) {
      items.push({
        kind: 'session',
        focusKey: `project:${group.key}:${session.id}`,
        session,
        isPinned: pinnedSessionIds.has(session.id),
      })
    }

    if (!isFiltering) {
      const remaining = group.sessions.length - revealLimit
      if (remaining > 0) {
        items.push({
          kind: 'show-more',
          groupKey: group.key,
          groupLabel: group.label,
          remainingCount: remaining,
        })
      }
      if (revealLimit > SESSION_OVERFLOW_LIMIT) {
        items.push({
          kind: 'show-less',
          groupKey: group.key,
          groupLabel: group.label,
        })
      }
    }
  }

  return items
}

const PinnedHeader = ({ count }: { count: number }) => {
  return (
    <div className="flex items-center justify-between px-2 py-1" data-project-group="pinned">
      <div className="flex items-center gap-1.5">
        <Pin className="size-3 text-fd-ember-400/70" />
        <p className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">Pinned</p>
      </div>
      <span className="text-[10px] text-fd-tertiary">{count}</span>
    </div>
  )
}

const ShowMoreButton = ({
  groupKey,
  groupLabel,
  remainingCount,
  onRevealMore,
}: {
  groupKey: string
  groupLabel: string
  remainingCount: number
  onRevealMore: (key: string, batch: number) => void
}) => {
  return (
    <button
      aria-label={`Show more for ${groupLabel}`}
      className="px-2 py-1.5 text-left text-[10px] text-fd-tertiary transition-colors hover:text-fd-primary"
      type="button"
      onClick={() => onRevealMore(groupKey, SESSION_REVEAL_BATCH)}
    >
      Show {Math.min(remainingCount, SESSION_REVEAL_BATCH)} more
      {remainingCount > SESSION_REVEAL_BATCH ? ` of ${remainingCount}` : ''}
      ...
    </button>
  )
}

const ShowLessButton = ({
  groupKey,
  groupLabel,
  onCollapse,
}: {
  groupKey: string
  groupLabel: string
  onCollapse: (key: string) => void
}) => {
  return (
    <button
      aria-label={`Show fewer sessions for ${groupLabel}`}
      className="px-2 py-1.5 text-left text-[10px] text-fd-tertiary transition-colors hover:text-fd-primary"
      type="button"
      onClick={() => onCollapse(groupKey)}
    >
      Show less
    </button>
  )
}

function createFallbackVirtualRows(flatItems: VirtualSidebarItem[]) {
  const offsets: number[] = []
  let cumulative = 0

  for (const item of flatItems) {
    offsets.push(cumulative)
    switch (item.kind) {
      case 'pinned-header':
        cumulative += VIRTUAL_ITEM_HEIGHT.pinnedHeader
        break
      case 'project-header':
        cumulative += VIRTUAL_ITEM_HEIGHT.projectHeader
        break
      case 'session':
        cumulative += VIRTUAL_ITEM_HEIGHT.session
        break
      case 'show-more':
        cumulative += VIRTUAL_ITEM_HEIGHT.showMore
        break
      case 'show-less':
        cumulative += VIRTUAL_ITEM_HEIGHT.showLess
        break
    }
  }

  return flatItems.map((_, index) => ({
    index,
    key: index,
    start: offsets[index] ?? 0,
    size: 0,
  }))
}
