// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../AppShellSidebar', () => ({
  AppShellSidebar: (props: { onNewSession: () => void }) => (
    <button type="button" data-testid="sidebar" onClick={props.onNewSession}>
      Sidebar
    </button>
  ),
}))

vi.mock('../AppTopBar', () => ({
  AppTopBar: (props: {
    sessionTitle?: string
    sessionProjectLabel?: string
    isSidebarHidden?: boolean
    onToggleSidebar?: () => void
  }) => (
    <div data-testid="top-bar">
      <span>{props.sessionTitle ?? 'no-title'}</span>
      <span>{props.sessionProjectLabel ?? 'no-project'}</span>
      <span>{props.isSidebarHidden ? 'sidebar-hidden' : 'sidebar-visible'}</span>
    </div>
  ),
}))

vi.mock('../AppShellFeedbackConnected', () => ({
  AppShellFeedbackConnected: () => <div data-testid="feedback" />,
}))

vi.mock('../UpdatePromptConnected', () => ({
  UpdatePromptConnected: () => <div data-testid="update-prompt" />,
}))

vi.mock('../DetailPanelConnected', () => ({
  DetailPanelConnected: (props: { transcriptScrollSignal: number }) => (
    <div data-testid="detail-panel">{props.transcriptScrollSignal}</div>
  ),
}))

vi.mock('../AppShellContextPanel', () => ({
  AppShellContextPanel: () => <div data-testid="context-panel" />,
}))

vi.mock('../CommandPaletteConnected', () => ({
  CommandPaletteConnected: () => <div data-testid="command-palette">connected</div>,
}))

vi.mock('../../transcript/SessionComposerConnected', () => ({
  SessionComposerConnected: (props: {
    canComposeDetached: boolean
    isSubmittingDetached: boolean
  }) => (
    <div data-testid="session-composer">
      {props.canComposeDetached ? 'detached-enabled' : 'detached-disabled'}:
      {props.isSubmittingDetached ? 'submitting' : 'idle'}
    </div>
  ),
}))

vi.mock('../StatusBarConnected', () => ({
  StatusBarConnected: () => <div data-testid="status-bar" />,
}))

vi.mock('../TodoListConnected', () => ({
  TodoListConnected: () => <div data-testid="todo-list" />,
}))

import { AppShellView } from '../AppShellView'

describe('AppShellView', () => {
  it('renders the shell layout with view-model data and shows the composer when requested', () => {
    render(
      <AppShellView
        commandPalette={{
          closePalette: vi.fn(),
          commands: [],
          handleSessionSelection: vi.fn(),
          openPalette: vi.fn(),
        }}
        controller={{
          contextPanelRef: { current: null },
          contextPanelToggleButtonRef: { current: null },
          detailPanelRef: { current: null },
          handleAttachSelectedSession: vi.fn(),
          handleBrowseSessions: vi.fn(),
          newSessionForm: {
            isSubmitting: true,
            openDraft: vi.fn(),
            path: '/tmp/project-alpha',
            showForm: true,
            submitNewSession: vi.fn(),
          },
          startContextPanelResize: vi.fn(),
          startSidebarResize: vi.fn(),
          transcriptPrimaryActionRef: { current: null },
          transcriptScrollSignal: 3,
        }}
        uiState={{
          contentLayout: 'fixed',
          isContextPanelHidden: false,
          isSidebarHidden: false,
          isSettingsOpen: false,
          settingsSection: 'general',
          toggleContextPanel: vi.fn(),
          toggleSidebar: vi.fn(),
        }}
        viewModel={{
          canComposeDetached: true,
          detailViewKey: 'detail:new-session',
          sessionProjectLabel: '/tmp/project-alpha',
          sessionTitle: 'New session',
          shouldAnimate: false,
          shouldRenderComposer: true,
          sidebarErrorState: undefined,
        }}
      />,
    )

    expect(screen.getByTestId('command-palette').textContent).toContain('connected')
    expect(screen.getByTestId('top-bar').textContent).toContain('New session')
    expect(screen.getByTestId('top-bar').textContent).toContain('/tmp/project-alpha')
    expect(screen.getByTestId('top-bar').textContent).toContain('sidebar-visible')
    expect(screen.getByTestId('update-prompt')).toBeTruthy()
    expect(screen.getByTestId('detail-panel').textContent).toContain('3')
    expect(screen.getByTestId('session-composer').textContent).toContain(
      'detached-enabled:submitting',
    )
    expect(screen.getByTestId('context-panel')).toBeTruthy()
    expect(screen.getByTestId('status-bar')).toBeTruthy()
    expect(screen.getByTestId('sidebar')).toBeTruthy()
  })

  it('hides the sidebar and composer when the view model says there is no active compose surface', () => {
    render(
      <AppShellView
        commandPalette={{
          closePalette: vi.fn(),
          commands: [],
          handleSessionSelection: vi.fn(),
          openPalette: vi.fn(),
        }}
        controller={{
          contextPanelRef: { current: null },
          contextPanelToggleButtonRef: { current: null },
          detailPanelRef: { current: null },
          handleAttachSelectedSession: vi.fn(),
          handleBrowseSessions: vi.fn(),
          newSessionForm: {
            isSubmitting: false,
            openDraft: vi.fn(),
            path: '',
            showForm: false,
            submitNewSession: vi.fn(),
          },
          startContextPanelResize: vi.fn(),
          startSidebarResize: vi.fn(),
          transcriptPrimaryActionRef: { current: null },
          transcriptScrollSignal: 0,
        }}
        uiState={{
          contentLayout: 'fluid',
          isContextPanelHidden: true,
          isSidebarHidden: true,
          isSettingsOpen: false,
          settingsSection: 'general',
          toggleContextPanel: vi.fn(),
          toggleSidebar: vi.fn(),
        }}
        viewModel={{
          canComposeDetached: false,
          detailViewKey: 'detail:empty',
          sessionProjectLabel: undefined,
          sessionTitle: undefined,
          shouldAnimate: false,
          shouldRenderComposer: false,
          sidebarErrorState: undefined,
        }}
      />,
    )

    expect(screen.queryByTestId('session-composer')).toBeNull()
    expect(screen.queryByTestId('sidebar')).toBeNull()
    expect(screen.getByTestId('top-bar').textContent).toContain('sidebar-hidden')
    expect(screen.getByTestId('command-palette').textContent).toContain('connected')
  })

  it('lets the detail panel own scrolling instead of wrapping it in an outer overflow container', () => {
    const { container } = render(
      <AppShellView
        commandPalette={{
          closePalette: vi.fn(),
          commands: [],
          handleSessionSelection: vi.fn(),
          openPalette: vi.fn(),
        }}
        controller={{
          contextPanelRef: { current: null },
          contextPanelToggleButtonRef: { current: null },
          detailPanelRef: { current: null },
          handleAttachSelectedSession: vi.fn(),
          handleBrowseSessions: vi.fn(),
          newSessionForm: {
            isSubmitting: false,
            openDraft: vi.fn(),
            path: '',
            showForm: false,
            submitNewSession: vi.fn(),
          },
          startContextPanelResize: vi.fn(),
          startSidebarResize: vi.fn(),
          transcriptPrimaryActionRef: { current: null },
          transcriptScrollSignal: 1,
        }}
        uiState={{
          contentLayout: 'fixed',
          isContextPanelHidden: false,
          isSidebarHidden: false,
          isSettingsOpen: false,
          settingsSection: 'general',
          toggleContextPanel: vi.fn(),
          toggleSidebar: vi.fn(),
        }}
        viewModel={{
          canComposeDetached: false,
          detailViewKey: 'detail:session',
          sessionProjectLabel: '/tmp/project-alpha',
          sessionTitle: 'Session',
          shouldAnimate: false,
          shouldRenderComposer: false,
          sidebarErrorState: undefined,
        }}
      />,
    )

    const detailPanel = screen.getByTestId('detail-panel')
    const outerScrollHost = detailPanel.closest('.overflow-y-auto')
    expect(outerScrollHost?.getAttribute('aria-label')).not.toBe('Session detail panel')

    const detailMotionHost = detailPanel.closest('.gap-1\\.5')
    expect(detailMotionHost?.className).toContain('flex-1')
    expect(detailMotionHost?.className).toContain('min-h-0')

    expect(container.querySelector('[aria-label="Session detail panel"]')?.className).toContain(
      'overflow-hidden',
    )
  })
})
