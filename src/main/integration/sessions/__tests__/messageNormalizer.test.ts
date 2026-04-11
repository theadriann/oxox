import { describe, expect, it } from 'vitest'

import { extractHistoryEvents, normalizeMessages, resolveSessionTitle } from '../messageNormalizer'
import type { LiveSessionMessage } from '../types'

describe('messageNormalizer', () => {
  it('normalizes transcript messages and filters tool/empty entries', () => {
    expect(
      normalizeMessages([
        { id: 'm-1', role: 'assistant', content: 'hello' },
        {
          id: 'm-2',
          role: 'assistant',
          content: [{ type: 'text', text: 'rich text' }],
        },
        { id: 'm-3', role: 'tool', content: 'ignored tool content' },
        { id: 'm-4', role: 'assistant', content: '   ' },
      ] as never),
    ).toEqual([
      { id: 'm-1', role: 'assistant', content: 'hello' },
      {
        id: 'm-2',
        role: 'assistant',
        content: 'rich text',
        contentBlocks: [{ type: 'text', text: 'rich text' }],
      },
    ])
  })

  it('extracts history events for transcript messages and tool activity', () => {
    expect(
      extractHistoryEvents([
        {
          id: 'm-1',
          role: 'assistant',
          timestamp: '2026-04-10T00:00:00.000Z',
          content: [
            { type: 'text', text: 'Looking things up' },
            { type: 'tool_use', id: 'tool-1', name: 'grep', input: { query: 'session' } },
          ],
        },
        {
          id: 'm-2',
          role: 'assistant',
          timestamp: '2026-04-10T00:00:01.000Z',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: { output: 'done' },
            },
          ],
        },
      ] as never),
    ).toEqual([
      expect.objectContaining({
        type: 'message.completed',
        messageId: 'm-1',
        content: 'Looking things up',
      }),
      expect.objectContaining({
        type: 'tool.progress',
        toolUseId: 'tool-1',
        toolName: 'grep',
        status: 'running',
      }),
      expect.objectContaining({
        type: 'tool.result',
        toolUseId: 'tool-1',
        toolName: 'grep',
        isError: false,
      }),
    ])
  })

  it('prefers explicit session titles and otherwise falls back to inferred transcript titles', () => {
    const messages: LiveSessionMessage[] = [{ id: 'm-1', role: 'user', content: 'First prompt' }]

    expect(
      resolveSessionTitle(
        {
          sessionTitle: 'Explicit title',
        } as never,
        messages,
        'Fallback title',
      ),
    ).toBe('Explicit title')

    expect(resolveSessionTitle({} as never, messages)).toBe('First prompt')
  })
})
