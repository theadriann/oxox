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
  it('builds clipped message labels from rewindable user timeline message items only', () => {
    const options = buildSessionRewindMessageOptions([
      createMessageItem({ role: 'user' }),
      createMessageItem({
        id: 'assistant-message-1',
        messageId: 'assistant-message-1',
        role: 'assistant',
        content: 'Assistant replies should not be rewind targets',
      }),
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
    expect(options[0]?.label).toContain('User · ')
    expect(options[0]?.label.endsWith('…')).toBe(true)
  })

  it('deduplicates repeated timeline segments for the same user message id', () => {
    const options = buildSessionRewindMessageOptions([
      createMessageItem({
        id: 'message-1:0',
        role: 'user',
        content: 'First transcript chunk',
      }),
      createMessageItem({
        id: 'message-1:1',
        role: 'user',
        content: 'Second transcript chunk',
      }),
    ])

    expect(options).toEqual([
      {
        value: 'message-1',
        label: 'User · First transcript chunk',
      },
    ])
  })

  it('uses rewind boundary ids when available', () => {
    const options = buildSessionRewindMessageOptions([
      {
        ...createMessageItem({
          id: 'message-1:0',
          messageId: 'message-1',
          role: 'user',
          content: 'First rewindable user message',
        }),
        rewindBoundaryMessageId: 'rewind-boundary-1',
      } as TimelineItem,
    ])

    expect(options).toEqual([
      {
        value: 'rewind-boundary-1',
        label: 'User · First rewindable user message',
      },
    ])
  })
})
