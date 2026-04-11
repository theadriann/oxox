// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { SessionPreview } from '../../../stores/SessionStore'
import { SessionItem } from '../SessionItem'

function createSessionPreview(overrides: Partial<SessionPreview> = {}): SessionPreview {
  return {
    id: 'session-alpha',
    title: 'Alpha',
    projectKey: 'project-alpha',
    projectLabel: 'project-alpha',
    projectWorkspacePath: '/tmp/project-alpha',
    modelId: 'gpt-5.4',
    parentSessionId: null,
    hasUserMessage: true,
    status: 'active',
    createdAt: '2026-03-24T23:30:00.000Z',
    updatedAt: '2026-03-24T23:40:00.000Z',
    lastActivityAt: '2026-03-24T23:40:00.000Z',
    lastActivityTimestamp: Date.parse('2026-03-24T23:40:00.000Z'),
    ...overrides,
  }
}

describe('SessionItem', () => {
  it('renders a selected session row and forwards archive actions', async () => {
    const onArchiveSession = vi.fn()

    render(
      <SessionItem
        session={createSessionPreview()}
        focusKey="project:project-alpha:session-alpha"
        isPinned={false}
        isSelected={true}
        isFocused={true}
        isChild={false}
        now={Date.parse('2026-03-25T00:00:00.000Z')}
        onSelectSession={vi.fn()}
        onTogglePinnedSession={vi.fn()}
        onArchiveSession={onArchiveSession}
        onKeyDown={vi.fn()}
        onFocus={vi.fn()}
        setSessionRef={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /more actions for alpha/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /archive session/i }))

    expect(onArchiveSession).toHaveBeenCalledWith('session-alpha')
  })
})
