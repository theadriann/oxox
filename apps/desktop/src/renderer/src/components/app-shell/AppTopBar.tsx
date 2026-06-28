import { Info, PanelLeft, Search } from 'lucide-react'
import type { CSSProperties } from 'react'

import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

const DRAG_STYLE = {
  WebkitAppRegion: 'drag',
  WebkitUserSelect: 'none',
} as CSSProperties

const NO_DRAG_STYLE = { WebkitAppRegion: 'no-drag' } as CSSProperties

export interface AppTopBarProps {
  sessionTitle?: string
  sessionProjectLabel?: string
  isSidebarHidden?: boolean
  isContextPanelHidden?: boolean
  isSearchOpen?: boolean
  onToggleSidebar?: () => void
  onToggleContextPanel?: () => void
  onOpenSearch?: () => void
}

export function AppTopBar({
  sessionTitle,
  sessionProjectLabel,
  isSidebarHidden,
  isContextPanelHidden,
  isSearchOpen,
  onToggleSidebar,
  onToggleContextPanel,
  onOpenSearch,
}: AppTopBarProps) {
  return (
    <header className="ox-topbar flex h-[50px] items-center gap-2 px-3" style={DRAG_STYLE}>
      {/* Spacer: matches sidebar width when open, traffic light width when closed */}
      <div
        className="shrink-0 transition-[width] duration-200 ease-in-out"
        style={{ width: isSidebarHidden ? 60 : 'var(--oxox-sidebar-width, 240px)' }}
      />

      {onToggleSidebar ? (
        <div style={NO_DRAG_STYLE} className="ml-2">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={isSidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
                  aria-pressed={!isSidebarHidden}
                  className="ox-icon-button size-7"
                  onClick={onToggleSidebar}
                >
                  <PanelLeft className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[11px]">
                {isSidebarHidden ? 'Show' : 'Hide'} sidebar
                <kbd className="ml-1.5 rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] text-fd-tertiary">
                  Cmd+B
                </kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : null}

      {sessionTitle ? (
        <div className="flex min-w-0 max-w-[60%] items-center gap-2" style={NO_DRAG_STYLE}>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate text-sm font-medium text-fd-primary">{sessionTitle}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-xs">{sessionTitle}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {sessionProjectLabel ? (
            <span className="shrink-0 rounded-md border border-fd-border-subtle bg-fd-panel/70 px-1.5 py-0.5 text-[10px] text-fd-tertiary">
              {sessionProjectLabel}
            </span>
          ) : null}
        </div>
      ) : (
        <span className="text-sm font-medium text-fd-secondary">OXOX</span>
      )}

      <div className="ml-auto flex items-center gap-1.5" style={NO_DRAG_STYLE}>
        {onOpenSearch ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Open full-page search"
                  aria-pressed={isSearchOpen}
                  className={`h-7 gap-1.5 px-2 ${isSearchOpen ? 'bg-fd-surface-hover text-fd-primary' : 'ox-icon-button'}`}
                  onClick={onOpenSearch}
                >
                  <Search className="size-3.5" />
                  <span className="hidden text-xs sm:inline">Search</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[11px]">
                Open full-page search
                <kbd className="ml-1.5 rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] text-fd-tertiary">
                  Cmd+Shift+F
                </kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}

        {onToggleContextPanel ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    isContextPanelHidden ? 'Show session details' : 'Hide session details'
                  }
                  aria-pressed={!isContextPanelHidden}
                  className={`size-7 ${isContextPanelHidden ? 'ox-icon-button' : 'bg-fd-surface-hover text-fd-primary'}`}
                  onClick={onToggleContextPanel}
                >
                  <Info className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[11px]">
                {isContextPanelHidden ? 'Show' : 'Hide'} session details
                <kbd className="ml-1.5 rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] text-fd-tertiary">
                  Cmd+Alt+P
                </kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </header>
  )
}
