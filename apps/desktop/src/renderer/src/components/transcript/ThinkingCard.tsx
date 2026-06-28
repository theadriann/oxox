import { ChevronDown, ChevronRight } from 'lucide-react'
import { memo, useEffect, useState } from 'react'

import type { ThinkingTimelineItem } from './timelineTypes'

export const ThinkingCard = memo(function ThinkingCard({ item }: { item: ThinkingTimelineItem }) {
  const [expanded, setExpanded] = useState(item.status === 'streaming')

  useEffect(() => {
    setExpanded(item.status === 'streaming')
  }, [item.status])

  return (
    <div className="py-0.5">
      <button
        aria-expanded={expanded}
        aria-label="Toggle thinking"
        className="group/thinking flex w-full items-center gap-1.5 rounded px-0 py-0.5 text-left text-fd-tertiary transition-colors hover:text-fd-secondary"
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
          Thinking
        </span>
        <span className="shrink-0 text-fd-tertiary transition-colors group-hover/thinking:text-fd-secondary">
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </span>
        {item.status === 'streaming' ? (
          <span aria-label="Thinking indicator" className="inline-flex gap-0.5" role="status">
            <span className="size-1 animate-pulse rounded-full bg-fd-tertiary [animation-delay:0ms]" />
            <span className="size-1 animate-pulse rounded-full bg-fd-tertiary [animation-delay:120ms]" />
            <span className="size-1 animate-pulse rounded-full bg-fd-tertiary [animation-delay:240ms]" />
          </span>
        ) : null}
      </button>
      {expanded && item.content ? (
        <p className="mt-1 whitespace-pre-wrap pl-2 text-[11px] italic leading-4 text-fd-tertiary/80">
          {item.content}
        </p>
      ) : null}
    </div>
  )
})
