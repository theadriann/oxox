import type { TranscriptEntry } from '../../../../shared/ipc/contracts'
import type { MessageTimelineItem, TimelineItem, ToolTimelineItem } from './timelineTypes'

export function buildHistoricalTimeline(entries: TranscriptEntry[]): TimelineItem[] {
  return entries.map((entry) => {
    switch (entry.kind) {
      case 'message':
        return {
          kind: 'message',
          id: entry.id,
          messageId: entry.sourceMessageId ?? entry.id,
          rewindBoundaryMessageId: entry.rewindBoundaryMessageId,
          role: entry.role,
          content: entry.markdown,
          status: 'completed',
          occurredAt: entry.occurredAt,
          contentBlocks: entry.contentBlocks,
        } satisfies MessageTimelineItem

      case 'tool_call':
        return {
          kind: 'tool',
          id: entry.id,
          toolUseId: entry.toolUseId,
          toolName: entry.toolName,
          status: entry.status,
          occurredAt: entry.occurredAt,
          inputMarkdown: entry.inputMarkdown,
          resultMarkdown: entry.resultMarkdown,
          resultIsError: entry.resultIsError,
          progressHistory: [],
          progressSummary: null,
        } satisfies ToolTimelineItem

      default: {
        const _exhaustive: never = entry
        return _exhaustive
      }
    }
  })
}
