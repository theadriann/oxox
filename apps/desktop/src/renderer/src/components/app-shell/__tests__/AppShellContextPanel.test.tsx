// @vitest-environment jsdom

import { observable } from '@legendapp/state'
import { fireEvent, render, screen } from '@testing-library/react'
import type { HTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContextPanelMode } from '../../../state/ui/ui.model'

const testState = vi.hoisted(() => ({
  uiStore: null as {
    setContextPanelMode: ReturnType<typeof vi.fn>
    state$: ReturnType<
      typeof observable<{
        contextPanelMode: ContextPanelMode
        isContextPanelHidden: boolean
      }>
    >
    toggleContextPanel: ReturnType<typeof vi.fn>
    toggleContextPanelMode: ReturnType<typeof vi.fn>
  } | null,
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

vi.mock('../../../state/root/store-provider', () => ({
  useUIStore: () => testState.uiStore,
}))

vi.mock('../AppShellControllerContext', () => ({
  useAppShellControllerContext: () => ({
    contextPanelRef: { current: null },
    handleBrowseSessions: vi.fn(),
    startContextPanelResize: vi.fn(),
  }),
}))

vi.mock('../../context-panel/ContextPanelConnected', () => ({
  ContextPanelConnected: () => <div data-testid="session-details-panel" />,
}))

vi.mock('../../context-panel/GitDiffPanelConnected', () => ({
  GitDiffPanelConnected: () => <div data-testid="git-diff-panel" />,
}))

import { AppShellContextPanel } from '../AppShellContextPanel'

describe('AppShellContextPanel', () => {
  beforeEach(() => {
    const state$ = observable({
      contextPanelMode: 'session-details' as ContextPanelMode,
      isContextPanelHidden: false,
    })

    testState.uiStore = {
      setContextPanelMode: vi.fn((mode: ContextPanelMode) => {
        state$.contextPanelMode.set(mode)
        state$.isContextPanelHidden.set(false)
      }),
      state$,
      toggleContextPanel: vi.fn(() => {
        state$.isContextPanelHidden.set((isHidden) => !isHidden)
      }),
      toggleContextPanelMode: vi.fn(),
    }
  })

  it('renders mobile tabs that switch the sheet content', () => {
    render(<AppShellContextPanel prefersReducedMotion={false} shouldAnimate={true} />)

    expect(screen.getByTestId('session-details-panel')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^show git diff$/i }))

    expect(testState.uiStore?.setContextPanelMode).toHaveBeenCalledWith('git-diff')
    expect(screen.getByTestId('git-diff-panel')).toBeTruthy()
  })
})
