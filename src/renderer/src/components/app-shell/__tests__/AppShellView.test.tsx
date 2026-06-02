// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../state/root/store-provider', async () => {
  const { createMemoryPersistencePort } = await vi.importActual<
    typeof import('../../../platform/persistence')
  >('../../../platform/persistence')
  const { UIStore } = await vi.importActual<typeof import('../../../state/ui/ui.model')>(
    '../../../state/ui/ui.model',
  )

  return {
    useUIStore: () => new UIStore(createMemoryPersistencePort()),
  }
})

vi.mock('../AppShellTopBarConnected', () => ({
  AppShellTopBarConnected: () => <div data-testid="top-bar">top-bar</div>,
}))

vi.mock('../AppShellSidebarRegion', () => ({
  AppShellSidebarRegion: () => <div data-testid="sidebar-region">sidebar</div>,
}))

vi.mock('../CommandPaletteConnected', () => ({
  CommandPaletteConnected: () => <div data-testid="command-palette">connected</div>,
}))

vi.mock('../AppShellMainContent', () => ({
  AppShellMainContent: () => <div data-testid="main-content">main</div>,
}))

vi.mock('../StatusBarConnected', () => ({
  StatusBarConnected: () => <div data-testid="status-bar" />,
}))

import { AppShellView } from '../AppShellView'

describe('AppShellView', () => {
  it('renders shell chrome through connected regions instead of prop-drilled view bags', () => {
    render(<AppShellView prefersReducedMotion={false} />)

    expect(screen.getByTestId('command-palette').textContent).toContain('connected')
    expect(screen.getByTestId('top-bar').textContent).toContain('top-bar')
    expect(screen.getByTestId('sidebar-region').textContent).toContain('sidebar')
    expect(screen.getByTestId('main-content').textContent).toContain('main')
    expect(screen.getByTestId('status-bar')).toBeTruthy()
  })

  it('tracks reduced motion mode on the root container', () => {
    const { container } = render(<AppShellView prefersReducedMotion />)

    expect(container.firstChild?.getAttribute('data-motion-mode')).toBe('reduced')
  })
})
