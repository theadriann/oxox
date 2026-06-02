// @vitest-environment jsdom

import { observable } from '@legendapp/state'
import { act, render, screen } from '@testing-library/react'

import type { SessionPreview } from '../../../state/sessions/session.model'
import { TooltipProvider } from '../../ui/tooltip'
import { SessionList, type VirtualSidebarItem } from '../SessionList'
import { SessionSidebarStore } from '../SessionSidebarStore'

function createSession(sessionId = 'session-alpha'): SessionPreview {
  return {
    id: sessionId,
    title: 'Alpha',
    projectKey: 'project-alpha',
    projectLabel: 'project-alpha',
    projectWorkspacePath: '/tmp/project-alpha',
    modelId: 'gpt-5.4',
    parentSessionId: null,
    derivationType: null,
    hasUserMessage: true,
    status: 'active',
    createdAt: '2026-03-24T23:30:00.000Z',
    updatedAt: '2026-03-24T23:40:00.000Z',
    lastActivityAt: '2026-03-24T23:40:00.000Z',
    lastActivityTimestamp: Date.parse('2026-03-24T23:40:00.000Z'),
  }
}

describe('SessionList', () => {
  it('renders project and session items through the virtual list shell', () => {
    const store = new SessionSidebarStore()
    const sessionRefs = new Map<string, HTMLButtonElement>()
    const scrollAreaRef = { current: document.createElement('div') }
    const sessionsById$ = observable<Record<string, SessionPreview>>({
      'session-alpha': createSession(),
    })
    const flatItems: VirtualSidebarItem[] = [
      {
        kind: 'project-header',
        projectKey: 'project-alpha',
        label: 'project-alpha',
        workspacePath: '/tmp/project-alpha',
        sessionCount: 1,
        collapsed: false,
        isEditing: false,
      },
      {
        kind: 'session',
        focusKey: 'project:project-alpha:session-alpha',
        sessionId: 'session-alpha',
        isPinned: false,
      },
    ]

    render(
      <TooltipProvider>
        <SessionList
          flatItems={flatItems}
          sessionsById$={sessionsById$}
          focusedKey="project:project-alpha:session-alpha"
          selectedSessionId="session-alpha"
          store={store}
          sessionRefs={sessionRefs}
          scrollAreaRef={scrollAreaRef}
          onToggleProject={vi.fn()}
          onNewSession={vi.fn()}
          onSetProjectDisplayName={vi.fn()}
          onSelectSession={vi.fn()}
          onTogglePinnedSession={vi.fn()}
          onSessionKeyDown={vi.fn()}
          onFocus={vi.fn()}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('project-alpha')).toBeTruthy()
    expect(screen.getByTitle('Alpha')).toBeTruthy()

    act(() => {
      sessionsById$['session-alpha'].title.set('Renamed alpha')
    })

    expect(screen.getByTitle('Renamed alpha')).toBeTruthy()
  })
})
