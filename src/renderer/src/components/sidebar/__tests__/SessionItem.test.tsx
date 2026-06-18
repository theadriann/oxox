// @vitest-environment jsdom

import { observable } from '@legendapp/state'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { SessionPreview } from '../../../state/sessions/session.model'
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
    transport: 'stream-jsonrpc',
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
    const onCompactSession = vi.fn()
    const onDeleteSession = vi.fn()
    const session$ = observable(createSessionPreview())
    const now$ = observable(Date.parse('2026-03-25T00:00:00.000Z'))

    render(
      <SessionItem
        session$={session$}
        focusKey="project:project-alpha:session-alpha"
        isPinned={false}
        isSelected={true}
        isFocused={true}
        now$={now$}
        onSelectSession={vi.fn()}
        onTogglePinnedSession={vi.fn()}
        onArchiveSession={onArchiveSession}
        onCompactSession={onCompactSession}
        onDeleteSession={onDeleteSession}
        onKeyDown={vi.fn()}
        onFocus={vi.fn()}
        setSessionRef={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /more actions for alpha/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /compact session/i }))
    expect(onCompactSession).toHaveBeenCalledWith('session-alpha')

    await userEvent.click(screen.getByRole('button', { name: /more actions for alpha/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /archive session/i }))

    expect(onArchiveSession).toHaveBeenCalledWith('session-alpha')

    await userEvent.click(screen.getByRole('button', { name: /more actions for alpha/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /delete session/i }))

    expect(onDeleteSession).toHaveBeenCalledWith('session-alpha')
  })

  it('opens the same actions from the row context menu', async () => {
    const onArchiveSession = vi.fn()
    const onRenameSession = vi.fn()
    const session$ = observable(createSessionPreview())
    const now$ = observable(Date.parse('2026-03-25T00:00:00.000Z'))

    render(
      <SessionItem
        session$={session$}
        focusKey="project:project-alpha:session-alpha"
        isPinned={false}
        isSelected={false}
        isFocused={true}
        now$={now$}
        onSelectSession={vi.fn()}
        onTogglePinnedSession={vi.fn()}
        onArchiveSession={onArchiveSession}
        onRenameSession={onRenameSession}
        onKeyDown={vi.fn()}
        onFocus={vi.fn()}
        setSessionRef={vi.fn()}
      />,
    )

    fireEvent.contextMenu(screen.getByTitle('Alpha'), { clientX: 20, clientY: 20 })

    await userEvent.click(screen.getByRole('menuitem', { name: /rename session/i }))
    expect(onRenameSession).toHaveBeenCalledWith('session-alpha')

    fireEvent.contextMenu(screen.getByTitle('Alpha'), { clientX: 20, clientY: 20 })
    await userEvent.click(screen.getByRole('menuitem', { name: /archive session/i }))
    expect(onArchiveSession).toHaveBeenCalledWith('session-alpha')
  })

  it('updates row content from the observable session node', () => {
    const session$ = observable(createSessionPreview())
    const now$ = observable(Date.parse('2026-03-25T00:00:00.000Z'))

    render(
      <SessionItem
        session$={session$}
        focusKey="project:project-alpha:session-alpha"
        isPinned={false}
        isSelected={false}
        isFocused={false}
        now$={now$}
        onSelectSession={vi.fn()}
        onTogglePinnedSession={vi.fn()}
        onKeyDown={vi.fn()}
        onFocus={vi.fn()}
        setSessionRef={vi.fn()}
      />,
    )

    act(() => {
      session$.title.set('Renamed alpha')
    })

    expect(screen.getByTitle('Renamed alpha')).toBeTruthy()
  })

  it('does not render session transport ownership for now', () => {
    const session$ = observable(
      createSessionPreview({
        transport: 'daemon',
      }),
    )
    const now$ = observable(Date.parse('2026-03-25T00:00:00.000Z'))

    render(
      <SessionItem
        session$={session$}
        focusKey="project:project-alpha:session-alpha"
        isPinned={false}
        isSelected={false}
        isFocused={false}
        now$={now$}
        onSelectSession={vi.fn()}
        onTogglePinnedSession={vi.fn()}
        onKeyDown={vi.fn()}
        onFocus={vi.fn()}
        setSessionRef={vi.fn()}
      />,
    )

    expect(screen.queryByTitle('Session transport: Daemon')).toBeNull()
  })

  it('does not render remote daemon transport ownership for now', () => {
    const session$ = observable(
      createSessionPreview({
        transport: 'daemon',
        transportLocation: 'remote',
      }),
    )
    const now$ = observable(Date.parse('2026-03-25T00:00:00.000Z'))

    render(
      <SessionItem
        session$={session$}
        focusKey="project:project-alpha:session-alpha"
        isPinned={false}
        isSelected={false}
        isFocused={false}
        now$={now$}
        onSelectSession={vi.fn()}
        onTogglePinnedSession={vi.fn()}
        onKeyDown={vi.fn()}
        onFocus={vi.fn()}
        setSessionRef={vi.fn()}
      />,
    )

    expect(screen.queryByTitle('Session transport: Remote daemon')).toBeNull()
  })

  it('does not indent forked sessions as child rows', () => {
    const session$ = observable(
      createSessionPreview({
        parentSessionId: 'session-parent',
        derivationType: 'fork',
      }),
    )
    const now$ = observable(Date.parse('2026-03-25T00:00:00.000Z'))

    render(
      <SessionItem
        session$={session$}
        focusKey="project:project-alpha:session-alpha"
        isPinned={false}
        isSelected={false}
        isFocused={false}
        now$={now$}
        onSelectSession={vi.fn()}
        onTogglePinnedSession={vi.fn()}
        onKeyDown={vi.fn()}
        onFocus={vi.fn()}
        setSessionRef={vi.fn()}
      />,
    )

    expect(screen.getByTitle('Alpha').getAttribute('style')).toContain('padding-left: 10px')
  })

  it('indents subagent sessions as child rows', () => {
    const session$ = observable(
      createSessionPreview({
        parentSessionId: 'session-parent',
        derivationType: 'subagent',
      }),
    )
    const now$ = observable(Date.parse('2026-03-25T00:00:00.000Z'))

    render(
      <SessionItem
        session$={session$}
        focusKey="project:project-alpha:session-alpha"
        isPinned={false}
        isSelected={false}
        isFocused={false}
        now$={now$}
        onSelectSession={vi.fn()}
        onTogglePinnedSession={vi.fn()}
        onKeyDown={vi.fn()}
        onFocus={vi.fn()}
        setSessionRef={vi.fn()}
      />,
    )

    expect(screen.getByTitle('Alpha').getAttribute('style')).toContain('padding-left: 28px')
  })
})
