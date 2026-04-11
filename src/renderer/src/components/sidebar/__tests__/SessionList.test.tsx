// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'

import type { ProjectSessionGroup, SessionPreview } from '../../../stores/SessionStore'
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

function createProjectGroup(): ProjectSessionGroup {
  return {
    key: 'project-alpha',
    label: 'project-alpha',
    workspacePath: '/tmp/project-alpha',
    latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
    sessions: [createSession()],
  }
}

describe('SessionList', () => {
  it('renders project and session items through the virtual list shell', () => {
    const store = new SessionSidebarStore()
    const sessionRefs = new Map<string, HTMLButtonElement>()
    const scrollAreaRef = { current: document.createElement('div') }
    const flatItems: VirtualSidebarItem[] = [
      {
        kind: 'project-header',
        group: createProjectGroup(),
        collapsed: false,
        isEditing: false,
      },
      {
        kind: 'session',
        focusKey: 'project:project-alpha:session-alpha',
        session: createSession(),
        isPinned: false,
      },
    ]

    render(
      <TooltipProvider>
        <SessionList
          flatItems={flatItems}
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
  })
})
