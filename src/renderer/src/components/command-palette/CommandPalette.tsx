import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Command as CommandIcon, FolderSearch, Hash, Search, Zap } from 'lucide-react'
import {
  memo,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { buildCommandPaletteViewModel } from '../../hooks/commandPaletteSelectors'
import { cn } from '../../lib/utils'
import type { SessionPreview } from '../../stores/SessionStore'

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
  sessions: SessionPreview[]
  onOpenChange: (open: boolean) => void
  onSelectSession: (sessionId: string) => void
}

export function CommandPalette({
  open,
  commands,
  sessions,
  onOpenChange,
  onSelectSession,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hasQuery = deferredSearch.trim().length > 0
  const isStale = search !== deferredSearch

  const { globalCommands, sessionCommands, sessionsToRender } = useMemo(
    () =>
      buildCommandPaletteViewModel({
        commands,
        sessions,
        hasQuery,
      }),
    [commands, hasQuery, sessions],
  )

  const handleValueChange = useCallback((value: string) => {
    startTransition(() => {
      setSearch(value)
    })
  }, [])

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }

    const focusFrame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
    }
  }, [open])

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
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
            <Search
              className={cn(
                'size-[15px] transition-colors duration-150',
                isStale ? 'text-fd-ember-400' : 'text-fd-tertiary',
              )}
            />
            {isStale && (
              <div className="absolute inset-0 animate-ping rounded-full bg-fd-ember-400/20" />
            )}
          </div>
          <Command.Input
            ref={inputRef}
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
            sessions={sessionsToRender}
            onOpenChange={onOpenChange}
            onSelectSession={onSelectSession}
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
  onOpenChange,
  onSelectSession,
  sessions,
}: {
  onOpenChange: (open: boolean) => void
  onSelectSession: (sessionId: string) => void
  sessions: SessionPreview[]
}) {
  if (sessions.length === 0) {
    return null
  }

  return (
    <Command.Group heading={<GroupLabel icon={FolderSearch}>Sessions</GroupLabel>}>
      {sessions.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          onSelect={() => {
            onSelectSession(session.id)
            onOpenChange(false)
          }}
        />
      ))}
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
  session,
  onSelect,
}: {
  session: SessionPreview
  onSelect: () => void
}) {
  return (
    <PaletteItem
      value={`${session.id} ${session.title}`}
      keywords={[
        session.title,
        session.projectLabel,
        session.projectWorkspacePath ?? '',
        session.status,
      ]}
      onSelect={onSelect}
    >
      <SessionDot status={session.status} />
      <ItemContent label={session.title} hint={`${session.projectLabel} · ${session.status}`} />
      <ItemTrail />
    </PaletteItem>
  )
})

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
