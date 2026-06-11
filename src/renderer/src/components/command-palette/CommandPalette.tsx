import type { Observable } from '@legendapp/state'
import { useValue } from '@legendapp/state/react'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Command as CommandIcon, FolderSearch, Hash, Search, Zap } from 'lucide-react'
import { memo, type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import type {
  SessionSearchMatch,
  SessionSearchReason,
  SessionSearchTarget,
} from '../../../../shared/ipc/contracts'
import { cn } from '../../lib/utils'
import type { SessionPreview } from '../../state/sessions/session.model'

const MAX_VISIBLE_SESSIONS = 50

const SESSION_COMMAND_IDS = new Set([
  'attach-session',
  'detach-session',
  'copy-session-id',
  'rename-session',
  'rewind-session',
  'fork-session',
  'compact-session',
])

function isSessionCommand(id: string): boolean {
  return SESSION_COMMAND_IDS.has(id) || id.startsWith('plugin-capability:')
}

/**
 * Cheap case-insensitive substring filter for cmdk.
 * Returns 1 (match) or 0 (no match) — replaces cmdk's default
 * scoring algorithm which is the root cause of input lag on large lists.
 */
function substringFilter(value: string, search: string, keywords?: string[]): number {
  const lower = search.toLowerCase()
  if (value.toLowerCase().includes(lower)) return 1
  if (keywords?.some((keyword) => keyword.toLowerCase().includes(lower))) return 1
  return 0
}

export interface CommandPaletteAction {
  id: string
  label: string
  description: string
  keywords?: string[]
  icon: LucideIcon
  closeOnSelect?: boolean
  disabled?: boolean
  onSelect: () => void
}

export interface CommandPaletteProps {
  open: boolean
  commands: CommandPaletteAction[]
  sessions?: SessionPreview[]
  sessionIds?: string[]
  sessionsById$?: Observable<Record<string, SessionPreview>>
  onOpenChange: (open: boolean) => void
  onSelectSession: (sessionId: string, target?: SessionSearchTarget) => void
  onSearchChange?: (query: string) => void
  searchMatches?: readonly SessionSearchMatch[] | null
  forceMountSessionResults?: boolean
}

export function CommandPalette({
  open,
  commands,
  sessions = [],
  sessionIds,
  sessionsById$,
  onOpenChange,
  onSelectSession,
  onSearchChange,
  searchMatches,
  forceMountSessionResults = false,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hasQuery = search.trim().length > 0

  const globalCommands = useMemo(
    () => commands.filter((command) => !isSessionCommand(command.id)),
    [commands],
  )
  const sessionCommands = useMemo(
    () => commands.filter((command) => isSessionCommand(command.id)),
    [commands],
  )
  const sessionIdsToRender = useMemo(
    () =>
      hasQuery
        ? (sessionIds ?? sessions.map((session) => session.id)).slice(0, MAX_VISIBLE_SESSIONS)
        : [],
    [hasQuery, sessionIds, sessions],
  )
  const searchMatchesBySessionId = useMemo(
    () => new Map((searchMatches ?? []).map((match) => [match.sessionId, match])),
    [searchMatches],
  )

  const handleValueChange = useCallback(
    (value: string) => {
      setSearch(value)
      onSearchChange?.(value)
    },
    [onSearchChange],
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setSearch('')
        onSearchChange?.('')
      }

      onOpenChange(nextOpen)
    },
    [onOpenChange, onSearchChange],
  )

  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node

      if (node && open) {
        window.requestAnimationFrame(() => node.focus())
      }
    },
    [open],
  )

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      filter={substringFilter}
      label="Command palette"
      loop={true}
      overlayClassName="fixed inset-0 z-40 bg-fd-overlay/95 backdrop-blur-[12px] animate-in fade-in-0 duration-150"
      contentClassName="fixed left-1/2 top-[13vh] z-50 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-fd-border-strong/60 bg-fd-elevated shadow-[0_24px_64px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)] animate-in fade-in-0 slide-in-from-top-4 zoom-in-[0.98] duration-200"
    >
      <Dialog.Title className="sr-only">Command palette</Dialog.Title>
      <Dialog.Description className="sr-only">
        Search default commands and session names, then press Enter to execute the highlighted
        result.
      </Dialog.Description>

      <div className="overflow-hidden rounded-2xl bg-fd-elevated">
        {/* Search input */}
        <div className="relative flex items-center gap-3 border-b border-fd-border-subtle px-4 py-3">
          <div className="relative flex size-5 shrink-0 items-center justify-center">
            <Search className="size-[15px] text-fd-tertiary transition-colors duration-150" />
          </div>
          <Command.Input
            ref={setInputRef}
            aria-label="Search commands and sessions"
            value={search}
            onValueChange={handleValueChange}
            placeholder="Type a command or search..."
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-fd-primary caret-fd-ember-400 outline-none placeholder:text-fd-tertiary/70"
          />
          <kbd className="flex h-[22px] items-center rounded-[5px] border border-fd-border-default bg-fd-surface px-1.5 font-mono text-[10px] font-medium text-fd-tertiary">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[min(56vh,30rem)] overflow-y-auto overscroll-contain py-1 [scroll-padding-block:0.375rem]">
          <Command.Empty className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-xl border border-fd-border-default bg-fd-panel text-fd-tertiary">
              <Search className="size-4" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-fd-secondary">No results found</p>
              <p className="mt-0.5 text-[11px] text-fd-tertiary">Try a different search term</p>
            </div>
          </Command.Empty>

          <CommandPaletteCommandGroups commands={globalCommands} onOpenChange={onOpenChange} />
          <CommandPaletteCommandGroups
            commands={sessionCommands}
            heading={<GroupLabel icon={Hash}>Session</GroupLabel>}
            onOpenChange={onOpenChange}
          />
          <CommandPaletteSessionResults
            forceMountSessionResults={forceMountSessionResults}
            onOpenChange={onOpenChange}
            onSelectSession={onSelectSession}
            sessionIds={sessionIdsToRender}
            searchMatchesBySessionId={searchMatchesBySessionId}
            sessions={sessions}
            sessionsById$={sessionsById$}
          />
        </Command.List>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-fd-border-subtle/80 bg-fd-canvas/40 px-4 py-2">
          <div className="flex items-center gap-1.5 text-fd-tertiary">
            <CommandIcon className="size-3" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">OXOX</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-fd-tertiary">
            <span className="flex items-center gap-1">
              <Kbd>&uarr;&darr;</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>&crarr;</Kbd> select
            </span>
          </div>
        </div>
      </div>
    </Command.Dialog>
  )
}

const CommandPaletteCommandGroups = memo(function CommandPaletteCommandGroups({
  commands,
  heading = <GroupLabel icon={Zap}>Quick actions</GroupLabel>,
  onOpenChange,
}: {
  commands: CommandPaletteAction[]
  heading?: ReactNode
  onOpenChange: (open: boolean) => void
}) {
  if (commands.length === 0) {
    return null
  }

  return (
    <Command.Group heading={heading}>
      {commands.map((command) => (
        <PaletteItem
          key={command.id}
          value={command.label}
          keywords={command.keywords}
          disabled={command.disabled}
          onSelect={() => {
            if (command.disabled) return
            command.onSelect()
            if (command.closeOnSelect !== false) onOpenChange(false)
          }}
        >
          <CommandItemIcon icon={command.icon} />
          <ItemContent label={command.label} hint={command.description} />
          <ItemTrail />
        </PaletteItem>
      ))}
    </Command.Group>
  )
})

const CommandPaletteSessionResults = memo(function CommandPaletteSessionResults({
  forceMountSessionResults,
  onOpenChange,
  onSelectSession,
  searchMatchesBySessionId,
  sessionIds,
  sessions,
  sessionsById$,
}: {
  forceMountSessionResults: boolean
  onOpenChange: (open: boolean) => void
  onSelectSession: (sessionId: string, target?: SessionSearchTarget) => void
  searchMatchesBySessionId: ReadonlyMap<string, SessionSearchMatch>
  sessionIds: string[]
  sessions: SessionPreview[]
  sessionsById$?: Observable<Record<string, SessionPreview>>
}) {
  if (sessionIds.length === 0) {
    return null
  }

  const sessionsById = sessionsById$
    ? null
    : new Map(sessions.map((session) => [session.id, session]))

  return (
    <Command.Group heading={<GroupLabel icon={FolderSearch}>Sessions</GroupLabel>}>
      {sessionIds.map((sessionId) =>
        sessionsById$ ? (
          <ObservableSessionItem
            key={sessionId}
            forceMount={forceMountSessionResults}
            onOpenChange={onOpenChange}
            onSelectSession={onSelectSession}
            searchMatch={searchMatchesBySessionId.get(sessionId)}
            session$={sessionsById$[sessionId]}
          />
        ) : (
          <SessionItem
            key={sessionId}
            session={sessionsById?.get(sessionId)}
            forceMount={forceMountSessionResults}
            onSelectSession={onSelectSession}
            onOpenChange={onOpenChange}
            searchMatch={searchMatchesBySessionId.get(sessionId)}
          />
        ),
      )}
    </Command.Group>
  )
})

function GroupLabel({ children, icon: Icon }: { children: string; icon: LucideIcon }) {
  return (
    <div className="flex items-center gap-1.5 px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fd-tertiary/80">
      <Icon className="size-3 opacity-70" />
      {children}
    </div>
  )
}

function PaletteItem({
  children,
  ...props
}: React.ComponentProps<typeof Command.Item> & { children: ReactNode }) {
  return (
    <Command.Item
      className={cn(
        'group mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-left outline-none',
        'transition-[background-color,box-shadow] duration-100',
        'hover:bg-fd-panel/70',
        'data-[selected=true]:bg-fd-panel data-[selected=true]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]',
        'data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-35',
      )}
      {...props}
    >
      {children}
    </Command.Item>
  )
}

function CommandItemIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-lg',
        'border border-fd-border-default bg-fd-surface text-fd-ember-400',
        'transition-all duration-100',
        'group-data-[selected=true]:border-fd-ember-400/25 group-data-[selected=true]:bg-fd-ember-400/[0.08] group-data-[selected=true]:text-fd-ember-400',
      )}
    >
      <Icon className="size-3.5" />
    </div>
  )
}

function ItemContent({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-medium leading-tight text-fd-primary">
        {label}
      </span>
      <span className="block truncate text-[11px] leading-tight text-fd-tertiary opacity-70 transition-opacity duration-100 group-data-[selected=true]:text-fd-secondary group-data-[selected=true]:opacity-100">
        {hint}
      </span>
    </div>
  )
}

function ItemTrail() {
  return (
    <ArrowRight className="size-3 shrink-0 text-fd-tertiary opacity-0 transition-all duration-100 group-data-[selected=true]:translate-x-0 group-data-[selected=true]:opacity-50" />
  )
}

const SessionItem = memo(function SessionItem({
  forceMount,
  onOpenChange,
  onSelectSession,
  searchMatch,
  session,
}: {
  forceMount: boolean
  onOpenChange: (open: boolean) => void
  onSelectSession: (sessionId: string, target?: SessionSearchTarget) => void
  searchMatch?: SessionSearchMatch
  session?: SessionPreview
}) {
  if (!session) {
    return null
  }
  const fragmentReasons = getFragmentReasons(searchMatch)
  const searchTarget = getSearchTarget(session.id, searchMatch)

  return (
    <PaletteItem
      forceMount={forceMount}
      value={`${session.id} ${session.title} ${fragmentReasons.map((reason) => reason.snippet).join(' ')}`}
      keywords={[
        session.title,
        session.projectLabel,
        session.projectWorkspacePath ?? '',
        session.status,
        ...fragmentReasons.map((reason) => reason.snippet),
      ]}
      onSelect={() => {
        onSelectSession(session.id, searchTarget)
        onOpenChange(false)
      }}
    >
      <SessionDot status={session.status} />
      <SessionSearchItemContent
        fragmentReasons={fragmentReasons}
        hint={`${session.projectLabel} · ${session.status}`}
        label={session.title}
      />
      <ItemTrail />
    </PaletteItem>
  )
})

const ObservableSessionItem = memo(function ObservableSessionItem({
  forceMount,
  onOpenChange,
  onSelectSession,
  searchMatch,
  session$,
}: {
  forceMount: boolean
  onOpenChange: (open: boolean) => void
  onSelectSession: (sessionId: string, target?: SessionSearchTarget) => void
  searchMatch?: SessionSearchMatch
  session$: Observable<SessionPreview>
}) {
  const id = useValue(session$.id)
  const title = useValue(session$.title)
  const projectLabel = useValue(session$.projectLabel)
  const projectWorkspacePath = useValue(session$.projectWorkspacePath)
  const status = useValue(session$.status)
  const fragmentReasons = getFragmentReasons(searchMatch)
  const searchTarget = getSearchTarget(id, searchMatch)

  return (
    <PaletteItem
      forceMount={forceMount}
      value={`${id} ${title} ${fragmentReasons.map((reason) => reason.snippet).join(' ')}`}
      keywords={[
        title,
        projectLabel,
        projectWorkspacePath ?? '',
        status,
        ...fragmentReasons.map((reason) => reason.snippet),
      ]}
      onSelect={() => {
        onSelectSession(id, searchTarget)
        onOpenChange(false)
      }}
    >
      <SessionDot status={status} />
      <SessionSearchItemContent
        fragmentReasons={fragmentReasons}
        hint={`${projectLabel} · ${status}`}
        label={title}
      />
      <ItemTrail />
    </PaletteItem>
  )
})

function SessionSearchItemContent({
  fragmentReasons,
  hint,
  label,
}: {
  fragmentReasons: SessionSearchReason[]
  hint: string
  label: string
}) {
  return (
    <div className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-medium leading-tight text-fd-primary">
        {label}
      </span>
      <span className="block truncate text-[11px] leading-tight text-fd-tertiary opacity-70 transition-opacity duration-100 group-data-[selected=true]:text-fd-secondary group-data-[selected=true]:opacity-100">
        {hint}
      </span>
      {fragmentReasons.length > 0 ? (
        <span className="mt-1 flex flex-col gap-1">
          {fragmentReasons.map((reason) => (
            <span
              className="flex min-w-0 items-center gap-1.5 text-[11px] leading-tight"
              key={`${reason.sourceKind}:${reason.sourceId}:${reason.snippet}`}
            >
              <span className="shrink-0 rounded-md border border-fd-border-subtle bg-fd-panel px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-fd-tertiary">
                {labelForSearchSource(reason.sourceKind)}
              </span>
              <span className="truncate text-fd-secondary">{reason.snippet}</span>
            </span>
          ))}
        </span>
      ) : null}
    </div>
  )
}

function getFragmentReasons(searchMatch?: SessionSearchMatch): SessionSearchReason[] {
  return (searchMatch?.reasons ?? []).filter((reason) => reason.sourceKind && reason.sourceId)
}

function getSearchTarget(
  sessionId: string,
  searchMatch?: SessionSearchMatch,
): SessionSearchTarget | undefined {
  const reason = getFragmentReasons(searchMatch)[0]

  if (!reason?.sourceKind || !reason.sourceId) {
    return undefined
  }

  return {
    sessionId,
    sourceKind: reason.sourceKind,
    sourceId: reason.sourceId,
    messageId: reason.messageId,
    toolCallId: reason.toolCallId,
  }
}

function labelForSearchSource(sourceKind?: SessionSearchReason['sourceKind']): string {
  switch (sourceKind) {
    case 'block':
      return 'Message'
    case 'tool_call':
    case 'tool_result':
      return 'Tool'
    case 'file_snapshot':
      return 'File'
    case 'compaction':
      return 'Summary'
    case 'settings':
      return 'Settings'
    case 'todo':
      return 'Todo'
    default:
      return 'Match'
  }
}

function SessionDot({ status }: { status: string }) {
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-fd-border-default bg-fd-surface transition-colors duration-100 group-data-[selected=true]:border-fd-border-strong">
      <div
        className={cn('size-2 rounded-full transition-shadow duration-200', {
          'bg-[var(--fd-session-active)] shadow-[0_0_6px_var(--fd-session-active)]':
            status === 'active',
          'bg-[var(--fd-session-waiting)] shadow-[0_0_6px_var(--fd-session-waiting)]':
            status === 'waiting',
          'bg-[var(--fd-session-idle)]': status === 'idle',
          'bg-[var(--fd-session-completed)]': status === 'completed',
          'bg-[var(--fd-session-disconnected)]':
            status === 'disconnected' || status === 'error' || status === 'orphaned',
        })}
      />
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-fd-border-default bg-fd-surface px-1 font-mono text-[10px] font-medium text-fd-tertiary">
      {children}
    </kbd>
  )
}
