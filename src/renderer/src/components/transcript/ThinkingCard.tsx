import { ChevronDown, ChevronRight } from 'lucide-react'
import { memo, useEffect, useState } from 'react'

import type { ThinkingTimelineItem } from './timelineTypes'

export const ThinkingCard = memo(function ThinkingCard({ item }: { item: ThinkingTimelineItem }) {
  const [expanded, setExpanded] = useState(item.status === 'streaming')

  useEffect(() => {
    setExpanded(item.status === 'streaming')
  }, [item.status])

  return (
    <div className="border-l-2 border-fd-border-subtle py-0.5 pl-3">
      <button
        aria-expanded={expanded}
        aria-label="Toggle thinking"
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-fd-surface/60"
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
          Thinking
        </span>
        {item.status === 'streaming' ? (
          <span aria-label="Thinking indicator" className="inline-flex gap-0.5" role="status">
            <span className="size-1 animate-pulse rounded-full bg-fd-tertiary [animation-delay:0ms]" />
            <span className="size-1 animate-pulse rounded-full bg-fd-tertiary [animation-delay:120ms]" />
            <span className="size-1 animate-pulse rounded-full bg-fd-tertiary [animation-delay:240ms]" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1" />
        <span className="shrink-0 text-fd-tertiary">
          {expanded ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
        </span>
      </button>
      {expanded && item.content ? (
        <p className="mt-0.5 whitespace-pre-wrap text-[12px] italic leading-5 text-fd-tertiary">
          {item.content}
        </p>
      ) : null}
    </div>
  )
})
