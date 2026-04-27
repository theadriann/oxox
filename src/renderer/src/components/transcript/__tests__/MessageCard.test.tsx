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
})
