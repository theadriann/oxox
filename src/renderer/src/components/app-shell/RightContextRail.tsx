import { GitPullRequest, Info } from 'lucide-react'

import type { ContextPanelMode } from '../../state/ui/ui.model'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

interface RightContextRailProps {
  activeMode: ContextPanelMode
  isPanelHidden: boolean
  onTogglePanel: (mode: ContextPanelMode) => void
}

const RAIL_ITEMS = [
  {
    mode: 'session-details',
    label: 'Session details',
    ariaLabel: 'Toggle session details panel',
    Icon: Info,
  },
  {
    mode: 'git-diff',
    label: 'Git diff',
    ariaLabel: 'Toggle git diff panel',
    Icon: GitPullRequest,
  },
] as const

export function RightContextRail({
  activeMode,
  isPanelHidden,
  onTogglePanel,
}: RightContextRailProps) {
  return (
    <nav
      aria-label="Right sidebar panels"
      className="flex h-full w-10 shrink-0 flex-col items-center gap-1 border-l border-fd-border-subtle bg-fd-panel/70 px-1.5 py-2"
    >
      <TooltipProvider delayDuration={200}>
        {RAIL_ITEMS.map(({ mode, label, ariaLabel, Icon }) => {
          const isActive = activeMode === mode && !isPanelHidden

          return (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <Button
                  aria-label={ariaLabel}
                  aria-pressed={isActive}
                  className={`size-7 ${isActive ? 'bg-white/[0.08] text-fd-primary' : 'text-fd-tertiary hover:text-fd-secondary'}`}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => onTogglePanel(mode)}
                >
                  <Icon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-[11px]">
                {label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </TooltipProvider>
    </nav>
  )
}
