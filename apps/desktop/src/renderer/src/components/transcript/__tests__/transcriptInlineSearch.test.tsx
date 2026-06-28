// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TranscriptRenderer } from '../TranscriptRenderer'
import type { TimelineItem } from '../timelineTypes'
import {
  getRenderableMatchCount,
  getTimelineItemSearchText,
  TRANSCRIPT_INLINE_SEARCH_HIGHLIGHT_NAME,
} from '../transcriptInlineSearch'

function createMessageItem(id: string, content: string): TimelineItem {
  return {
    kind: 'message',
    id,
    messageId: id,
    role: 'assistant',
    content,
    status: 'completed',
    occurredAt: '2026-06-10T12:00:00.000Z',
  }
}

function createToolItem(id: string, toolName: string, resultMarkdown: string): TimelineItem {
  return {
    kind: 'tool',
    id,
    toolUseId: id,
    toolName,
    status: 'completed',
    occurredAt: '2026-06-10T12:01:00.000Z',
    inputMarkdown: null,
    resultMarkdown,
    resultIsError: false,
    progressHistory: [],
    progressSummary: null,
  }
}

describe('getTimelineItemSearchText', () => {
  it('extracts searchable text from messages, tools, and events', () => {
    expect(getTimelineItemSearchText(createMessageItem('m1', 'daemon transport failed'))).toContain(
      'daemon transport failed',
    )

    const toolText = getTimelineItemSearchText(createToolItem('t1', 'Execute', 'exit code 1'))
    expect(toolText).toContain('Execute')
    expect(toolText).toContain('exit code 1')

    expect(
      getTimelineItemSearchText({
        kind: 'event',
        id: 'e1',
        title: 'Stream warning',
        body: 'The stream stalled',
        typeLabel: 'stream.warning',
        tone: 'warning',
        details: ['latency spike'],
      }),
    ).toContain('stream stalled')
  })
})

describe('getRenderableMatchCount', () => {
  it('counts items whose text matches the query case-insensitively', () => {
    const items = [
      createMessageItem('m1', 'Daemon transport failed'),
      createMessageItem('m2', 'unrelated'),
      createToolItem('t1', 'Execute', 'daemon retry'),
    ]

    expect(getRenderableMatchCount(items, 'daemon')).toBe(2)
    expect(getRenderableMatchCount(items, '')).toBe(0)
  })
})

describe('TranscriptRenderer inline search', () => {
  const items: TimelineItem[] = [
    createMessageItem('m1', 'daemon transport failed in run one'),
    createMessageItem('m2', 'all tests passed'),
    createMessageItem('m3', 'daemon recovered after restart'),
  ]

  it('opens the inline search bar with Cmd+F in the historical view and navigates matches', () => {
    render(
      <TranscriptRenderer
        items={items}
        isLive={false}
        isLoading={false}
        scrollContextKey="inline-search-session"
      />,
    )

    expect(screen.queryByLabelText(/^find in session/i)).toBeNull()

    fireEvent.keyDown(window, { key: 'f', metaKey: true })

    const input = screen.getByLabelText(/^find in session/i)
    expect(input).toBeTruthy()

    fireEvent.change(input, { target: { value: 'daemon' } })

    expect(screen.getByText('1/2')).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('2/2')).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('1/2')).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(screen.getByText('2/2')).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByLabelText(/^find in session/i)).toBeNull()
  })

  it('shows a no-match state for queries without hits', () => {
    render(
      <TranscriptRenderer
        items={items}
        isLive={false}
        isLoading={false}
        scrollContextKey="inline-search-session-2"
      />,
    )

    fireEvent.keyDown(window, { key: 'f', metaKey: true })
    fireEvent.change(screen.getByLabelText(/^find in session/i), {
      target: { value: 'nonexistent' },
    })

    expect(screen.getByText('0/0')).toBeTruthy()
  })

  it('opens the inline search bar in the live view too', () => {
    render(<TranscriptRenderer items={items} isLive isLoading={false} />)

    fireEvent.keyDown(window, { key: 'f', metaKey: true })

    expect(screen.getByLabelText(/^find in session/i)).toBeTruthy()
  })
})

describe('TranscriptRenderer inline search highlights', () => {
  const items: TimelineItem[] = [
    createMessageItem('m1', 'daemon transport failed in run one'),
    createMessageItem('m2', 'all tests passed'),
  ]

  let highlightStore: Map<string, unknown>

  class HighlightMock {
    ranges: unknown[]

    constructor(...ranges: unknown[]) {
      this.ranges = ranges
    }
  }

  beforeEach(() => {
    highlightStore = new Map()
    vi.stubGlobal('Highlight', HighlightMock)
    vi.stubGlobal('CSS', { highlights: highlightStore })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers highlight ranges for matches while searching and clears them on close', () => {
    render(
      <TranscriptRenderer
        items={items}
        isLive={false}
        isLoading={false}
        scrollContextKey="inline-search-highlights"
      />,
    )

    fireEvent.keyDown(window, { key: 'f', metaKey: true })
    fireEvent.change(screen.getByLabelText(/^find in session/i), { target: { value: 'daemon' } })

    const highlight = highlightStore.get(TRANSCRIPT_INLINE_SEARCH_HIGHLIGHT_NAME) as
      | HighlightMock
      | undefined

    if (!highlight) {
      throw new Error('Expected a registered transcript search highlight.')
    }

    expect(highlight.ranges.length).toBeGreaterThan(0)
    expect((highlight.ranges[0] as Range).toString()).toBe('daemon')

    fireEvent.keyDown(screen.getByLabelText(/^find in session/i), { key: 'Escape' })

    expect(highlightStore.has(TRANSCRIPT_INLINE_SEARCH_HIGHLIGHT_NAME)).toBe(false)
  })

  it('clears highlights when the query has no matches', () => {
    render(
      <TranscriptRenderer
        items={items}
        isLive={false}
        isLoading={false}
        scrollContextKey="inline-search-highlights-2"
      />,
    )

    fireEvent.keyDown(window, { key: 'f', metaKey: true })
    fireEvent.change(screen.getByLabelText(/^find in session/i), { target: { value: 'daemon' } })
    fireEvent.change(screen.getByLabelText(/^find in session/i), {
      target: { value: 'nonexistent' },
    })

    expect(highlightStore.has(TRANSCRIPT_INLINE_SEARCH_HIGHLIGHT_NAME)).toBe(false)
  })
})
