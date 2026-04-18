// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlatformApiClient } from '../../../platform/apiClient'
import { RootStore } from '../../../stores/RootStore'
import { StoreProvider } from '../../../stores/StoreProvider'

const renderState = vi.hoisted(() => ({
  count: 0,
}))

vi.mock('framer-motion', () => ({
  useReducedMotion: () => false,
}))

vi.mock('../useAppShellController', () => ({
  useAppShellController: () => ({
    commandPalette: {
      closePalette: vi.fn(),
      getCommands: () => [],
      handleSessionSelection: vi.fn(),
      openPalette: vi.fn(),
    },
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
  }),
}))

vi.mock('../useAppShellViewModel', () => ({
  useAppShellViewModel: () => ({
    canComposeDetached: false,
    detailViewKey: 'detail:empty',
    sessionProjectLabel: undefined,
    sessionTitle: undefined,
    shouldAnimate: false,
    shouldRenderComposer: false,
    sidebarErrorState: undefined,
  }),
}))

vi.mock('../AppShellView', () => ({
  AppShellView: () => {
    renderState.count += 1
    return <div data-testid="app-shell-view" />
  },
}))

import { AppShell } from '../AppShell'

describe('AppShell', () => {
  beforeEach(() => {
    renderState.count = 0
  })

  it('does not rerender the full shell view when composer feedback changes', () => {
    const rootStore = new RootStore(createPlatformApiClient({}))

    render(
      <StoreProvider rootStore={rootStore}>
        <AppShell />
      </StoreProvider>,
    )

    expect(renderState.count).toBe(1)

    act(() => {
      rootStore.composerStore.feedbackStore.showFeedback('Saved', 'success')
    })

    expect(renderState.count).toBe(1)
  })

  it('does not rerender the full shell view when the session list changes', () => {
    const rootStore = new RootStore(createPlatformApiClient({}))

    render(
      <StoreProvider rootStore={rootStore}>
        <AppShell />
      </StoreProvider>,
    )

    expect(renderState.count).toBe(1)

    act(() => {
      rootStore.sessionStore.hydrateSessions([
        {
          id: 'session-1',
          projectId: 'project-alpha',
          projectWorkspacePath: '/tmp/project-alpha',
          projectDisplayName: null,
          parentSessionId: null,
          derivationType: null,
          title: 'Alpha session',
          status: 'completed',
          transport: 'artifacts',
          createdAt: '2026-04-04T00:00:00.000Z',
          lastActivityAt: '2026-04-04T00:05:00.000Z',
          updatedAt: '2026-04-04T00:05:00.000Z',
        },
      ])
    })

    expect(renderState.count).toBe(1)
  })

  it('does not rerender the full shell view when transport status changes', () => {
    const rootStore = new RootStore(createPlatformApiClient({}))

    render(
      <StoreProvider rootStore={rootStore}>
        <AppShell />
      </StoreProvider>,
    )

    expect(renderState.count).toBe(1)

    act(() => {
      rootStore.transportStore.status = 'connected'
    })

    expect(renderState.count).toBe(1)
  })
})
