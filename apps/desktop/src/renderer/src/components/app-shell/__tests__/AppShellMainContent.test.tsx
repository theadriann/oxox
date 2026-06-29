// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import type { HTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UIStore } from '../../../state/ui/ui.model'

const testState = vi.hoisted(() => ({
  uiStore: null as UIStore | null,
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => {
      const domProps = stripMotionProps(props)
      return <div {...domProps}>{children}</div>
    },
    section: ({ children, ...props }: HTMLAttributes<HTMLElement>) => {
      const domProps = stripMotionProps(props)
      return <section {...domProps}>{children}</section>
    },
  },
}))

function stripMotionProps<TProps extends Record<string, unknown>>(props: TProps) {
  const {
    animate: _animate,
    exit: _exit,
    initial: _initial,
    layout: _layout,
    transition: _transition,
    variants: _variants,
    ...domProps
  } = props

  return domProps
}

vi.mock('../../../state/root/store-provider', async () => {
  const { createMemoryPersistencePort } = await vi.importActual<
    typeof import('../../../platform/persistence')
  >('../../../platform/persistence')
  const { UIStore } = await vi.importActual<typeof import('../../../state/ui/ui.model')>(
    '../../../state/ui/ui.model',
  )

  testState.uiStore = new UIStore(createMemoryPersistencePort())

  return {
    useFoundationStore: () => ({}),
    useLiveSessionStore: () => ({}),
    useSessionStore: () => ({}),
    useUIStore: () => testState.uiStore,
  }
})

vi.mock('../AppShellControllerContext', () => ({
  useAppShellControllerContext: () => ({
    detailPanelRef: { current: null },
    newSessionForm: { showForm: false },
  }),
}))

vi.mock('../useAppShellViewModel', () => ({
  useAppShellViewModel: () => ({
    canComposeDetached: true,
    detailViewKey: 'detail:test',
    shouldAnimate: false,
    shouldRenderComposer: true,
  }),
}))

vi.mock('../../search/FullPageSearchConnected', () => ({
  FullPageSearchConnected: () => <div data-testid="search" />,
}))

vi.mock('../../settings/SettingsPanel', () => ({
  SettingsPanel: () => <div data-testid="settings" />,
}))

vi.mock('../../transcript/SessionComposerConnected', () => ({
  SessionComposerConnected: () => <div data-testid="composer" />,
}))

vi.mock('../AppShellContextPanel', () => ({
  AppShellContextPanel: () => <aside data-testid="context-space" />,
}))

vi.mock('../AppShellFeedbackConnected', () => ({
  AppShellFeedbackConnected: () => <div data-testid="feedback" />,
}))

vi.mock('../DetailPanelConnected', () => ({
  DetailPanelConnected: ({ transcriptBottomInsetPx }: { transcriptBottomInsetPx: number }) => (
    <div data-testid="detail-panel" data-bottom-inset={transcriptBottomInsetPx} />
  ),
}))

vi.mock('../TodoListConnected', () => ({
  TodoListConnected: () => <div data-testid="todo-list" />,
}))

vi.mock('../UpdatePromptConnected', () => ({
  UpdatePromptConnected: () => <div data-testid="update-prompt" />,
}))

import { AppShellMainContent } from '../AppShellMainContent'

describe('AppShellMainContent', () => {
  beforeEach(() => {
    testState.uiStore?.setContentLayout('fixed')
  })

  it('separates the middle scroll column from sidebars and constrains only inner content', () => {
    const { container } = render(<AppShellMainContent prefersReducedMotion={false} />)
    const detailSection = screen.getByRole('region', { name: 'Session detail panel' })
    const detailViewport = detailSection.firstElementChild
    const composerContainer = screen.getByTestId('composer').closest('.mx-auto')
    const composerOverlay = composerContainer?.parentElement
    const composerVeil = screen.getByTestId('composer-bottom-veil')
    const detailPanel = screen.getByTestId('detail-panel')

    expect(container.querySelector('.oxox-content-area--with-context')).toBeTruthy()
    expect(screen.getByTestId('context-space')).toBeTruthy()
    expect(detailViewport?.className).toContain('overflow-hidden')
    expect(detailViewport?.className).toContain('absolute')
    expect(detailViewport?.className).not.toContain('px-4')
    expect(composerOverlay?.className).toContain('absolute')
    expect(composerOverlay?.className).toContain('bottom-0')
    expect(composerContainer?.className).toContain('px-4')
    expect(composerContainer?.className).toContain('max-w-5xl')
    expect(composerVeil.className).toContain('px-4')
    expect(composerVeil.className).toContain('max-w-5xl')
    expect(composerVeil.firstElementChild?.className).toContain('linear-gradient')
    expect(composerVeil.firstElementChild?.className).toContain('-mx-1')
    expect(composerVeil.firstElementChild?.className).toContain('rounded-xl')
    expect(composerOverlay?.querySelector('.bg-fd-canvas')).toBeTruthy()
    expect(detailPanel.dataset.bottomInset).toBe('28')
  })
})
