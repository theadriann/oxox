import { memo } from 'react'

import { MarkdownRenderer } from './MarkdownRenderer'
import type { SystemEventTimelineItem } from './timelineTypes'

const eventToneClassName = {
  default: 'border-fd-border-subtle text-fd-secondary',
  warning: 'border-fd-warning/20 text-fd-secondary',
  danger: 'border-fd-ember-400/30 text-fd-secondary',
  success: 'border-fd-ready/20 text-fd-secondary',
} as const

export const SystemEventCard = memo(function SystemEventCard({
  item,
}: {
  item: SystemEventTimelineItem
}) {
  return (
    <div className={`rounded border px-2 py-1 ${eventToneClassName[item.tone]}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-fd-primary">{item.title}</span>
        <span className="font-mono text-[10px] text-fd-tertiary">{item.typeLabel}</span>
      </div>
      {item.body ? (
        <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-5 text-fd-secondary">
          {item.body}
        </p>
      ) : null}
      {item.details.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {item.details.map((detail) => (
            <li
              key={`${item.id}-${detail}`}
              className="rounded bg-fd-panel/50 px-2 py-1 text-[11px] text-fd-secondary"
            >
              {detail.startsWith('```') ? <MarkdownRenderer markdown={detail} /> : detail}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
})
