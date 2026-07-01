import { ChevronDown, ChevronRight } from 'lucide-react'
import { memo, useMemo, useState } from 'react'

import { MarkdownRenderer } from './MarkdownRenderer'
import type { SystemEventTimelineItem } from './timelineTypes'

const eventToneClassName = {
  default: {
    card: 'border-fd-border-subtle bg-fd-panel/25 text-fd-secondary',
    dot: 'bg-fd-tertiary',
  },
  warning: {
    card: 'border-fd-warning/25 bg-fd-warning/5 text-fd-secondary',
    dot: 'bg-fd-warning',
  },
  danger: {
    card: 'border-fd-ember-400/35 bg-fd-ember-400/5 text-fd-secondary',
    dot: 'bg-fd-ember-400',
  },
  success: {
    card: 'border-fd-ready/25 bg-fd-ready/5 text-fd-secondary',
    dot: 'bg-fd-ready',
  },
} as const

const INLINE_DETAIL_LIMIT = 4
const LONG_DETAIL_LENGTH = 120

interface ParsedEventDetail {
  id: string
  label: string | null
  value: string
  isOutput: boolean
  isLong: boolean
}

export const SystemEventCard = memo(function SystemEventCard({
  item,
}: {
  item: SystemEventTimelineItem
}) {
  const [showDetails, setShowDetails] = useState(false)
  const detailsUseDisclosure = item.detailsLayout === 'disclosure'
  const parsedDetails = useMemo(
    () => item.details.map((detail, index) => parseEventDetail(detail, index)),
    [item.details],
  )
  const inlineDetails = detailsUseDisclosure
    ? []
    : parsedDetails
        .filter((detail) => !detail.isOutput && !detail.isLong)
        .slice(0, INLINE_DETAIL_LIMIT)
  const hiddenInlineIds = new Set(inlineDetails.map((detail) => detail.id))
  const disclosureDetails = parsedDetails.filter((detail) => !hiddenInlineIds.has(detail.id))
  const hasDisclosureDetails = disclosureDetails.length > 0
  const toneClassName = eventToneClassName[item.tone]

  return (
    <article
      aria-live={item.tone === 'danger' ? 'assertive' : 'polite'}
      className={`w-full overflow-hidden rounded-md border px-2.5 py-2 shadow-sm ${toneClassName.card}`}
      role={item.tone === 'danger' ? 'alert' : 'status'}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${toneClassName.dot}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[12px] font-medium leading-4 text-fd-primary">{item.title}</span>
            <span className="rounded border border-fd-border-subtle bg-fd-surface/60 px-1.5 py-0.5 font-mono text-[10px] leading-none text-fd-tertiary">
              {item.typeLabel}
            </span>
            {inlineDetails.map((detail) => (
              <EventDetailChip key={detail.id} detail={detail} />
            ))}
            {hasDisclosureDetails ? (
              <button
                aria-expanded={showDetails}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-fd-tertiary transition-colors hover:bg-fd-surface/70 hover:text-fd-secondary"
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
          {item.body ? (
            <p
              className="mt-1 truncate font-mono text-[11px] leading-4 text-fd-secondary"
              title={item.body}
            >
              {item.body}
            </p>
          ) : null}
        </div>
      </div>
      {showDetails && hasDisclosureDetails ? (
        <ul className="mt-2 flex flex-col gap-1 border-t border-fd-border-subtle/70 pt-2">
          {disclosureDetails.map((detail) => (
            <EventDetailRow key={detail.id} detail={detail} />
          ))}
        </ul>
      ) : null}
    </article>
  )
})

function EventDetailChip({ detail }: { detail: ParsedEventDetail }) {
  return (
    <span
      className="max-w-72 truncate rounded border border-fd-border-subtle/70 bg-fd-surface/50 px-1.5 py-0.5 text-[10px] leading-none text-fd-tertiary"
      title={formatDetailLabel(detail)}
    >
      {formatDetailLabel(detail)}
    </span>
  )
}

function EventDetailRow({ detail }: { detail: ParsedEventDetail }) {
  const content = detail.label ? `${detail.label}: ${detail.value}` : detail.value

  return (
    <li className="rounded border border-fd-border-subtle/60 bg-fd-panel/45 px-2 py-1.5 text-[11px] leading-5 text-fd-secondary">
      {detail.value.startsWith('```') ? (
        <MarkdownRenderer markdown={detail.value} />
      ) : (
        <span className={detail.isOutput ? 'whitespace-pre-wrap break-words font-mono' : ''}>
          {content}
        </span>
      )}
    </li>
  )
}

function parseEventDetail(detail: string, index: number): ParsedEventDetail {
  const match = /^([^:]{1,32}):\s*([\s\S]*)$/u.exec(detail)
  const label = match?.[1]?.trim() || null
  const value = match?.[2]?.trim() || detail
  const normalizedLabel = label?.toLowerCase() ?? ''
  const isOutput =
    normalizedLabel === 'stdout' ||
    normalizedLabel === 'stderr' ||
    normalizedLabel === 'details' ||
    value.startsWith('```')

  return {
    id: `${index}-${label ?? 'detail'}-${value.slice(0, 24)}`,
    label,
    value,
    isOutput,
    isLong: value.length > LONG_DETAIL_LENGTH || value.includes('\n'),
  }
}

function formatDetailLabel(detail: ParsedEventDetail): string {
  return detail.label ? `${detail.label}: ${detail.value}` : detail.value
}
