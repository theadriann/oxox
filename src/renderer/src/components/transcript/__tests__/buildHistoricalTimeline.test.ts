import { describe, expect, it } from 'vitest'

import { buildHistoricalTimeline } from '../buildHistoricalTimeline'

describe('buildHistoricalTimeline', () => {
  it('preserves the source session message id for rewind-capable historical messages', () => {
    const items = buildHistoricalTimeline([
      {
        kind: 'message',
        id: 'message-1:0',
        sourceMessageId: 'message-1',
        rewindBoundaryMessageId: 'rewind-boundary-1',
        occurredAt: '2026-04-09T00:00:00.000Z',
        role: 'assistant',
        markdown: 'First chunk',
      } as never,
    ])

    expect(items).toEqual([
      expect.objectContaining({
        id: 'message-1:0',
        messageId: 'message-1',
        rewindBoundaryMessageId: 'rewind-boundary-1',
      }),
    ])
  })
})
