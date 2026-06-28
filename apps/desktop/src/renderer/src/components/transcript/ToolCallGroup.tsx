import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import type { ReactNode } from 'react'

import { summarizeToolNames } from './toolCallGrouping'

interface ToolCallGroupProps {
  count: number
  toolNames: string[]
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}

export function ToolCallGroup({
  count,
  toolNames,
  expanded,
  onToggle,
  children,
}: ToolCallGroupProps) {
  const label = `${count} tool call${count === 1 ? '' : 's'}`
  const preview = summarizeToolNames(toolNames)

  return (
    <div
      className={`my-0.5 overflow-hidden rounded-md border transition-colors ${
        expanded
          ? 'border-fd-border-default bg-fd-surface/40'
          : 'border-fd-border-subtle bg-fd-surface/20 hover:border-fd-border-default'
      }`}
    >
      <button
        aria-expanded={expanded}
        aria-label={`${label}: ${preview}`}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-fd-surface/50"
        type="button"
        onClick={onToggle}
      >
        <span className="shrink-0 text-fd-tertiary">
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </span>
        <Wrench className="size-3 shrink-0 text-fd-tertiary" />
        <span className="shrink-0 text-[11px] font-medium text-fd-secondary">{label}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-fd-tertiary">{preview}</span>
      </button>

      {expanded ? (
        <div className="flex flex-col divide-y divide-fd-border-subtle border-t border-fd-border-subtle">
          {children}
        </div>
      ) : null}
    </div>
  )
}
