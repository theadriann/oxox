import { memo, type MouseEvent as ReactMouseEvent, useCallback, useState } from 'react'

import type { TranscriptMessageContentBlock } from '../../../../shared/ipc/contracts'
import type { MessageTimelineItem, TimelineItem } from './timelineTypes'

const TIMELINE_RAIL_LINE_HEIGHT_PX = 3
const TIMELINE_RAIL_LINE_GAP_PX = 4
const TIMELINE_RAIL_BASE_WIDTH_PX = 12
const TIMELINE_RAIL_DOCK_WIDTHS = [42, 32, 22] as const

export interface TranscriptUserMessageMarker {
  id: string
  messageId: string
  rowIndex: number
  title: string
  description: string
}

export type TranscriptUserMessageRailSourceItem = {
  kind: string
  item?: TimelineItem
}

export function buildTranscriptUserMessageMarkers(
  items: TranscriptUserMessageRailSourceItem[],
): TranscriptUserMessageMarker[] {
  const markers: TranscriptUserMessageMarker[] = []

  items.forEach((renderItem, index) => {
    if (
      renderItem.kind !== 'timeline-item' ||
      renderItem.item?.kind !== 'message' ||
      renderItem.item.role !== 'user'
    ) {
      return
    }

    markers.push({
      id: renderItem.item.id,
      messageId: renderItem.item.messageId,
      rowIndex: index,
      title: clipPreviewText(getMessagePreviewText(renderItem.item), 140) || 'User message',
      description:
        clipPreviewText(getNextAssistantPreviewText(items, index), 260) ||
        'No assistant response yet.',
    })
  })

  return markers
}

export const TranscriptUserMessageRail = memo(function TranscriptUserMessageRail({
  markers,
  bottomInsetPx,
  onNavigate,
}: {
  markers: TranscriptUserMessageMarker[]
  bottomInsetPx: number
  onNavigate: (rowIndex: number) => void
}) {
  const [activeMarkerIndex, setActiveMarkerIndex] = useState<number | null>(null)
  const readMarkerIndexFromPointer = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const relativeY = Math.min(rect.height, Math.max(0, event.clientY - rect.top))
      const segmentHeight = rect.height / Math.max(1, markers.length)

      return Math.min(markers.length - 1, Math.max(0, Math.floor(relativeY / segmentHeight)))
    },
    [markers.length],
  )
  const handlePointerMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      setActiveMarkerIndex(readMarkerIndexFromPointer(event))
    },
    [readMarkerIndexFromPointer],
  )
  const handleRailClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      const marker = markers[readMarkerIndexFromPointer(event)]
      if (marker) {
        onNavigate(marker.rowIndex)
      }
    },
    [markers, onNavigate, readMarkerIndexFromPointer],
  )

  if (markers.length === 0) return null

  const railHeightPx =
    markers.length * TIMELINE_RAIL_LINE_HEIGHT_PX +
    Math.max(0, markers.length - 1) * TIMELINE_RAIL_LINE_GAP_PX
  const activeMarker = activeMarkerIndex === null ? null : markers[activeMarkerIndex]
  const activePreviewTopPx =
    activeMarkerIndex === null
      ? 0
      : activeMarkerIndex * (TIMELINE_RAIL_LINE_HEIGHT_PX + TIMELINE_RAIL_LINE_GAP_PX) +
        TIMELINE_RAIL_LINE_HEIGHT_PX / 2

  return (
    <div
      aria-label="User message timeline"
      className="pointer-events-none absolute left-2 z-20 hidden w-10 -translate-y-1/2 md:block"
      data-testid="transcript-user-message-rail"
      role="navigation"
      style={{
        top: `calc((100% - ${bottomInsetPx}px) / 2)`,
      }}
    >
      <button
        type="button"
        aria-label="Navigate user messages"
        className="pointer-events-auto relative flex cursor-pointer flex-col items-start"
        data-testid="transcript-user-message-rail-track"
        style={{ gap: `${TIMELINE_RAIL_LINE_GAP_PX}px`, height: `${railHeightPx}px` }}
        onClick={handleRailClick}
        onMouseLeave={() => setActiveMarkerIndex(null)}
        onMouseMove={handlePointerMove}
      >
        {markers.map((marker, markerIndex) => (
          <span
            className="flex w-12 items-center justify-start"
            data-testid="transcript-user-message-marker"
            style={{ height: `${TIMELINE_RAIL_LINE_HEIGHT_PX}px` }}
            key={marker.id}
          >
            <span
              className={`rounded-full transition-[width,background-color] duration-150 ${
                activeMarkerIndex === markerIndex ? 'bg-fd-primary' : 'bg-fd-border-strong/80'
              }`}
              data-testid="transcript-user-message-marker-line"
              style={{
                height: `${TIMELINE_RAIL_LINE_HEIGHT_PX}px`,
                width: `${getTimelineRailLineWidth(markerIndex, activeMarkerIndex)}px`,
              }}
            />
          </span>
        ))}

        {activeMarker ? (
          <span
            className="absolute left-10 w-80 -translate-y-1/2 rounded-xl border border-fd-border-default bg-fd-elevated/95 p-3 text-left shadow-[0_18px_48px_rgba(0,0,0,0.34)] transition-opacity"
            data-testid="transcript-user-message-preview"
            style={{ top: `${activePreviewTopPx}px` }}
          >
            <span className="line-clamp-2 text-[13px] font-medium leading-5 text-fd-primary">
              {activeMarker.title}
            </span>
            <span className="mt-1.5 line-clamp-3 text-[12px] leading-5 text-fd-secondary">
              {activeMarker.description}
            </span>
          </span>
        ) : null}
      </button>
    </div>
  )
})

function getNextAssistantPreviewText(
  items: TranscriptUserMessageRailSourceItem[],
  startIndex: number,
): string {
  for (const renderItem of items.slice(startIndex + 1)) {
    if (
      renderItem.kind === 'timeline-item' &&
      renderItem.item?.kind === 'message' &&
      renderItem.item.role === 'assistant'
    ) {
      return getMessagePreviewText(renderItem.item)
    }
  }

  return ''
}

function getMessagePreviewText(item: MessageTimelineItem): string {
  const textFromBlocks = getTextFromContentBlocks(item.contentBlocks)
  return normalizePreviewText(textFromBlocks || item.content)
}

function getTextFromContentBlocks(
  contentBlocks: TranscriptMessageContentBlock[] | undefined,
): string {
  if (!contentBlocks) return ''

  return contentBlocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n')
}

function normalizePreviewText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/[#>*_[\]()~|-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function clipPreviewText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  return `${text.slice(0, maxLength).trimEnd()}...`
}

function getTimelineRailLineWidth(markerIndex: number, activeMarkerIndex: number | null): number {
  if (activeMarkerIndex === null) return TIMELINE_RAIL_BASE_WIDTH_PX

  const distance = Math.abs(markerIndex - activeMarkerIndex)
  return TIMELINE_RAIL_DOCK_WIDTHS[distance] ?? TIMELINE_RAIL_BASE_WIDTH_PX
}
