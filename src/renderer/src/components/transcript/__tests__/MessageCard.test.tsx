// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({
  markdownMounts: 0,
  markdownUnmounts: 0,
}))

vi.mock('../MarkdownRenderer', async () => {
  const React = await import('react')

  return {
    MarkdownRenderer: ({ markdown }: { markdown: string }) => {
      React.useEffect(() => {
        lifecycle.markdownMounts += 1

        return () => {
          lifecycle.markdownUnmounts += 1
        }
      }, [])

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
    lifecycle.markdownMounts = 0
    lifecycle.markdownUnmounts = 0
  })

  it('keeps assistant markdown mounted while streaming content grows', () => {
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

    expect(screen.getByTestId('markdown-renderer').textContent).toBe('First chunk')
    expect(lifecycle.markdownMounts).toBe(1)
    expect(lifecycle.markdownUnmounts).toBe(0)

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

    expect(screen.getByTestId('markdown-renderer').textContent).toBe('First chunk with more output')
    expect(lifecycle.markdownMounts).toBe(1)
    expect(lifecycle.markdownUnmounts).toBe(0)
  })
})
