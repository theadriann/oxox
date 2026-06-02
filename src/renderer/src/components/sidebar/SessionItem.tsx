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
} from 'lucide-react'
import { type KeyboardEvent, memo } from 'react'

import { formatRelativeSessionTime } from '../../lib/sessionTime'
import type { SessionPreview } from '../../state/sessions/session.model'
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
  now$: Observable<number>
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
  session$: Observable<SessionPreview>
}

export const SessionItem = memo(function SessionItem({
  focusKey,
  isFocused,
  isPinned,
  isSelected,
  now$,
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
  session$,
}: SessionItemProps) {
  const sessionId = useValue(session$.id)
  const title = useValue(session$.title)
  const status = useValue(session$.status)
  const derivationType = useValue(session$.derivationType)
  const lastActivityAt = useValue(session$.lastActivityAt)
  const updatedAt = useValue(session$.updatedAt)
  const now = useValue(now$)
  const isChild = derivationType === 'subagent'
  const effectiveStatus = isChild ? 'idle' : status
  const statusDot = STATUS_DOT[effectiveStatus] ?? ''

  return (
    <div
      className={`group/row flex items-center rounded-lg transition-colors ${
        isSelected ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
      }`}
    >
      <button
        ref={(element) => setSessionRef(focusKey, element)}
        className={`flex min-w-0 flex-1 items-center gap-2 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-canvas ${isChild ? 'pl-7 pr-1' : 'pl-2.5 pr-1'}`}
        type="button"
        title={title}
        tabIndex={isFocused ? 0 : -1}
        data-session-item={focusKey}
        data-session-id={sessionId}
        onClick={() => onSelectSession(sessionId)}
        onFocus={() => onFocus(focusKey)}
        onKeyDown={(event) => onKeyDown(event, focusKey, sessionId)}
      >
        {statusDot ? <span className={`size-1.5 shrink-0 rounded-full ${statusDot}`} /> : null}
        <span className="min-w-0 flex-1 truncate text-[13px] text-fd-primary">{title}</span>
      </button>

      <span className="shrink-0 pr-2 text-[11px] tabular-nums text-fd-tertiary group-hover/row:hidden group-has-[[data-state=open]]/row:hidden">
        {formatRelativeSessionTime(lastActivityAt ?? updatedAt, now)}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`More actions for ${title}`}
            className="mr-1 hidden size-6 shrink-0 items-center justify-center rounded-md text-fd-tertiary transition-colors hover:text-fd-primary group-hover/row:inline-flex data-[state=open]:inline-flex"
            type="button"
          >
            <Ellipsis className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[170px]">
          <DropdownMenuItem onClick={() => onTogglePinnedSession(sessionId)}>
            <Pin className="size-3.5" />
            {isPinned ? 'Unpin session' : 'Pin session'}
          </DropdownMenuItem>
          {onRenameSession ? (
            <DropdownMenuItem onClick={() => onRenameSession(sessionId)}>
              <Pencil className="size-3.5" />
              Rename session
            </DropdownMenuItem>
          ) : null}
          {onCopySessionId ? (
            <DropdownMenuItem onClick={() => onCopySessionId(sessionId)}>
              <ClipboardCopy className="size-3.5" />
              Copy session ID
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {onForkSession ? (
            <DropdownMenuItem onClick={() => onForkSession(sessionId)}>
              <GitBranch className="size-3.5" />
              Fork session
            </DropdownMenuItem>
          ) : null}
          {onCompactSession ? (
            <DropdownMenuItem onClick={() => onCompactSession(sessionId)}>
              <Minimize2 className="size-3.5" />
              Compact session
            </DropdownMenuItem>
          ) : null}
          {onRewindSession ? (
            <DropdownMenuItem onClick={() => onRewindSession(sessionId)}>
              <RotateCcw className="size-3.5" />
              Rewind session
            </DropdownMenuItem>
          ) : null}
          {onArchiveSession ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onArchiveSession(sessionId)}>
                <Archive className="size-3.5" />
                Archive session
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})
