import type { Observable } from '@legendapp/state'
import { useValue } from '@legendapp/state/react'
import {
  Archive,
  ClipboardCopy,
  Ellipsis,
  GitBranch,
  Minimize2,
  Pencil,
  Pin,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { type DragEvent, type KeyboardEvent, memo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatRelativeSessionTime } from '../../lib/sessionTime'
import type { SessionPreview } from '../../state/sessions/session.model'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const STATUS_DOT: Record<string, string> = {
  active: 'bg-fd-session-active',
  waiting: 'bg-fd-session-waiting',
  idle: '',
  completed: 'bg-fd-ready',
  disconnected: '',
  reconnecting: 'animate-pulse bg-fd-session-waiting',
  orphaned: 'bg-fd-ember-400/50',
  error: 'bg-fd-ember-400',
}

interface SessionItemProps {
  focusKey: string
  isFocused: boolean
  isPinned: boolean
  isSelected: boolean
  depth?: number
  now$: Observable<number>
  onFocus: (focusKey: string | null) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, focusKey: string, sessionId: string) => void
  onArchiveSession?: (sessionId: string) => void
  onCopySessionId?: (sessionId: string) => void
  onCompactSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
  onForkSession?: (sessionId: string) => void
  onRenameSession?: (sessionId: string) => void
  onRewindSession?: (sessionId: string) => void
  onSelectSession: (sessionId: string) => void
  onTogglePinnedSession: (sessionId: string) => void
  onSessionDragStart?: (event: DragEvent<HTMLDivElement>, sessionId: string) => void
  setSessionRef: (focusKey: string, element: HTMLButtonElement | null) => void
  session$: Observable<SessionPreview>
}

export const SessionItem = memo(function SessionItem({
  focusKey,
  isFocused,
  isPinned,
  isSelected,
  depth = 0,
  now$,
  onFocus,
  onKeyDown,
  onArchiveSession,
  onCopySessionId,
  onCompactSession,
  onDeleteSession,
  onForkSession,
  onRenameSession,
  onRewindSession,
  onSelectSession,
  onTogglePinnedSession,
  onSessionDragStart,
  setSessionRef,
  session$,
}: SessionItemProps) {
  const sessionId = useValue(session$.id)
  const title = useValue(session$.title)
  const status = useValue(session$.status)
  const parentSessionId = useValue(session$.parentSessionId)
  const derivationType = useValue(session$.derivationType)
  const lastActivityAt = useValue(session$.lastActivityAt)
  const updatedAt = useValue(session$.updatedAt)
  const now = useValue(now$)
  const isDerivedChild = Boolean(parentSessionId && derivationType !== 'fork')
  const isSubagent = derivationType === 'subagent'
  const effectiveStatus = isSubagent ? 'idle' : status
  const statusDot = STATUS_DOT[effectiveStatus] ?? ''
  const indentPx = (isDerivedChild ? 28 : 10) + depth * 14
  const actionItems = {
    isPinned,
    onArchiveSession,
    onCompactSession,
    onCopySessionId,
    onDeleteSession,
    onForkSession,
    onRenameSession,
    onRewindSession,
    onTogglePinnedSession,
    sessionId,
  } satisfies SessionActionItemsOptions

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={`group/row ox-sidebar-row flex items-center rounded-lg transition-colors ${
          isSelected ? 'bg-white/[0.1]' : 'hover:bg-white/[0.03]'
        }`}
        data-selected={isSelected ? 'true' : 'false'}
      >
        <button
          ref={(element) => setSessionRef(focusKey, element)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1 text-left"
          style={{ paddingLeft: indentPx }}
          type="button"
          draggable={!isDerivedChild}
          title={title}
          tabIndex={isFocused ? 0 : -1}
          data-session-item={focusKey}
          data-session-id={sessionId}
          onClick={() => onSelectSession(sessionId)}
          onDragStart={(event) => onSessionDragStart?.(event, sessionId)}
          onFocus={() => onFocus(focusKey)}
          onKeyDown={(event) => onKeyDown(event, focusKey, sessionId)}
        >
          {statusDot ? <span className={`size-1.5 shrink-0 rounded-full ${statusDot}`} /> : null}
          <span className="min-w-0 flex-1 truncate text-[13px] text-fd-primary">{title}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`More actions for ${title}`}
              className={cn(
                'ox-icon-button pointer-events-none mr-1 inline-flex size-6 shrink-0 items-center justify-center opacity-0',
                'group-hover/row:pointer-events-auto group-hover/row:opacity-100',
                // "data-[menu-open=true]:pointer-events-auto data-[menu-open=true]:opacity-100",
              )}
              type="button"
            >
              <Ellipsis className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[170px]">
            {renderSessionActionItems({
              ...actionItems,
              Item: DropdownMenuItemAdapter,
              Separator: DropdownMenuSeparatorAdapter,
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="shrink-0 pr-2 text-[10px] tabular-nums text-fd-tertiary group-hover/row:hidden group-has-[[data-menu-open=true]]/row:hidden">
          {formatRelativeSessionTime(lastActivityAt ?? updatedAt, now)}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="ox-overlay-panel min-w-[170px]">
        {renderSessionActionItems({
          ...actionItems,
          Item: ContextMenuItemAdapter,
          Separator: ContextMenuSeparatorAdapter,
        })}
      </ContextMenuContent>
    </ContextMenu>
  )
})

interface ActionItemProps {
  children: ReactNode
  onClick: () => void
  variant?: 'default' | 'destructive'
}

interface SessionActionItemsOptions {
  isPinned: boolean
  onArchiveSession?: (sessionId: string) => void
  onCopySessionId?: (sessionId: string) => void
  onCompactSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
  onForkSession?: (sessionId: string) => void
  onRenameSession?: (sessionId: string) => void
  onRewindSession?: (sessionId: string) => void
  onTogglePinnedSession: (sessionId: string) => void
  sessionId: string
}

function renderSessionActionItems({
  isPinned,
  Item,
  onArchiveSession,
  onCompactSession,
  onCopySessionId,
  onDeleteSession,
  onForkSession,
  onRenameSession,
  onRewindSession,
  onTogglePinnedSession,
  Separator,
  sessionId,
}: SessionActionItemsOptions & {
  Item: (props: ActionItemProps) => ReactNode
  Separator: () => ReactNode
}): ReactNode {
  return (
    <>
      <Item onClick={() => onTogglePinnedSession(sessionId)}>
        <Pin className="size-3.5" />
        {isPinned ? 'Unpin session' : 'Pin session'}
      </Item>
      {onRenameSession ? (
        <Item onClick={() => onRenameSession(sessionId)}>
          <Pencil className="size-3.5" />
          Rename session
        </Item>
      ) : null}
      {onCopySessionId ? (
        <Item onClick={() => onCopySessionId(sessionId)}>
          <ClipboardCopy className="size-3.5" />
          Copy session ID
        </Item>
      ) : null}
      <Separator />
      {onForkSession ? (
        <Item onClick={() => onForkSession(sessionId)}>
          <GitBranch className="size-3.5" />
          Fork session
        </Item>
      ) : null}
      {onCompactSession ? (
        <Item onClick={() => onCompactSession(sessionId)}>
          <Minimize2 className="size-3.5" />
          Compact session
        </Item>
      ) : null}
      {onRewindSession ? (
        <Item onClick={() => onRewindSession(sessionId)}>
          <RotateCcw className="size-3.5" />
          Rewind session
        </Item>
      ) : null}
      {onArchiveSession ? (
        <>
          <Separator />
          <Item onClick={() => onArchiveSession(sessionId)}>
            <Archive className="size-3.5" />
            Archive session
          </Item>
        </>
      ) : null}
      {onDeleteSession ? (
        <Item variant="destructive" onClick={() => onDeleteSession(sessionId)}>
          <Trash2 className="size-3.5" />
          Delete session
        </Item>
      ) : null}
    </>
  )
}

function DropdownMenuItemAdapter({ children, onClick, variant = 'default' }: ActionItemProps) {
  return (
    <DropdownMenuItem variant={variant} onClick={onClick}>
      {children}
    </DropdownMenuItem>
  )
}

function DropdownMenuSeparatorAdapter() {
  return <DropdownMenuSeparator />
}

function ContextMenuItemAdapter({ children, onClick, variant = 'default' }: ActionItemProps) {
  return (
    <ContextMenuItem variant={variant} onClick={onClick}>
      {children}
    </ContextMenuItem>
  )
}

function ContextMenuSeparatorAdapter() {
  return <ContextMenuSeparator />
}
