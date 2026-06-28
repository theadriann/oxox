import { ChevronDown, ChevronRight } from 'lucide-react'
import { memo, useState } from 'react'

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
  const [showDetails, setShowDetails] = useState(false)
  const detailsUseDisclosure = item.detailsLayout === 'disclosure'

  if (item.layout === 'compact') {
    return (
      <div
        aria-live={item.tone === 'danger' ? 'assertive' : 'polite'}
        className={`rounded border px-2 py-1 ${eventToneClassName[item.tone]}`}
        role={item.tone === 'danger' ? 'alert' : 'status'}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
          <span className="text-[11px] font-medium text-fd-primary">{item.title}</span>
          <span className="font-mono text-[10px] text-fd-tertiary">{item.typeLabel}</span>
          {item.body ? <span className="text-[11px] text-fd-secondary">{item.body}</span> : null}
          {item.details.length > 0 && detailsUseDisclosure ? (
            <button
              aria-expanded={showDetails}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-fd-tertiary transition-colors hover:bg-fd-panel/70 hover:text-fd-secondary"
              type="button"
              onClick={() => setShowDetails((value) => !value)}
            >
              {showDetails ? (
                <ChevronDown className="size-3" aria-hidden />
              ) : (
                <ChevronRight className="size-3" aria-hidden />
              )}
              {showDetails ? `Hide details for ${item.title}` : `Show details for ${item.title}`}
            </button>
          ) : null}
          {item.details.length > 0 && !detailsUseDisclosure
            ? item.details.map((detail) => (
                <span
                  key={`${item.id}-${detail}`}
                  className="rounded bg-fd-panel/60 px-1.5 py-0.5 text-[10px] text-fd-tertiary"
                >
                  {detail}
                </span>
              ))
            : null}
          {item.action ? (
            <a
              aria-label={item.action.ariaLabel}
              className="ml-auto rounded border border-fd-border-default bg-fd-panel px-2 py-0.5 text-[10px] font-medium text-fd-primary transition-colors hover:border-fd-border-strong hover:bg-fd-surface"
              href={item.action.href}
              rel="noreferrer noopener"
              target="_blank"
              title={item.action.href}
            >
              {item.action.label}
            </a>
          ) : null}
        </div>
        {showDetails && detailsUseDisclosure ? (
          <ul className="mt-1 flex flex-col gap-0.5">
            {item.details.map((detail) => (
              <li
                key={`${item.id}-${detail}`}
                className="rounded bg-fd-panel/50 px-2 py-1 text-[11px] text-fd-secondary"
              >
                {detail}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  return (
    <div
      aria-live={item.tone === 'danger' ? 'assertive' : 'polite'}
      className={`rounded border px-2 py-1 ${eventToneClassName[item.tone]}`}
      role={item.tone === 'danger' ? 'alert' : 'status'}
    >
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
