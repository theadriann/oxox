// @vitest-environment jsdom

import { observable } from '@legendapp/state'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionPreview } from '../../../state/sessions/session.model'
import { CommandPalette } from '../CommandPalette'

function createSession(
  overrides: Partial<SessionPreview> & Pick<SessionPreview, 'id'>,
): SessionPreview {
  return {
    id: overrides.id,
    title: overrides.title ?? 'Unrelated visible title',
    projectKey: overrides.projectKey ?? 'project-alpha',
    projectLabel: overrides.projectLabel ?? 'project-alpha',
    projectWorkspacePath: overrides.projectWorkspacePath ?? '/tmp/project-alpha',
    parentSessionId: null,
    derivationType: null,
    hasUserMessage: true,
    status: overrides.status ?? 'completed',
    createdAt: '2026-03-24T20:00:00.000Z',
    updatedAt: '2026-03-24T20:05:00.000Z',
    lastActivityAt: '2026-03-24T20:05:00.000Z',
    lastActivityTimestamp: Date.parse('2026-03-24T20:05:00.000Z'),
  }
}

describe('CommandPalette session search', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders server-ordered session results even when the title does not contain the query', () => {
    const onSearchChange = vi.fn()
    const sessionsById$ = observable<Record<string, SessionPreview>>({
      'content-match': createSession({ id: 'content-match', title: 'Unrelated title' }),
    })

    render(
      <CommandPalette
        open={true}
        commands={[]}
        sessionIds={['content-match']}
        sessionsById$={sessionsById$}
        onOpenChange={() => undefined}
        onSelectSession={() => undefined}
        onSearchChange={onSearchChange}
        forceMountSessionResults={true}
      />,
    )

    fireEvent.change(screen.getByLabelText(/search commands and sessions/i), {
      target: { value: 'content:auth' },
    })

    expect(onSearchChange).toHaveBeenCalledWith('content:auth')
    expect(screen.getByText('Unrelated title')).toBeTruthy()
  })

  it('updates a session result from its observable node without replacing the result list', () => {
    const sessionsById$ = observable<Record<string, SessionPreview>>({
      'content-match': createSession({ id: 'content-match', title: 'Initial title' }),
    })

    render(
      <CommandPalette
        open={true}
        commands={[]}
        sessionIds={['content-match']}
        sessionsById$={sessionsById$}
        onOpenChange={() => undefined}
        onSelectSession={() => undefined}
        forceMountSessionResults={true}
      />,
    )

    fireEvent.change(screen.getByLabelText(/search commands and sessions/i), {
      target: { value: 'content' },
    })

    act(() => {
      sessionsById$['content-match'].title.set('Observable title')
    })

    expect(screen.getByText('Observable title')).toBeTruthy()
  })
})
