import {
  Archive,
  ClipboardCopy,
  Ellipsis,
  GitBranch,
  Minimize2,
  Pencil,
  Pin,
  RotateCcw,
} from 'lucide-react'
import type { KeyboardEvent } from 'react'

import { formatRelativeSessionTime } from '../../lib/sessionTime'
import type { SessionPreview } from '../../stores/SessionStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const STATUS_DOT: Record<string, string> = {
  active: 'bg-fd-session-active',
  waiting: 'bg-fd-warning',
  idle: 'bg-fd-tertiary/50',
  completed: 'bg-fd-ready',
  disconnected: 'bg-fd-tertiary/30',
  reconnecting: 'animate-pulse bg-fd-warning',
  orphaned: 'bg-fd-ember-400/50',
  error: 'bg-fd-ember-400',
}

interface SessionItemProps {
  focusKey: string
  isFocused: boolean
  isPinned: boolean
  isChild: boolean
  isSelected: boolean
  now: number
  onFocus: (focusKey: string | null) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, focusKey: string, sessionId: string) => void
  onArchiveSession?: (sessionId: string) => void
  onCopySessionId?: (sessionId: string) => void
  onCompactSession?: (sessionId: string) => void
  onForkSession?: (sessionId: string) => void
  onRenameSession?: (sessionId: string) => void
  onRewindSession?: (sessionId: string) => void
  onSelectSession: (sessionId: string) => void
  onTogglePinnedSession: (sessionId: string) => void
  setSessionRef: (focusKey: string, element: HTMLButtonElement | null) => void
  session: SessionPreview
}

export function SessionItem({
  focusKey,
  isFocused,
  isPinned,
  isChild,
  isSelected,
  now,
  onFocus,
  onKeyDown,
  onArchiveSession,
  onCopySessionId,
  onCompactSession,
  onForkSession,
  onRenameSession,
  onRewindSession,
  onSelectSession,
  onTogglePinnedSession,
  setSessionRef,
  session,
}: SessionItemProps) {
  const statusDot = STATUS_DOT[session.status] ?? 'bg-fd-tertiary/30'

  return (
    <div
      className={`group/row flex items-center rounded transition-colors ${
        isSelected ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
      } ${isFocused ? 'ring-1 ring-fd-ember-400/40' : ''}`}
    >
      <button
        ref={(element) => setSessionRef(focusKey, element)}
        className={`flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-canvas ${isChild ? 'pl-5 pr-1' : 'pl-2 pr-1'}`}
        type="button"
        title={session.title}
        tabIndex={isFocused ? 0 : -1}
        data-session-item={focusKey}
        data-session-id={session.id}
        onClick={() => onSelectSession(session.id)}
        onFocus={() => onFocus(focusKey)}
        onKeyDown={(event) => onKeyDown(event, focusKey, session.id)}
      >
        <span className={`size-1.5 shrink-0 rounded-full ${statusDot}`} />
        <span className="min-w-0 flex-1 truncate text-xs text-fd-primary">
          {isChild ? <span className="mr-1 text-fd-tertiary">&#8627;</span> : null}
          {session.title}
        </span>
      </button>

      <span className="shrink-0 pr-2 text-[10px] tabular-nums text-fd-tertiary group-hover/row:hidden group-has-[[data-state=open]]/row:hidden">
        {formatRelativeSessionTime(session.lastActivityAt ?? session.updatedAt, now)}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`More actions for ${session.title}`}
            className="mr-1 hidden size-5 shrink-0 items-center justify-center rounded text-fd-tertiary transition-colors hover:text-fd-primary group-hover/row:inline-flex data-[state=open]:inline-flex"
            type="button"
          >
            <Ellipsis className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[170px]">
          <DropdownMenuItem onClick={() => onTogglePinnedSession(session.id)}>
            <Pin className="size-3" />
            {isPinned ? 'Unpin session' : 'Pin session'}
          </DropdownMenuItem>
          {onRenameSession ? (
            <DropdownMenuItem onClick={() => onRenameSession(session.id)}>
              <Pencil className="size-3" />
              Rename session
            </DropdownMenuItem>
          ) : null}
          {onCopySessionId ? (
            <DropdownMenuItem onClick={() => onCopySessionId(session.id)}>
              <ClipboardCopy className="size-3" />
              Copy session ID
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {onForkSession ? (
            <DropdownMenuItem onClick={() => onForkSession(session.id)}>
              <GitBranch className="size-3" />
              Fork session
            </DropdownMenuItem>
          ) : null}
          {onCompactSession ? (
            <DropdownMenuItem onClick={() => onCompactSession(session.id)}>
              <Minimize2 className="size-3" />
              Compact session
            </DropdownMenuItem>
          ) : null}
          {onRewindSession ? (
            <DropdownMenuItem onClick={() => onRewindSession(session.id)}>
              <RotateCcw className="size-3" />
              Rewind session
            </DropdownMenuItem>
          ) : null}
          {onArchiveSession ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onArchiveSession(session.id)}>
                <Archive className="size-3" />
                Archive session
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
