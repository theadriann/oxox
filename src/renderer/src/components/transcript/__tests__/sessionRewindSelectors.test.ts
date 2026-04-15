import { describe, expect, it } from 'vitest'
import {
  buildSessionRewindMessageOptions,
  resolveSessionRewindTimelineItems,
} from '../sessionRewindSelectors'
import type { TimelineItem } from '../timelineTypes'

function createMessageItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'timeline-message-1',
    kind: 'message',
    messageId: 'message-1',
    role: 'assistant',
    content: 'A long message that should be shortened for the select trigger preview',
    timestamp: '2026-04-16T00:00:00.000Z',
    ...overrides,
  } as TimelineItem
}

describe('resolveSessionRewindTimelineItems', () => {
  it('prefers live timeline items when they exist', () => {
    const historicalTimeline = [createMessageItem({ messageId: 'historical-1' })]
    const liveTimeline = [createMessageItem({ messageId: 'live-1' })]

    expect(
      resolveSessionRewindTimelineItems({
        historicalTimeline,
        selectedTimelineItems: liveTimeline,
      }),
    ).toEqual(liveTimeline)
  })

  it('falls back to the historical timeline when no live timeline items exist', () => {
    const historicalTimeline = [createMessageItem({ messageId: 'historical-1' })]

    expect(
      resolveSessionRewindTimelineItems({
        historicalTimeline,
        selectedTimelineItems: [],
      }),
    ).toEqual(historicalTimeline)
  })
})

describe('buildSessionRewindMessageOptions', () => {
  it('builds clipped message labels from timeline message items only', () => {
    const options = buildSessionRewindMessageOptions([
      createMessageItem(),
      {
        id: 'tool-1',
        kind: 'tool_call',
        title: 'Read',
        toolName: 'Read',
        timestamp: '2026-04-16T00:00:01.000Z',
      } as TimelineItem,
    ])

    expect(options).toHaveLength(1)
    expect(options[0]?.value).toBe('message-1')
    expect(options[0]?.label).toContain('Assistant · ')
    expect(options[0]?.label.endsWith('…')).toBe(true)
  })
})
