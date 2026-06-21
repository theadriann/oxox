import {
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  HourglassIcon,
  Loading03Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { cn } from '@/lib/utils'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import type { LiveSessionStatusIndicator } from './liveSessionStatusIndicator'

const statusToneClassName: Record<LiveSessionStatusIndicator['kind'], string> = {
  idle: 'border-fd-border-subtle bg-fd-surface/90 text-fd-secondary',
  thinking: 'border-fd-session-active/25 bg-fd-surface/95 text-fd-primary',
  streaming: 'border-fd-session-active/25 bg-fd-surface/95 text-fd-primary',
  generating: 'border-fd-session-active/25 bg-fd-surface/95 text-fd-primary',
  tool: 'border-fd-session-active/25 bg-fd-surface/95 text-fd-primary',
  waiting: 'border-fd-session-waiting/30 bg-fd-surface/95 text-fd-primary',
  compressing: 'border-fd-ember-400/30 bg-fd-surface/95 text-fd-primary',
  reconnecting: 'border-fd-session-waiting/30 bg-fd-surface/95 text-fd-primary',
  completed: 'border-fd-ready/20 bg-fd-surface/90 text-fd-secondary',
  error: 'border-fd-danger/30 bg-fd-surface/95 text-fd-primary',
}

export function LiveSessionStatusPill({
  status,
  className,
}: {
  status: LiveSessionStatusIndicator
  className?: string
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            aria-label={`Session status: ${status.label}`}
            role="status"
            className={cn(
              'inline-flex max-w-80 items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs shadow-lg shadow-background/30 backdrop-blur-md',
              statusToneClassName[status.kind],
              className,
            )}
            title={status.detail}
          >
            <StatusIcon status={status} />
            <span className="truncate">{status.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          {status.detail}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function StatusIcon({ status }: { status: LiveSessionStatusIndicator }) {
  if (status.isActive) {
    return (
      <HugeiconsIcon
        icon={Loading03Icon}
        strokeWidth={2}
        className="size-3.5 shrink-0 animate-spin text-fd-session-active"
        aria-hidden
      />
    )
  }

  const icon =
    status.kind === 'error'
      ? AlertCircleIcon
      : status.kind === 'waiting'
        ? HourglassIcon
        : CheckmarkCircle01Icon

  return (
    <HugeiconsIcon
      icon={icon}
      strokeWidth={2}
      className={cn(
        'size-3.5 shrink-0',
        status.kind === 'error' ? 'text-fd-danger' : 'text-fd-tertiary',
      )}
      aria-hidden
    />
  )
}
