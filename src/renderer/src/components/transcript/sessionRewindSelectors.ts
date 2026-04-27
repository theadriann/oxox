import type { SessionRewindMessageOption } from './SessionRewindDialog'
import type { TimelineItem } from './timelineTypes'

export function resolveSessionRewindTimelineItems({
  historicalTimeline,
  selectedTimelineItems,
}: {
  historicalTimeline: TimelineItem[]
  selectedTimelineItems: TimelineItem[]
}): TimelineItem[] {
  return selectedTimelineItems.length > 0 ? selectedTimelineItems : historicalTimeline
}

export function buildSessionRewindMessageOptions(
  timelineItems: TimelineItem[],
): SessionRewindMessageOption[] {
  const seenRewindTargetIds = new Set<string>()

  return timelineItems.flatMap((item) => {
    if (item.kind !== 'message' || item.role !== 'user') {
      return []
    }

    const rewindTargetId = item.rewindBoundaryMessageId ?? item.messageId

    if (seenRewindTargetIds.has(rewindTargetId)) {
      return []
    }

    seenRewindTargetIds.add(rewindTargetId)

    const preview = item.content.replace(/\s+/gu, ' ').trim()
    const clippedPreview =
      preview.length > 64 ? `${preview.slice(0, 61).trimEnd()}…` : preview || '(empty message)'

    return [
      {
        value: rewindTargetId,
        label: `${capitalizeRole(item.role)} · ${clippedPreview}`,
      },
    ]
  })
}

function capitalizeRole(value: string): string {
  return value.length > 0 ? `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}` : 'Message'
}
