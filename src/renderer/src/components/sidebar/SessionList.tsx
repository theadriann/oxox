import type { Observable } from '@legendapp/state'
import { useValue } from '@legendapp/state/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pin,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { type DragEvent, type KeyboardEvent, useCallback } from 'react'
import type {
  ProjectSessionGroup,
  SessionFolder,
  SessionPreview,
} from '../../state/sessions/session.model'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { ProjectGroup, type ProjectGroupHeader } from './ProjectGroup'
import { SessionItem } from './SessionItem'
import type { RenderedSessionItem, SessionSidebarStore } from './SessionSidebarStore'

export const SESSION_OVERFLOW_LIMIT = 5
export const SESSION_REVEAL_BATCH = 10

const VIRTUAL_ITEM_HEIGHT = {
  pinnedHeader: 28,
  projectHeader: 52,
  folderHeader: 30,
  session: 30,
  showMore: 28,
  showLess: 28,
} as const

export type VirtualSidebarItem =
  | { kind: 'pinned-header'; count: number }
  | {
      kind: 'session'
      focusKey: string
      sessionId: string
      isPinned: boolean
      depth?: number
    }
  | {
      kind: 'project-header'
      projectKey: string
      label: string
      workspacePath: string | null
      sessionCount: number
      collapsed: boolean
      isEditing: boolean
    }
  | {
      kind: 'folder-header'
      folderId: string
      projectKey: string
      workspacePath: string | null
      name: string
      depth: number
      collapsed: boolean
      sessionCount: number
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
  sessionsById$: Observable<Record<string, SessionPreview>>
  focusedKey: string | null
  selectedSessionId: string
  store: SessionSidebarStore
  sessionRefs: Map<string, HTMLButtonElement>
  scrollAreaRef: React.RefObject<HTMLDivElement | null>
  onToggleProject: (projectKey: string) => void
  onToggleFolder: (folderId: string) => void
  onNewSession: (workspacePath?: string, folderId?: string | null) => void
  onSetProjectDisplayName: (projectKey: string, value: string) => void
  onArchiveProject?: (projectKey: string) => void
  onArchiveSession?: (sessionId: string) => void
  onCopySessionId?: (sessionId: string) => void
  onCompactSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
  onForkSession?: (sessionId: string) => void
  onRenameSession?: (sessionId: string) => void
  onRewindSession?: (sessionId: string) => void
  onSelectSession: (sessionId: string) => void
  onTogglePinnedSession: (sessionId: string) => void
  onCreateFolder?: (projectKey: string, parentFolderId?: string | null) => void
  onRenameFolder?: (folderId: string, name: string) => void
  onDeleteFolder?: (folderId: string) => void
  onMoveSessionToFolder?: (sessionId: string, folderId: string) => void
  onMoveSessionToProject?: (sessionId: string, projectKey: string) => void
  onMoveFolder?: (folderId: string, projectKey: string, parentFolderId?: string | null) => void
  onSessionKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    focusKey: string,
    sessionId: string,
  ) => void
  onFocus: (focusKey: string | null) => void
}

export function SessionList({
  flatItems,
  sessionsById$,
  focusedKey,
  selectedSessionId,
  store,
  sessionRefs,
  scrollAreaRef,
  onToggleProject,
  onToggleFolder,
  onNewSession,
  onSetProjectDisplayName,
  onArchiveProject,
  onArchiveSession,
  onCopySessionId,
  onCompactSession,
  onDeleteSession,
  onForkSession,
  onRenameSession,
  onRewindSession,
  onSelectSession,
  onTogglePinnedSession,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveSessionToFolder,
  onMoveSessionToProject,
  onMoveFolder,
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
        case 'folder-header':
          return VIRTUAL_ITEM_HEIGHT.folderHeader
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
  const setSessionRef = useCallback(
    (focusKey: string, element: HTMLButtonElement | null) => {
      if (element) {
        sessionRefs.set(focusKey, element)
        return
      }
      sessionRefs.delete(focusKey)
    },
    [sessionRefs],
  )
  const handleSessionDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, sessionId: string) => {
      event.dataTransfer.setData('text/plain', `session:${sessionId}`)
      event.dataTransfer.effectAllowed = 'move'
    },
    [],
  )

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
                group={toProjectGroupHeader(item)}
                collapsed={item.collapsed}
                isEditing={item.isEditing}
                store={store}
                onToggleProject={onToggleProject}
                onNewSession={onNewSession}
                onSetProjectDisplayName={onSetProjectDisplayName}
                onArchiveProject={onArchiveProject}
                onCreateFolder={onCreateFolder}
                onDropSessionToProject={onMoveSessionToProject}
                onDropFolderToProject={(folderId, projectKey) =>
                  onMoveFolder?.(folderId, projectKey, null)
                }
              />
            ) : item.kind === 'folder-header' ? (
              <FolderHeader
                item={item}
                store={store}
                onToggleFolder={onToggleFolder}
                onNewSession={onNewSession}
                onCreateFolder={onCreateFolder}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                onMoveSessionToFolder={onMoveSessionToFolder}
                onMoveFolder={onMoveFolder}
              />
            ) : item.kind === 'session' ? (
              <SessionItem
                depth={item.depth ?? 0}
                focusKey={item.focusKey}
                isFocused={item.focusKey === focusedKey}
                isPinned={item.isPinned}
                isSelected={item.sessionId === selectedSessionId}
                now$={store.state$.now}
                onFocus={onFocus}
                onKeyDown={onSessionKeyDown}
                onArchiveSession={onArchiveSession}
                onCopySessionId={onCopySessionId}
                onCompactSession={onCompactSession}
                onDeleteSession={onDeleteSession}
                onForkSession={onForkSession}
                onRenameSession={onRenameSession}
                onRewindSession={onRewindSession}
                onSelectSession={onSelectSession}
                onTogglePinnedSession={onTogglePinnedSession}
                onSessionDragStart={handleSessionDragStart}
                setSessionRef={setSessionRef}
                session$={sessionsById$[item.sessionId]}
              />
            ) : item.kind === 'show-more' ? (
              <ShowMoreButton
                groupKey={item.groupKey}
                groupLabel={item.groupLabel}
                remainingCount={item.remainingCount}
                onRevealMore={store.revealMoreSessions}
                onRevealAll={store.revealAllSessions}
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
  sessionFolders: SessionFolder[],
  sessionFolderAssignments: Record<string, string>,
  isFiltering: boolean,
  isProjectCollapsed: (projectKey: string) => boolean,
  isFolderCollapsed: (folderId: string) => boolean,
  store: SessionSidebarStore,
): RenderedSessionItem[] {
  const nextVisibleItems: RenderedSessionItem[] = pinnedSessions.map((session) => ({
    focusKey: `pinned:${session.id}`,
    sessionId: session.id,
  }))

  for (const group of groups) {
    if (isProjectCollapsed(group.key)) continue

    for (const session of buildProjectSessionRows({
      group,
      sessionFolders,
      sessionFolderAssignments,
      isFiltering,
      isFolderCollapsed,
      store,
    })) {
      nextVisibleItems.push({
        focusKey: session.focusKey,
        sessionId: session.session.id,
      })
    }
  }

  return nextVisibleItems
}

export function buildFlatItems({
  pinnedSessions,
  groups,
  sessionFolders,
  sessionFolderAssignments,
  isFiltering,
  isLoading,
  hasError,
  editingProjectKey,
  editingFolderId,
  isProjectCollapsed,
  isFolderCollapsed,
  store,
}: {
  pinnedSessions: SessionPreview[]
  groups: ProjectSessionGroup[]
  sessionFolders: SessionFolder[]
  sessionFolderAssignments: Record<string, string>
  isFiltering: boolean
  isLoading: boolean
  hasError: boolean
  editingProjectKey: string | null
  editingFolderId: string | null
  isProjectCollapsed: (projectKey: string) => boolean
  isFolderCollapsed: (folderId: string) => boolean
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
        sessionId: session.id,
        isPinned: true,
      })
    }
  }

  for (const group of groups) {
    const collapsed = isProjectCollapsed(group.key)
    const isEditing = editingProjectKey === group.key

    items.push({
      kind: 'project-header',
      projectKey: group.key,
      label: group.label,
      workspacePath: group.workspacePath,
      sessionCount: group.sessions.length,
      collapsed,
      isEditing,
    })

    if (collapsed) continue

    const rows = buildProjectTreeRows({
      group,
      sessionFolders,
      sessionFolderAssignments,
      isFiltering,
      isFolderCollapsed,
      store,
    })

    for (const row of rows) {
      if (row.kind === 'folder') {
        items.push({
          kind: 'folder-header',
          folderId: row.folder.id,
          projectKey: row.folder.projectKey,
          workspacePath: group.workspacePath,
          name: row.folder.name,
          depth: row.depth,
          collapsed: isFolderCollapsed(row.folder.id),
          sessionCount: row.sessionCount,
          isEditing: editingFolderId === row.folder.id,
        })
        continue
      }

      items.push({
        kind: 'session',
        focusKey: row.focusKey,
        sessionId: row.session.id,
        isPinned: pinnedSessionIds.has(row.session.id),
        depth: row.depth,
      })
    }

    if (!isFiltering) {
      const revealLimit = store.getRevealLimit(group.key, SESSION_OVERFLOW_LIMIT)
      const remaining =
        countLooseProjectRootSessions({
          group,
          sessionFolders,
          sessionFolderAssignments,
        }) - revealLimit
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
    <div className="flex items-center justify-between px-3 py-1.5" data-project-group="pinned">
      <div className="flex items-center gap-1.5">
        <Pin className="size-3 text-fd-ember-400/70" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-fd-tertiary">
          Pinned
        </p>
      </div>
      <span className="text-[10px] tabular-nums text-fd-tertiary">{count}</span>
    </div>
  )
}

type ProjectTreeRow =
  | {
      kind: 'folder'
      folder: SessionFolder
      depth: number
      sessionCount: number
    }
  | {
      kind: 'session'
      session: SessionPreview
      depth: number
      focusKey: string
    }

function buildProjectSessionRows(
  options: Parameters<typeof buildProjectTreeRows>[0],
): Extract<ProjectTreeRow, { kind: 'session' }>[] {
  return buildProjectTreeRows(options).filter(
    (row): row is Extract<ProjectTreeRow, { kind: 'session' }> => row.kind === 'session',
  )
}

function buildProjectTreeRows({
  group,
  sessionFolders,
  sessionFolderAssignments,
  isFiltering,
  isFolderCollapsed,
  store,
}: {
  group: ProjectSessionGroup
  sessionFolders: SessionFolder[]
  sessionFolderAssignments: Record<string, string>
  isFiltering: boolean
  isFolderCollapsed: (folderId: string) => boolean
  store: SessionSidebarStore
}): ProjectTreeRow[] {
  const projectFolders = sessionFolders
    .filter((folder) => folder.projectKey === group.key)
    .sort(compareFolders)
  const projectFolderIds = new Set(projectFolders.map((folder) => folder.id))
  const childSessionsByParentId = new Map<string, SessionPreview[]>()
  const rootSessions: SessionPreview[] = []

  for (const session of group.sessions) {
    if (isNestedChildSession(session) && session.parentSessionId) {
      childSessionsByParentId.set(session.parentSessionId, [
        ...(childSessionsByParentId.get(session.parentSessionId) ?? []),
        session,
      ])
      continue
    }

    rootSessions.push(session)
  }

  const rootSessionsByFolderId = new Map<string, SessionPreview[]>()
  const looseRootSessions: SessionPreview[] = []

  for (const session of rootSessions) {
    const folderId = sessionFolderAssignments[session.id]
    if (folderId && projectFolderIds.has(folderId)) {
      rootSessionsByFolderId.set(folderId, [
        ...(rootSessionsByFolderId.get(folderId) ?? []),
        session,
      ])
      continue
    }

    looseRootSessions.push(session)
  }
  const visibleLooseRootSessions = isFiltering
    ? looseRootSessions
    : looseRootSessions.slice(0, store.getRevealLimit(group.key, SESSION_OVERFLOW_LIMIT))

  const rows: ProjectTreeRow[] = []
  const appendSession = (session: SessionPreview, depth: number, focusPrefix: string) => {
    rows.push({
      kind: 'session',
      session,
      depth,
      focusKey: `${focusPrefix}:${session.id}`,
    })

    for (const childSession of childSessionsByParentId.get(session.id) ?? []) {
      appendSession(childSession, depth + 1, `${focusPrefix}:${session.id}:child`)
    }
  }
  const appendFolder = (folder: SessionFolder, depth: number) => {
    rows.push({
      kind: 'folder',
      folder,
      depth,
      sessionCount: countFolderSessions(folder.id, projectFolders, rootSessionsByFolderId),
    })

    if (isFolderCollapsed(folder.id)) return

    for (const childFolder of projectFolders.filter(
      (candidate) => candidate.parentFolderId === folder.id,
    )) {
      appendFolder(childFolder, depth + 1)
    }

    for (const session of rootSessionsByFolderId.get(folder.id) ?? []) {
      appendSession(session, depth + 1, `project:${group.key}:folder:${folder.id}`)
    }
  }

  for (const folder of projectFolders.filter((candidate) => candidate.parentFolderId === null)) {
    appendFolder(folder, 0)
  }

  for (const session of visibleLooseRootSessions) {
    appendSession(session, 0, `project:${group.key}`)
  }

  return rows
}

function countLooseProjectRootSessions({
  group,
  sessionFolders,
  sessionFolderAssignments,
}: {
  group: ProjectSessionGroup
  sessionFolders: SessionFolder[]
  sessionFolderAssignments: Record<string, string>
}): number {
  const projectFolderIds = new Set(
    sessionFolders.filter((folder) => folder.projectKey === group.key).map((folder) => folder.id),
  )

  return group.sessions.filter((session) => {
    if (isNestedChildSession(session)) {
      return false
    }

    const folderId = sessionFolderAssignments[session.id]
    return !folderId || !projectFolderIds.has(folderId)
  }).length
}

function compareFolders(left: SessionFolder, right: SessionFolder): number {
  return left.order - right.order || left.name.localeCompare(right.name)
}

function countFolderSessions(
  folderId: string,
  folders: SessionFolder[],
  rootSessionsByFolderId: Map<string, SessionPreview[]>,
): number {
  let count = rootSessionsByFolderId.get(folderId)?.length ?? 0

  for (const childFolder of folders.filter((folder) => folder.parentFolderId === folderId)) {
    count += countFolderSessions(childFolder.id, folders, rootSessionsByFolderId)
  }

  return count
}

function isNestedChildSession(session: SessionPreview): boolean {
  return Boolean(
    session.parentSessionId && session.derivationType && session.derivationType !== 'fork',
  )
}

const FolderHeader = ({
  item,
  store,
  onToggleFolder,
  onNewSession,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveSessionToFolder,
  onMoveFolder,
}: {
  item: Extract<VirtualSidebarItem, { kind: 'folder-header' }>
  store: SessionSidebarStore
  onToggleFolder: (folderId: string) => void
  onNewSession: (workspacePath?: string, folderId?: string | null) => void
  onCreateFolder?: (projectKey: string, parentFolderId?: string | null) => void
  onRenameFolder?: (folderId: string, name: string) => void
  onDeleteFolder?: (folderId: string) => void
  onMoveSessionToFolder?: (sessionId: string, folderId: string) => void
  onMoveFolder?: (folderId: string, projectKey: string, parentFolderId?: string | null) => void
}) => {
  const draftFolderName = useValue(() => store.draftFolderName)
  const focusFolderInput = useCallback((element: HTMLInputElement | null) => {
    element?.select()
  }, [])
  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('text/plain', `folder:${item.folderId}`)
    event.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!onMoveSessionToFolder && !onMoveFolder) return
    event.preventDefault()
  }
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const dragPayload = parseSidebarDragPayload(event.dataTransfer.getData('text/plain'))
    if (!dragPayload) return

    event.preventDefault()
    if (dragPayload.kind === 'session') {
      onMoveSessionToFolder?.(dragPayload.id, item.folderId)
      return
    }

    onMoveFolder?.(dragPayload.id, item.projectKey, item.folderId)
  }
  const submitFolderName = () => {
    if (!onRenameFolder) {
      store.cancelFolderEditing()
      return
    }

    store.submitFolderName(item.folderId, onRenameFolder)
  }

  if (item.isEditing) {
    return (
      <div
        className="group/folder ox-sidebar-row flex items-center gap-1 rounded-lg px-2 py-1 text-fd-secondary transition-colors hover:bg-white/[0.03]"
        style={{ paddingLeft: 16 + item.depth * 14 }}
      >
        <FolderOpen className="size-3.5 shrink-0 text-fd-tertiary" />
        <label className="sr-only" htmlFor={`folder-name-${item.folderId}`}>
          Folder name for {item.name}
        </label>
        <input
          id={`folder-name-${item.folderId}`}
          aria-label={`Folder name for ${item.name}`}
          ref={focusFolderInput}
          className="min-w-0 flex-1 rounded border border-fd-border-default bg-fd-surface px-2 py-1 text-xs text-fd-primary outline-none transition-colors focus:border-fd-ember-400"
          value={draftFolderName}
          onChange={(event) => store.setDraftFolderName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitFolderName()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              store.cancelFolderEditing()
            }
          }}
        />
        <button
          aria-label="Save folder name"
          className="ox-icon-button inline-flex size-6 items-center justify-center text-fd-primary"
          type="button"
          onClick={submitFolderName}
        >
          <Check className="size-3.5" />
        </button>
        <button
          aria-label="Cancel folder name edit"
          className="ox-icon-button inline-flex size-6 items-center justify-center text-fd-secondary"
          type="button"
          onClick={store.cancelFolderEditing}
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="group/folder ox-sidebar-row flex items-center rounded-lg px-2 py-1 text-fd-secondary transition-colors hover:bg-white/[0.03]"
      style={{ paddingLeft: 16 + item.depth * 14 }}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left"
        type="button"
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => onToggleFolder(item.folderId)}
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-fd-tertiary transition-transform duration-150 ${
            item.collapsed ? '' : 'rotate-90'
          }`}
        />
        {item.collapsed ? (
          <Folder className="size-3.5 shrink-0 text-fd-tertiary" />
        ) : (
          <FolderOpen className="size-3.5 shrink-0 text-fd-tertiary" />
        )}
        <span className="min-w-0 flex-1 truncate text-[12px]">{item.name}</span>
        <span className="text-[10px] tabular-nums text-fd-tertiary">{item.sessionCount}</span>
      </button>
      <button
        aria-label={`Create session in ${item.name}`}
        className="ox-icon-button ml-1 inline-flex size-6 items-center justify-center opacity-0 transition-all group-hover/folder:opacity-100"
        type="button"
        onClick={() => onNewSession(item.workspacePath ?? undefined, item.folderId)}
      >
        <Plus className="size-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`More actions for ${item.name}`}
            className="ox-icon-button inline-flex size-6 items-center justify-center opacity-0 transition-all group-hover/folder:opacity-100"
            type="button"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[170px]">
          {onCreateFolder ? (
            <DropdownMenuItem onClick={() => onCreateFolder(item.projectKey, item.folderId)}>
              <FolderPlus className="size-3.5" />
              New nested folder
            </DropdownMenuItem>
          ) : null}
          {onRenameFolder ? (
            <DropdownMenuItem
              onClick={() =>
                store.startEditingFolder({
                  id: item.folderId,
                  name: item.name,
                })
              }
            >
              Rename folder
            </DropdownMenuItem>
          ) : null}
          {onDeleteFolder ? (
            <DropdownMenuItem onClick={() => onDeleteFolder(item.folderId)}>
              <Trash2 className="size-3.5" />
              Delete folder
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

type SidebarDragPayload =
  | {
      kind: 'session'
      id: string
    }
  | {
      kind: 'folder'
      id: string
    }

function parseSidebarDragPayload(value: string): SidebarDragPayload | null {
  const [kind, id] = value.split(':')
  if ((kind === 'session' || kind === 'folder') && id) {
    return { kind, id }
  }

  return null
}

const ShowMoreButton = ({
  groupKey,
  groupLabel,
  remainingCount,
  onRevealMore,
  onRevealAll,
}: {
  groupKey: string
  groupLabel: string
  remainingCount: number
  onRevealMore: (key: string, batch: number) => void
  onRevealAll: (key: string) => void
}) => {
  return (
    <div className="flex items-center justify-between gap-1">
      <button
        aria-label={`Show more for ${groupLabel}`}
        className="px-3 py-1.5 text-left text-[11px] text-fd-tertiary transition-colors hover:text-fd-primary"
        type="button"
        onClick={() => onRevealMore(groupKey, SESSION_REVEAL_BATCH)}
      >
        Show {Math.min(remainingCount, SESSION_REVEAL_BATCH)} more
        {remainingCount > SESSION_REVEAL_BATCH ? ` of ${remainingCount}` : ''}
        ...
      </button>
      <button
        aria-label={`Show all sessions for ${groupLabel}`}
        className="px-3 py-1.5 text-left text-[10px] text-fd-tertiary transition-colors hover:text-fd-primary"
        type="button"
        onClick={() => onRevealAll(groupKey)}
      >
        Show all
      </button>
    </div>
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
      className="px-3 py-1.5 text-left text-[11px] text-fd-tertiary transition-colors hover:text-fd-primary"
      type="button"
      onClick={() => onCollapse(groupKey)}
    >
      Show less
    </button>
  )
}

function toProjectGroupHeader(
  item: Extract<VirtualSidebarItem, { kind: 'project-header' }>,
): ProjectGroupHeader {
  return {
    key: item.projectKey,
    label: item.label,
    workspacePath: item.workspacePath,
    sessionCount: item.sessionCount,
  }
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
      case 'folder-header':
        cumulative += VIRTUAL_ITEM_HEIGHT.folderHeader
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
