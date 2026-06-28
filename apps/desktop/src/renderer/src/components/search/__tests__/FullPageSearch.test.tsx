// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SessionSearchResponse, SessionTranscript } from '../../../../../shared/ipc/contracts'
import type { SessionPreview } from '../../../state/sessions/session.model'
import { FullPageSearch } from '../FullPageSearch'

function createSession(overrides: Partial<SessionPreview> & Pick<SessionPreview, 'id'>) {
  return {
    id: overrides.id,
    title: overrides.title ?? 'Searchable session',
    projectKey: overrides.projectKey ?? 'project-alpha',
    projectLabel: overrides.projectLabel ?? 'project-alpha',
    projectWorkspacePath: overrides.projectWorkspacePath ?? '/tmp/project-alpha',
    parentSessionId: null,
    derivationType: null,
    hasUserMessage: true,
    status: overrides.status ?? 'completed',
    transport: overrides.transport ?? 'artifacts',
    createdAt: overrides.createdAt ?? '2026-06-10T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-10T12:10:00.000Z',
    lastActivityAt: overrides.lastActivityAt ?? '2026-06-10T12:10:00.000Z',
    lastActivityTimestamp: Date.parse(overrides.lastActivityAt ?? '2026-06-10T12:10:00.000Z'),
  } satisfies SessionPreview
}

function textContentIncludes(value: string) {
  return (_text: string, element: Element | null) =>
    Boolean(element?.textContent?.includes(value)) &&
    !Array.from(element?.children ?? []).some((child) => child.textContent?.includes(value))
}

function getSearchInput() {
  return screen.getByLabelText(/search sessions, messages, tools, files, outputs/i)
}

describe('FullPageSearch', () => {
  it('does not render every session card before a query or filter is active', () => {
    render(
      <FullPageSearch
        sessions={Array.from({ length: 500 }, (_, index) =>
          createSession({
            id: `session-${index}`,
            title: `Unrequested session ${index}`,
            lastActivityAt: `2026-06-${String((index % 9) + 1).padStart(2, '0')}T09:00:00.000Z`,
          }),
        )}
        onSelectSession={() => undefined}
      />,
    )

    expect(screen.getByText('Search everything Droid remembers')).toBeTruthy()
    expect(screen.queryByText('Unrequested session 499')).toBeNull()
  })

  it('searches as you type, groups result types, and opens the best fragment target', async () => {
    const onSelectSession = vi.fn()
    const searchSessions = vi.fn(async (request: { query: string }) => {
      const response: SessionSearchResponse = {
        query: request.query,
        matches: [
          {
            sessionId: 'message-session',
            score: 91,
            reasons: [
              {
                field: 'content',
                snippet: 'Assistant explained the ResizeObserver failure',
                sourceKind: 'block',
                sourceId: 'message-1:0',
                messageId: 'message-1',
                role: 'assistant',
              },
            ],
          },
          {
            sessionId: 'tool-session',
            score: 64,
            reasons: [
              {
                field: 'tool',
                snippet: 'Execute pnpm test --filter daemon/transport.ts',
                sourceKind: 'tool_call',
                sourceId: 'tool-1',
                toolCallId: 'tool-1',
              },
            ],
          },
        ],
      }

      return response
    })

    render(
      <FullPageSearch
        sessions={[
          createSession({ id: 'message-session', title: 'ResizeObserver debug' }),
          createSession({ id: 'tool-session', title: 'Transport test run' }),
        ]}
        searchSessions={searchSessions}
        onSelectSession={onSelectSession}
      />,
    )

    fireEvent.change(getSearchInput(), { target: { value: 'resizeobserver' } })

    await waitFor(() =>
      expect(searchSessions).toHaveBeenCalledWith({ query: 'resizeobserver', limit: 100 }),
    )

    expect(screen.getAllByText('Messages').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Assistant messages').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tools').length).toBeGreaterThan(0)
    expect(screen.getByText('ResizeObserver debug')).toBeTruthy()
    expect(screen.getAllByText('Assistant message matched transcript text').length).toBeGreaterThan(
      0,
    )
    expect(screen.getAllByText('Tool call matched tool name').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(textContentIncludes('Assistant explained the ResizeObserver failure'))
        .length,
    ).toBeGreaterThan(0)

    const snippetElement = screen.getAllByText(
      textContentIncludes('Assistant explained the ResizeObserver failure'),
    )[0]
    fireEvent.click(snippetElement.closest('button') as HTMLElement)

    expect(onSelectSession).toHaveBeenCalledWith('message-session', {
      messageId: 'message-1',
      sessionId: 'message-session',
      sourceId: 'message-1:0',
      sourceKind: 'block',
      toolCallId: undefined,
    })
  })

  it('progressively discloses many hits within a session group', async () => {
    const searchSessions = vi.fn(async (request: { query: string }) => {
      const response: SessionSearchResponse = {
        hits: Array.from({ length: 7 }, (_, index) => ({
          id: `many-hit-session:block:message-${index}`,
          reason: {
            field: 'content',
            messageId: `message-${index}`,
            snippet: `path match ${index}`,
            sourceId: `message-${index}:0`,
            sourceKind: 'block',
          },
          score: 100 - index,
          sessionId: 'many-hit-session',
        })),
        matches: [],
        query: request.query,
      }

      return response
    })

    render(
      <FullPageSearch
        sessions={[createSession({ id: 'many-hit-session', title: 'Many path hits' })]}
        searchSessions={searchSessions}
        onSelectSession={() => undefined}
      />,
    )

    fireEvent.change(getSearchInput(), { target: { value: '/var/run/argo' } })

    await waitFor(() =>
      expect(searchSessions).toHaveBeenCalledWith({ query: '/var/run/argo', limit: 100 }),
    )

    expect(screen.getAllByText('path match 0').length).toBeGreaterThan(0)
    expect(screen.getAllByText('path match 2').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('[data-search-result-id]')).toHaveLength(4)

    fireEvent.click(screen.getByText('View all 7 message matches'))

    expect(document.querySelectorAll('[data-search-result-id]')).toHaveLength(8)
    expect(screen.getAllByText('path match 6').length).toBeGreaterThan(0)
  })

  it('loads more backend results when more are available', async () => {
    const searchSessions = vi.fn(async (request: { query: string; limit: number }) => {
      const response: SessionSearchResponse = {
        hasMore: request.limit < 200,
        hits: Array.from({ length: Math.min(request.limit, 150) }, (_, index) => ({
          id: `load-more-session:block:message-${index}`,
          reason: {
            field: 'content',
            messageId: `message-${index}`,
            snippet: `load more match ${index}`,
            sourceId: `message-${index}:0`,
            sourceKind: 'block',
          },
          score: 200 - index,
          sessionId: 'load-more-session',
        })),
        matches: [],
        query: request.query,
      }

      return response
    })

    render(
      <FullPageSearch
        sessions={[createSession({ id: 'load-more-session', title: 'Load more session' })]}
        searchSessions={searchSessions}
        onSelectSession={() => undefined}
      />,
    )

    fireEvent.change(getSearchInput(), { target: { value: 'build logs compute' } })

    await waitFor(() =>
      expect(searchSessions).toHaveBeenCalledWith({ query: 'build logs compute', limit: 100 }),
    )

    fireEvent.click(screen.getByText('Load more results'))

    await waitFor(() =>
      expect(searchSessions).toHaveBeenCalledWith({ query: 'build logs compute', limit: 200 }),
    )
    expect(screen.getByText('View all 150 message matches')).toBeTruthy()
  })

  it('converts completed operator tokens into removable chips and includes them in the query', async () => {
    const searchSessions = vi.fn(async (request: { query: string }) => {
      const response: SessionSearchResponse = { query: request.query, matches: [] }
      return response
    })

    render(
      <FullPageSearch
        sessions={[]}
        searchSessions={searchSessions}
        onSelectSession={() => undefined}
      />,
    )

    fireEvent.change(getSearchInput(), { target: { value: 'tool:Execute daemon' } })

    expect(screen.getByText('tool:')).toBeTruthy()
    expect(screen.getByText('Execute')).toBeTruthy()
    expect((getSearchInput() as HTMLInputElement).value).toBe('daemon')

    await waitFor(() =>
      expect(searchSessions).toHaveBeenCalledWith({ query: 'tool:Execute daemon', limit: 100 }),
    )

    fireEvent.click(screen.getByRole('button', { name: /remove filter tool:Execute/i }))

    expect(screen.queryByText('tool:')).toBeNull()

    await waitFor(() =>
      expect(searchSessions).toHaveBeenCalledWith({ query: 'daemon', limit: 100 }),
    )
  })

  it('supports keyboard navigation across results and opens with Enter', async () => {
    const onSelectSession = vi.fn()
    const searchSessions = vi.fn(async (request: { query: string }) => {
      const response: SessionSearchResponse = {
        query: request.query,
        matches: [
          {
            sessionId: 'first-session',
            score: 90,
            reasons: [
              {
                field: 'content',
                snippet: 'first match',
                sourceKind: 'block',
                sourceId: 'message-1:0',
                messageId: 'message-1',
              },
            ],
          },
          {
            sessionId: 'second-session',
            score: 70,
            reasons: [
              {
                field: 'content',
                snippet: 'second match',
                sourceKind: 'block',
                sourceId: 'message-2:0',
                messageId: 'message-2',
              },
            ],
          },
        ],
      }

      return response
    })

    render(
      <FullPageSearch
        sessions={[
          createSession({ id: 'first-session', title: 'First session' }),
          createSession({ id: 'second-session', title: 'Second session' }),
        ]}
        searchSessions={searchSessions}
        onSelectSession={onSelectSession}
      />,
    )

    fireEvent.change(getSearchInput(), { target: { value: 'match' } })

    await waitFor(() => expect(searchSessions).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getAllByText(textContentIncludes('first match')).length).toBeGreaterThan(0),
    )

    fireEvent.keyDown(getSearchInput(), { key: 'ArrowDown' })
    fireEvent.keyDown(getSearchInput(), { key: 'Enter' })

    expect(onSelectSession).toHaveBeenCalledWith(
      'second-session',
      expect.objectContaining({ messageId: 'message-2' }),
    )
  })

  it('filters scope counts through the scope tabs', async () => {
    const searchSessions = vi.fn(async (request: { query: string }) => {
      const response: SessionSearchResponse = {
        query: request.query,
        matches: [
          {
            sessionId: 'message-session',
            score: 91,
            reasons: [
              {
                field: 'content',
                snippet: 'a message hit',
                sourceKind: 'block',
                sourceId: 'message-1:0',
                messageId: 'message-1',
              },
            ],
          },
          {
            sessionId: 'tool-session',
            score: 64,
            reasons: [
              {
                field: 'tool',
                snippet: 'a tool hit',
                sourceKind: 'tool_call',
                sourceId: 'tool-1',
                toolCallId: 'tool-1',
              },
            ],
          },
        ],
      }

      return response
    })

    render(
      <FullPageSearch
        sessions={[
          createSession({ id: 'message-session', title: 'Message session' }),
          createSession({ id: 'tool-session', title: 'Tool session' }),
        ]}
        searchSessions={searchSessions}
        onSelectSession={() => undefined}
      />,
    )

    fireEvent.change(getSearchInput(), { target: { value: 'hit' } })

    await waitFor(() =>
      expect(screen.getAllByText(textContentIncludes('a message hit')).length).toBeGreaterThan(0),
    )

    fireEvent.click(screen.getByRole('tab', { name: /tools/i }))

    expect(screen.getAllByText(textContentIncludes('a tool hit')).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(textContentIncludes('a message hit'))).toHaveLength(0)
  })

  it('shows the inspector preview for the selected result with an open action', async () => {
    const onSelectSession = vi.fn()
    const getSessionTranscript = vi.fn(
      async (): Promise<SessionTranscript> => ({
        entries: [
          {
            id: 'message-before',
            kind: 'message',
            markdown: 'before inspected context',
            occurredAt: null,
            role: 'user',
          },
          {
            id: 'message-1',
            kind: 'message',
            markdown: 'inspected transcript context with surrounding detail',
            occurredAt: null,
            role: 'assistant',
          },
        ],
        loadedAt: '2026-06-10T12:00:00.000Z',
        sessionId: 'inspected-session',
      }),
    )
    const searchSessions = vi.fn(async (request: { query: string }) => {
      const response: SessionSearchResponse = {
        query: request.query,
        matches: [
          {
            sessionId: 'inspected-session',
            score: 91,
            reasons: [
              {
                field: 'content',
                snippet: 'inspected snippet body',
                sourceKind: 'block',
                sourceId: 'message-1:0',
                messageId: 'message-1',
              },
            ],
          },
        ],
      }

      return response
    })

    render(
      <FullPageSearch
        sessions={[
          createSession({
            id: 'inspected-session',
            title: 'Inspected session',
            projectWorkspacePath: '/tmp/inspected',
          }),
        ]}
        getSessionTranscript={getSessionTranscript}
        searchSessions={searchSessions}
        onSelectSession={onSelectSession}
      />,
    )

    fireEvent.change(getSearchInput(), { target: { value: 'inspected' } })

    await waitFor(() =>
      expect(
        screen.getAllByText(textContentIncludes('inspected snippet body')).length,
      ).toBeGreaterThan(0),
    )

    const inspector = screen.getByRole('complementary', { name: /transcript preview/i })
    expect(inspector.textContent).toContain('Inspected session')
    expect(inspector.textContent).toContain('/tmp/inspected')
    await waitFor(() =>
      expect(inspector.textContent).toContain(
        'inspected transcript context with surrounding detail',
      ),
    )
    expect(inspector.textContent).toContain('before inspected context')

    fireEvent.click(screen.getByRole('button', { name: /open match/i }))

    expect(onSelectSession).toHaveBeenCalledWith(
      'inspected-session',
      expect.objectContaining({ messageId: 'message-1' }),
    )
  })

  it('updates the inspector from the hovered result without opening it', async () => {
    const searchSessions = vi.fn(async (request: { query: string }) => ({
      hits: [
        {
          id: 'first-session:block:message-1',
          reason: {
            field: 'content',
            messageId: 'message-1',
            snippet: 'first hover snippet',
            sourceId: 'message-1:0',
            sourceKind: 'block' as const,
          },
          score: 90,
          sessionId: 'first-session',
        },
        {
          id: 'second-session:block:message-2',
          reason: {
            field: 'content',
            messageId: 'message-2',
            snippet: 'second hover snippet with more context',
            sourceId: 'message-2:0',
            sourceKind: 'block' as const,
          },
          score: 80,
          sessionId: 'second-session',
        },
      ],
      matches: [],
      query: request.query,
    }))

    render(
      <FullPageSearch
        sessions={[
          createSession({ id: 'first-session', title: 'First inspected session' }),
          createSession({ id: 'second-session', title: 'Second inspected session' }),
        ]}
        searchSessions={searchSessions}
        onSelectSession={() => undefined}
      />,
    )

    fireEvent.change(getSearchInput(), { target: { value: 'hover' } })

    await waitFor(() =>
      expect(
        screen.getAllByText(textContentIncludes('second hover snippet with more context')).length,
      ).toBeGreaterThan(0),
    )
    const secondRow = screen
      .getAllByText(textContentIncludes('second hover snippet with more context'))[0]
      ?.closest('button')

    expect(secondRow).toBeTruthy()
    fireEvent.mouseEnter(secondRow as HTMLElement)

    const inspector = screen.getByRole('complementary', { name: /transcript preview/i })
    expect(inspector.textContent).toContain('Second inspected session')
    expect(inspector.textContent).toContain('second hover snippet with more context')
    expect(inspector.textContent).toContain('Match')
  })

  it('renders backend matches even before matching session previews are loaded', async () => {
    const searchSessions = vi.fn(async (request: { query: string }) => {
      const response: SessionSearchResponse = {
        query: request.query,
        matches: [
          {
            sessionId: 'indexed-session-only',
            score: 88,
            reasons: [
              {
                field: 'content',
                snippet: 'Indexed transcript result from SQLite',
                sourceKind: 'block',
                sourceId: 'message-1:0',
                messageId: 'message-1',
              },
            ],
          },
        ],
      }

      return response
    })

    render(
      <FullPageSearch
        sessions={[]}
        searchSessions={searchSessions}
        onSelectSession={() => undefined}
      />,
    )

    fireEvent.change(getSearchInput(), { target: { value: 'indexed transcript' } })

    await waitFor(() =>
      expect(searchSessions).toHaveBeenCalledWith({ query: 'indexed transcript', limit: 100 }),
    )

    expect(
      screen.getAllByText(textContentIncludes('Indexed transcript result from SQLite')).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('indexed-session-only').length).toBeGreaterThan(0)
  })

  it('highlights query terms in snippets', async () => {
    const searchSessions = vi.fn(async (request: { query: string }) => {
      const response: SessionSearchResponse = {
        query: request.query,
        matches: [
          {
            sessionId: 'highlight-session',
            score: 82,
            reasons: [
              {
                field: 'content',
                snippet: 'ResizeObserver failed after pnpm test in the daemon transport flow.',
                sourceKind: 'block',
                sourceId: 'message-1:0',
                messageId: 'message-1',
              },
            ],
          },
        ],
      }

      return response
    })

    render(
      <FullPageSearch
        sessions={[createSession({ id: 'highlight-session', title: 'ResizeObserver debug' })]}
        searchSessions={searchSessions}
        onSelectSession={() => undefined}
      />,
    )

    fireEvent.change(getSearchInput(), { target: { value: 'resizeobserver daemon' } })

    await waitFor(() => expect(searchSessions).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getAllByText(/resizeobserver/i, { selector: 'mark' }).length).toBeGreaterThan(
        0,
      ),
    )
    expect(screen.getAllByText(/daemon/i, { selector: 'mark' }).length).toBeGreaterThan(0)
  })

  it('filters the project picker options through its inline search input', async () => {
    render(
      <FullPageSearch
        sessions={[
          createSession({
            id: 'oxox-session',
            projectLabel: 'oxox',
            projectWorkspacePath: '/Users/me/code/oxox',
          }),
          createSession({
            id: 'sdk-session',
            projectLabel: 'droid-sdk',
            projectWorkspacePath: '/Users/me/code/droid-sdk-typescript',
          }),
        ]}
        onSelectSession={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /project:\s*any/i }))

    expect(screen.getAllByRole('checkbox')).toHaveLength(2)

    fireEvent.change(screen.getByLabelText(/search projects/i), { target: { value: 'sdk' } })

    expect(screen.queryByRole('checkbox', { name: /^oxox\b/i })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /droid-sdk/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /clear project search/i }))

    expect((screen.getByLabelText(/search projects/i) as HTMLInputElement).value).toBe('')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('browses recent sessions by status and date preset without a query', async () => {
    render(
      <FullPageSearch
        sessions={[
          createSession({
            id: 'active-session',
            title: 'Active today',
            status: 'active',
            lastActivityAt: new Date().toISOString(),
          }),
          createSession({
            id: 'completed-session',
            title: 'Completed long ago',
            status: 'completed',
            lastActivityAt: '2024-01-01T09:00:00.000Z',
          }),
        ]}
        onSelectSession={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /status:\s*any/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /^active$/i }))

    expect(screen.getAllByText('Active today').length).toBeGreaterThan(0)
    expect(screen.queryByText('Completed long ago')).toBeNull()
  })
})
