// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import type { HTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlatformApiClient } from '../../../platform/apiClient'
import { RootStore } from '../../../state/root/root.model'
import { StoreProvider } from '../../../state/root/store-provider'

const controllerState = vi.hoisted(() => ({
  openDraft: vi.fn(),
  startSidebarResize: vi.fn(),
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => {
      const {
        animate: _animate,
        exit: _exit,
        initial: _initial,
        layout: _layout,
        variants: _variants,
        ...domProps
      } = props

      return <div {...domProps}>{children}</div>
    },
  },
}))

vi.mock('../AppShellControllerContext', () => ({
  useAppShellControllerContext: () => ({
    newSessionForm: {
      openDraft: controllerState.openDraft,
      path: '',
      showForm: false,
    },
    startSidebarResize: controllerState.startSidebarResize,
  }),
}))

vi.mock('../useAppShellViewModel', () => ({
  useAppShellViewModel: () => ({
    sidebarErrorState: undefined,
  }),
}))

vi.mock('../../sidebar/SessionSidebarConnected', () => ({
  SessionSidebarConnected: ({
    onNewSession,
  }: {
    onNewSession: (workspacePath?: string, folderId?: string | null) => void
  }) => (
    <button type="button" onClick={() => onNewSession('/tmp/project-alpha', undefined)}>
      Create session in project-alpha
    </button>
  ),
}))

import { AppShellSidebar } from '../AppShellSidebar'

describe('AppShellSidebar', () => {
  beforeEach(() => {
    controllerState.openDraft.mockReset()
    controllerState.startSidebarResize.mockReset()
  })

  it('forwards the project workspace path from sidebar project new-session actions', () => {
    const rootStore = new RootStore(createPlatformApiClient({}))
    rootStore.sessionStore.hydrateSessions([
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        derivationType: null,
        title: 'Alpha',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-04-04T00:00:00.000Z',
        lastActivityAt: '2026-04-04T00:05:00.000Z',
        updatedAt: '2026-04-04T00:05:00.000Z',
      },
    ])

    render(
      <StoreProvider rootStore={rootStore}>
        <AppShellSidebar prefersReducedMotion={false} shouldAnimate={false} />
      </StoreProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /create session in project-alpha/i }))

    expect(controllerState.openDraft).toHaveBeenCalledWith('/tmp/project-alpha', undefined)
  })
})
