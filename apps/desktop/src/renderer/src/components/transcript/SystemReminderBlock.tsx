import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

export function SystemReminderBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = content.split('\n')[0]?.slice(0, 80) ?? 'System context'

  return (
    <div className="my-0.5">
      <button
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-fd-surface/60"
        type="button"
        onClick={() => setExpanded((c) => !c)}
      >
        <span className="shrink-0 text-fd-tertiary">
          {expanded ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
          System context
        </span>
        {!expanded ? (
          <span className="min-w-0 flex-1 truncate text-[10px] text-fd-tertiary">{preview}</span>
        ) : null}
      </button>
      {expanded ? (
        <div className="ml-4 mt-0.5 rounded bg-fd-panel/30 px-2.5 py-1.5">
          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-fd-tertiary">
            {content}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
