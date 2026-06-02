// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({
  markdownRenders: 0,
}))

vi.mock('../MarkdownRenderer', () => {
  return {
    MarkdownRenderer: ({ markdown }: { markdown: string }) => {
      lifecycle.markdownRenders += 1

      return <div data-testid="markdown-renderer">{markdown}</div>
    },
  }
})

vi.mock('../JsonRenderMessage', () => ({
  JsonRenderMessage: ({ spec }: { spec: { root: string } }) => (
    <div data-testid="json-render-message">{spec.root}</div>
  ),
  parseJsonRenderContentSegments: (content: string) => [{ kind: 'markdown' as const, content }],
}))

import { MessageCard } from '../MessageCard'

describe('MessageCard', () => {
  beforeEach(() => {
    lifecycle.markdownRenders = 0
  })

  it('renders streaming assistant content as lightweight text until completion', () => {
    const { rerender } = render(
      <MessageCard
        item={{
          kind: 'message',
          id: 'assistant-1',
          messageId: 'assistant-1',
          role: 'assistant',
          content: 'First chunk',
          status: 'streaming',
          occurredAt: null,
        }}
      />,
    )

    expect(screen.getByTestId('streaming-message-preview').textContent).toBe('First chunk')
    expect(screen.queryByTestId('markdown-renderer')).toBeNull()
    expect(lifecycle.markdownRenders).toBe(0)

    rerender(
      <MessageCard
        item={{
          kind: 'message',
          id: 'assistant-1',
          messageId: 'assistant-1',
          role: 'assistant',
          content: 'First chunk with more output',
          status: 'streaming',
          occurredAt: null,
        }}
      />,
    )

    expect(screen.getByTestId('streaming-message-preview').textContent).toBe(
      'First chunk with more output',
    )
    expect(lifecycle.markdownRenders).toBe(0)

    rerender(
      <MessageCard
        item={{
          kind: 'message',
          id: 'assistant-1',
          messageId: 'assistant-1',
          role: 'assistant',
          content: 'First chunk with more output',
          status: 'completed',
          occurredAt: null,
        }}
      />,
    )

    expect(screen.getByTestId('markdown-renderer').textContent).toBe('First chunk with more output')
    expect(lifecycle.markdownRenders).toBe(1)
  })

  it('renders live thinking content blocks as collapsible thinking cards', () => {
    render(
      <MessageCard
        item={{
          kind: 'message',
          id: 'assistant-thinking-1',
          messageId: 'assistant-thinking-1',
          role: 'assistant',
          content: '',
          status: 'completed',
          occurredAt: null,
          contentBlocks: [
            {
              type: 'thinking',
              signature: '{"id":"rs_123","type":"reasoning"}',
              signatureProvider: 'openai',
              thinking: '**Validating tests**\n\nI should run lint and tests.',
            },
          ],
        }}
      />,
    )

    expect(screen.getByRole('button', { name: /toggle thinking/i })).toBeTruthy()
    expect(screen.queryByText(/signatureProvider/)).toBeNull()
    expect(screen.queryByText(/rs_123/)).toBeNull()
  })

  it('renders legacy serialized thinking JSON markdown as a thinking card', () => {
    render(
      <MessageCard
        item={{
          kind: 'message',
          id: 'assistant-thinking-legacy',
          messageId: 'assistant-thinking-legacy',
          role: 'assistant',
          content:
            '```json\n{"type":"thinking","signature":"{\\"id\\":\\"rs_123\\"}","signatureProvider":"openai","durationMs":2729,"thinking":"**Validating tests**\\n\\nI should run lint and tests."}\n```',
          status: 'completed',
          occurredAt: null,
        }}
      />,
    )

    expect(screen.getByRole('button', { name: /toggle thinking/i })).toBeTruthy()
    expect(screen.queryByText(/signatureProvider/)).toBeNull()
    expect(screen.queryByText(/rs_123/)).toBeNull()
    expect(screen.queryByTestId('markdown-renderer')).toBeNull()
  })

  it('renders thinking blocks subtly without a bordered background', () => {
    render(
      <MessageCard
        item={{
          kind: 'message',
          id: 'assistant-thinking-subtle',
          messageId: 'assistant-thinking-subtle',
          role: 'assistant',
          content: '',
          status: 'completed',
          occurredAt: null,
          contentBlocks: [
            {
              type: 'thinking',
              thinking: 'Small thought',
            },
          ],
        }}
      />,
    )

    const thinkingToggle = screen.getByRole('button', { name: /toggle thinking/i })

    expect(thinkingToggle.className).not.toContain('border')
    expect(thinkingToggle.className).not.toContain('bg-')
  })

  it('places the thinking chevron beside the label', () => {
    render(
      <MessageCard
        item={{
          kind: 'message',
          id: 'assistant-thinking-chevron',
          messageId: 'assistant-thinking-chevron',
          role: 'assistant',
          content: '',
          status: 'completed',
          occurredAt: null,
          contentBlocks: [
            {
              type: 'thinking',
              thinking: 'Small thought',
            },
          ],
        }}
      />,
    )

    const thinkingToggle = screen.getByRole('button', { name: /toggle thinking/i })
    const label = screen.getByText('Thinking')

    expect(label.nextElementSibling?.querySelector('svg')).toBeTruthy()
    expect(thinkingToggle.querySelector('.flex-1')).toBeNull()
  })

  it('formats assistant timestamps as local time with optional thinking duration', () => {
    render(
      <MessageCard
        item={{
          kind: 'message',
          id: 'assistant-time-1',
          messageId: 'assistant-time-1',
          role: 'assistant',
          content: 'Done',
          status: 'completed',
          occurredAt: '2026-06-02T12:34:34.318Z',
          contentBlocks: [
            {
              type: 'thinking',
              thinking: 'Quick thought',
              durationMs: 7294,
            },
            {
              type: 'text',
              text: 'Done',
            },
          ],
        }}
      />,
    )

    const timestamp = screen.getByTitle('2026-06-02T12:34:34.318Z')
    const markdown = screen.getByTestId('markdown-renderer')

    expect(timestamp.textContent).not.toContain('2026-06-02T12:34:34.318Z')
    expect(timestamp.textContent).toContain('7s')
    expect(timestamp.getAttribute('title')).toBe('2026-06-02T12:34:34.318Z')
    expect(markdown.compareDocumentPosition(timestamp) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})
