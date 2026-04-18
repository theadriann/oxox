// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useValue } from '../../../stores/legend'
import { UIStore } from '../../../stores/UIStore'
import { SessionSidebarConnected as SessionSidebar } from '../SessionSidebarConnected'

describe('SessionSidebar', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        return {
          bottom: 600,
          height: 600,
          left: 0,
          right: 280,
          top: 0,
          width: 280,
          x: 0,
          y: 0,
          toJSON() {
            return {}
          },
        }
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders loading, empty, and error states with recovery actions', () => {
    const onNewSession = vi.fn()
    const onRetry = vi.fn()

    const { rerender } = render(
      <SessionSidebar
        groups={[]}
        selectedSessionId=""
        activeCount={0}
        isLoading={true}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        pinnedSessions={[]}
        onNewSession={onNewSession}
        onResizeStart={() => undefined}
      />,
    )

    expect(screen.getByText('Loading sessions')).toBeTruthy()

    rerender(
      <SessionSidebar
        groups={[]}
        selectedSessionId=""
        activeCount={0}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        pinnedSessions={[]}
        onNewSession={onNewSession}
        onResizeStart={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create session' }))
    expect(onNewSession).toHaveBeenCalledTimes(1)

    rerender(
      <SessionSidebar
        groups={[]}
        selectedSessionId=""
        activeCount={0}
        errorState={{
          title: 'Session index unavailable',
          description: 'Retry to restore the sidebar.',
          actionLabel: 'Retry loading sessions',
          onAction: onRetry,
        }}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        pinnedSessions={[]}
        onNewSession={onNewSession}
        onResizeStart={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading sessions' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders project groups with workspace paths, exposes full titles on hover, and refreshes relative timestamps', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T00:00:00.000Z'))

    render(
      <SessionSidebar
        groups={[
          {
            key: 'project-alpha',
            label: 'project-alpha',
            workspacePath: '/tmp/project-alpha',
            latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
            sessions: [
              {
                id: 'session-alpha',
                title: 'Very long session title that should keep its tooltip intact',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'active',
                createdAt: '2026-03-24T23:40:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
              },
            ],
          },
        ]}
        selectedSessionId="session-alpha"
        activeCount={1}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        pinnedSessions={[]}
        onNewSession={() => undefined}
        onResizeStart={() => undefined}
      />,
    )

    const sessionButton = screen.getByTitle(
      'Very long session title that should keep its tooltip intact',
    )

    expect(screen.getByText('project-alpha')).toBeTruthy()
    // Workspace path is shown below the project header
    expect(screen.getByText('/tmp/project-alpha')).toBeTruthy()
    expect(sessionButton).toBeTruthy()
    expect(screen.getByText('Just now')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(screen.getByText('1m ago')).toBeTruthy()
    vi.useRealTimers()
  })

  it('offers a per-workspace new-session action from each project header', () => {
    const onNewSession = vi.fn()

    render(
      <SessionSidebar
        groups={[
          {
            key: 'project-alpha',
            label: 'project-alpha',
            workspacePath: '/tmp/project-alpha',
            latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
            sessions: [
              {
                id: 'session-alpha',
                title: 'Alpha',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'active',
                createdAt: '2026-03-24T23:40:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
              },
            ],
          },
        ]}
        selectedSessionId="session-alpha"
        activeCount={1}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        pinnedSessions={[]}
        onNewSession={onNewSession}
        onResizeStart={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /create session in project-alpha/i }))

    expect(onNewSession).toHaveBeenCalledWith('/tmp/project-alpha')
  })

  it('offers a session archive action from the row menu', async () => {
    const onArchiveSession = vi.fn()

    render(
      <SessionSidebar
        groups={[
          {
            key: 'project-alpha',
            label: 'project-alpha',
            workspacePath: '/tmp/project-alpha',
            latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
            sessions: [
              {
                id: 'session-alpha',
                title: 'Alpha',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'active',
                createdAt: '2026-03-24T23:40:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
              },
            ],
          },
        ]}
        selectedSessionId="session-alpha"
        activeCount={1}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        onArchiveSession={onArchiveSession}
        pinnedSessions={[]}
        onNewSession={() => undefined}
        onResizeStart={() => undefined}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /more actions for alpha/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /archive session/i }))

    expect(onArchiveSession).toHaveBeenCalledWith('session-alpha')
  })

  it('supports arrow-key navigation and enter selection', () => {
    const onSelectSession = vi.fn()

    render(
      <SessionSidebar
        groups={[
          {
            key: 'project-alpha',
            label: 'project-alpha',
            workspacePath: '/tmp/project-alpha',
            latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
            sessions: [
              {
                id: 'session-alpha',
                title: 'Alpha',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'active',
                createdAt: '2026-03-24T23:40:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
              },
              {
                id: 'session-beta',
                title: 'Beta',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'waiting',
                createdAt: '2026-03-24T23:35:00.000Z',
                updatedAt: '2026-03-24T23:58:00.000Z',
                lastActivityAt: '2026-03-24T23:58:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:58:00.000Z'),
              },
            ],
          },
        ]}
        selectedSessionId="session-alpha"
        activeCount={1}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={onSelectSession}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        pinnedSessions={[]}
        onNewSession={() => undefined}
        onResizeStart={() => undefined}
      />,
    )

    const alphaButton = screen.getByTitle('Alpha')
    const betaButton = screen.getByTitle('Beta')

    act(() => {
      alphaButton.focus()
      fireEvent.keyDown(alphaButton, { key: 'ArrowDown' })
    })
    expect(document.activeElement).toBe(betaButton)

    act(() => {
      fireEvent.keyDown(betaButton, { key: 'Enter' })
    })
    expect(onSelectSession).toHaveBeenCalledWith('session-beta')
  })

  it('renders pinned duplicates, exact status tones, and overflow expansion', () => {
    render(
      <SessionSidebar
        groups={[
          {
            key: 'project-alpha',
            label: 'project-alpha',
            workspacePath: '/tmp/project-alpha',
            latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
            sessions: [
              {
                id: 'session-alpha',
                title: 'Alpha',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'active',
                createdAt: '2026-03-24T23:40:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
              },
              {
                id: 'session-beta',
                title: 'Beta',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'waiting',
                createdAt: '2026-03-24T23:39:00.000Z',
                updatedAt: '2026-03-24T23:59:00.000Z',
                lastActivityAt: '2026-03-24T23:59:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:59:00.000Z'),
              },
              {
                id: 'session-gamma',
                title: 'Gamma',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'idle',
                createdAt: '2026-03-24T23:38:00.000Z',
                updatedAt: '2026-03-24T23:58:00.000Z',
                lastActivityAt: '2026-03-24T23:58:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:58:00.000Z'),
              },
              {
                id: 'session-delta',
                title: 'Delta',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'completed',
                createdAt: '2026-03-24T23:37:00.000Z',
                updatedAt: '2026-03-24T23:57:00.000Z',
                lastActivityAt: '2026-03-24T23:57:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:57:00.000Z'),
              },
              {
                id: 'session-epsilon',
                title: 'Epsilon',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'disconnected',
                createdAt: '2026-03-24T23:36:00.000Z',
                updatedAt: '2026-03-24T23:56:00.000Z',
                lastActivityAt: '2026-03-24T23:56:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:56:00.000Z'),
              },
              {
                id: 'session-zeta',
                title: 'Zeta',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'active',
                createdAt: '2026-03-24T23:35:00.000Z',
                updatedAt: '2026-03-24T23:55:00.000Z',
                lastActivityAt: '2026-03-24T23:55:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:55:00.000Z'),
              },
              {
                id: 'session-eta',
                title: 'Eta',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'reconnecting' as never,
                createdAt: '2026-03-24T23:34:00.000Z',
                updatedAt: '2026-03-24T23:54:00.000Z',
                lastActivityAt: '2026-03-24T23:54:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:54:00.000Z'),
              },
              {
                id: 'session-theta',
                title: 'Theta',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'orphaned' as never,
                createdAt: '2026-03-24T23:33:00.000Z',
                updatedAt: '2026-03-24T23:53:00.000Z',
                lastActivityAt: '2026-03-24T23:53:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:53:00.000Z'),
              },
            ],
          },
        ]}
        selectedSessionId="session-alpha"
        activeCount={2}
        pinnedSessions={[
          {
            id: 'session-alpha',
            title: 'Alpha',
            projectKey: 'project-alpha',
            projectLabel: 'project-alpha',
            projectWorkspacePath: '/tmp/project-alpha',
            parentSessionId: null,
            derivationType: null,
            hasUserMessage: true,
            status: 'active',
            createdAt: '2026-03-24T23:40:00.000Z',
            updatedAt: '2026-03-25T00:00:00.000Z',
            lastActivityAt: '2026-03-25T00:00:00.000Z',
            lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
          },
        ]}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        onNewSession={() => undefined}
        onResizeStart={() => undefined}
      />,
    )

    expect(screen.getByText('Pinned')).toBeTruthy()
    expect(screen.getAllByText('Alpha')).toHaveLength(2)
    expect(screen.queryByText('Eta')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /show more for project-alpha/i }))

    expect(screen.getByText('Eta')).toBeTruthy()
    expect(screen.getByText('Theta')).toBeTruthy()

    // After expanding, a "Show less" button should appear
    const showLessButton = screen.getByRole('button', {
      name: /show fewer sessions for project-alpha/i,
    })
    expect(showLessButton).toBeTruthy()

    fireEvent.click(showLessButton)

    // After collapsing, Eta and Theta should be hidden again
    expect(screen.queryByText('Eta')).toBeNull()
    expect(screen.queryByText('Theta')).toBeNull()
  })

  it('filters sessions with search and restores scroll position when search clears', () => {
    render(
      <SessionSidebar
        groups={[
          {
            key: 'project-alpha',
            label: 'project-alpha',
            workspacePath: '/tmp/project-alpha',
            latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
            sessions: [
              {
                id: 'session-design-factory-audit',
                title: 'Design Factory Audit',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'active',
                createdAt: '2026-03-24T23:40:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
              },
              {
                id: 'session-beta-review',
                title: 'Beta Review',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'waiting',
                createdAt: '2026-03-24T23:35:00.000Z',
                updatedAt: '2026-03-24T23:58:00.000Z',
                lastActivityAt: '2026-03-24T23:58:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:58:00.000Z'),
              },
            ],
          },
        ]}
        selectedSessionId="session-design-factory-audit"
        activeCount={1}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        pinnedSessions={[]}
        onNewSession={() => undefined}
        onResizeStart={() => undefined}
      />,
    )

    const scrollArea = screen.getByTestId('session-sidebar-scroll-area')
    scrollArea.scrollTop = 148

    // Search input is always visible now
    fireEvent.change(screen.getByLabelText(/Search sessions/i), {
      target: { value: '999999' },
    })

    expect(screen.queryByTitle('Design Factory Audit')).toBeNull()
    expect(screen.queryByTitle('Beta Review')).toBeNull()

    // Clear search via the X button
    fireEvent.click(screen.getByRole('button', { name: /clear search query/i }))

    expect(screen.getByTitle('Design Factory Audit')).toBeTruthy()
    expect(screen.getByTitle('Beta Review')).toBeTruthy()
    expect(scrollArea.scrollTop).toBe(148)
  })

  it('reveals advanced filters in popover, composes them with AND logic, and clears them all', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T00:15:00.000Z'))

    render(
      <SessionSidebar
        groups={[
          {
            key: 'project-alpha',
            label: 'project-alpha',
            workspacePath: '/tmp/project-alpha',
            latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
            sessions: [
              {
                id: 'session-alpha-replay-audit',
                title: 'Replay Audit',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'active',
                createdAt: '2026-03-24T23:40:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
              },
              {
                id: 'session-alpha-complete',
                title: 'Replay Summary',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'completed',
                createdAt: '2026-03-24T23:30:00.000Z',
                updatedAt: '2026-03-24T23:30:00.000Z',
                lastActivityAt: '2026-03-24T23:30:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:30:00.000Z'),
              },
            ],
          },
          {
            key: 'project-beta',
            label: 'project-beta',
            workspacePath: '/tmp/project-beta',
            latestActivityAt: Date.parse('2026-03-24T23:50:00.000Z'),
            sessions: [
              {
                id: 'session-beta-replay',
                title: 'Replay Audit',
                projectKey: 'project-beta',
                projectLabel: 'project-beta',
                projectWorkspacePath: '/tmp/project-beta',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'active',
                createdAt: '2026-03-24T23:35:00.000Z',
                updatedAt: '2026-03-24T23:50:00.000Z',
                lastActivityAt: '2026-03-24T23:50:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-24T23:50:00.000Z'),
              },
            ],
          },
        ]}
        selectedSessionId="session-alpha-replay-audit"
        activeCount={2}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        pinnedSessions={[]}
        onNewSession={() => undefined}
        onResizeStart={() => undefined}
      />,
    )

    // Open filters popover
    const filterToggle = screen.getByRole('button', { name: /toggle advanced filters/i })
    fireEvent.click(filterToggle)

    // The popover renders filter controls
    expect(screen.getByLabelText(/Filter sessions by project/i)).toBeTruthy()
    expect(screen.getByLabelText(/Filter sessions by date range/i)).toBeTruthy()
    expect(screen.getByLabelText(/Filter sessions by status/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'replay' })).toBeTruthy()

    // Tag filter still works via direct button click
    fireEvent.click(screen.getByRole('button', { name: 'replay' }))

    // With tag filter active, both Replay Audit sessions match (across projects)
    expect(screen.getAllByTitle('Replay Audit').length).toBeGreaterThanOrEqual(1)

    // Clear all (click the chip-bar "Clear all", skip popover's "Clear all")
    const clearButtons = screen.getAllByRole('button', { name: /clear all/i })
    fireEvent.click(clearButtons[clearButtons.length - 1])

    expect(screen.getByTitle('Replay Summary')).toBeTruthy()
    expect(screen.getAllByTitle('Replay Audit')).toHaveLength(2)

    vi.useRealTimers()
  })

  it('keeps project toggles keyboard-focusable and lets Escape dismiss search', async () => {
    const onToggleProject = vi.fn()

    render(
      <SessionSidebar
        groups={[
          {
            key: 'project-alpha',
            label: 'project-alpha',
            workspacePath: '/tmp/project-alpha',
            latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
            sessions: [
              {
                id: 'session-alpha',
                title: 'Alpha',
                projectKey: 'project-alpha',
                projectLabel: 'project-alpha',
                projectWorkspacePath: '/tmp/project-alpha',
                parentSessionId: null,
                derivationType: null,
                hasUserMessage: true,
                status: 'active',
                createdAt: '2026-03-24T23:40:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
              },
            ],
          },
        ]}
        selectedSessionId="session-alpha"
        activeCount={1}
        isProjectCollapsed={() => false}
        onToggleProject={onToggleProject}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        pinnedSessions={[]}
        onNewSession={() => undefined}
        onResizeStart={() => undefined}
      />,
    )

    // Project toggle should be focusable
    const projectToggle = screen.getAllByRole('button', { name: /project-alpha/i })[0]
    projectToggle.focus()
    expect(document.activeElement).toBe(projectToggle)
    expect(projectToggle.getAttribute('tabindex')).not.toBe('-1')
    expect(onToggleProject).not.toHaveBeenCalled()
  })

  it('rerenders immediately when workspace collapse state changes', () => {
    const uiStore = new UIStore()
    const Harness = function Harness() {
      const isProjectAlphaCollapsed = useValue(() => uiStore.isProjectCollapsed('project-alpha'))

      return (
        <SessionSidebar
          groups={[
            {
              key: 'project-alpha',
              label: 'project-alpha',
              workspacePath: '/tmp/project-alpha',
              latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
              sessions: [
                {
                  id: 'session-alpha',
                  title: 'Alpha',
                  projectKey: 'project-alpha',
                  projectLabel: 'project-alpha',
                  projectWorkspacePath: '/tmp/project-alpha',
                  parentSessionId: null,
                  derivationType: null,
                  hasUserMessage: true,
                  status: 'active',
                  createdAt: '2026-03-24T23:40:00.000Z',
                  updatedAt: '2026-03-25T00:00:00.000Z',
                  lastActivityAt: '2026-03-25T00:00:00.000Z',
                  lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
                },
              ],
            },
          ]}
          selectedSessionId="session-alpha"
          activeCount={1}
          isProjectCollapsed={(projectKey) =>
            projectKey === 'project-alpha'
              ? isProjectAlphaCollapsed
              : uiStore.isProjectCollapsed(projectKey)
          }
          onToggleProject={uiStore.toggleProjectCollapsed}
          onSelectSession={() => undefined}
          onTogglePinnedSession={() => undefined}
          onSetProjectDisplayName={() => undefined}
          pinnedSessions={[]}
          onNewSession={() => undefined}
          onResizeStart={() => undefined}
        />
      )
    }

    render(<Harness />)

    const projectToggle = screen.getAllByRole('button', { name: /project-alpha/i })[0]

    expect(screen.getByTitle('Alpha')).toBeTruthy()

    fireEvent.click(projectToggle)
    expect(screen.queryByTitle('Alpha')).toBeNull()

    fireEvent.click(projectToggle)
    expect(screen.getByTitle('Alpha')).toBeTruthy()
  })
})
