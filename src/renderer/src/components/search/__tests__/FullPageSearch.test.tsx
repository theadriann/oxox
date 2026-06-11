// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SessionSearchResponse } from '../../../../../shared/ipc/contracts'
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
      expect(searchSessions).toHaveBeenCalledWith({ query: 'resizeobserver', limit: 80 }),
    )

    expect(screen.getAllByText('Messages').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tools').length).toBeGreaterThan(0)
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
      expect(searchSessions).toHaveBeenCalledWith({ query: 'tool:Execute daemon', limit: 80 }),
    )

    fireEvent.click(screen.getByRole('button', { name: /remove filter tool:Execute/i }))

    expect(screen.queryByText('tool:')).toBeNull()

    await waitFor(() => expect(searchSessions).toHaveBeenCalledWith({ query: 'daemon', limit: 80 }))
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

    const inspector = screen.getByRole('complementary', { name: /result inspector/i })
    expect(inspector.textContent).toContain('Inspected session')
    expect(inspector.textContent).toContain('/tmp/inspected')

    fireEvent.click(screen.getByRole('button', { name: /open at match/i }))

    expect(onSelectSession).toHaveBeenCalledWith(
      'inspected-session',
      expect.objectContaining({ messageId: 'message-1' }),
    )
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
      expect(searchSessions).toHaveBeenCalledWith({ query: 'indexed transcript', limit: 80 }),
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
