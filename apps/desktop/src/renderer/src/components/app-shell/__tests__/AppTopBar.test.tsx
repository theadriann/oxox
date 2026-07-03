// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppTopBar } from '../AppTopBar'

describe('AppTopBar', () => {
  it('opens the full-page search surface from the topbar action', () => {
    const onOpenSearch = vi.fn()

    render(
      <AppTopBar sessionTitle="Active session" isSearchOpen={false} onOpenSearch={onOpenSearch} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /open full-page search/i }))

    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it('calls the same search action when search is already open so callers can toggle it closed', () => {
    const onOpenSearch = vi.fn()

    render(<AppTopBar sessionTitle="Search" isSearchOpen onOpenSearch={onOpenSearch} />)

    fireEvent.click(screen.getByRole('button', { name: /close session search/i }))

    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it('exposes a mobile new-session action', () => {
    const onNewSession = vi.fn()

    render(<AppTopBar sessionTitle="Active session" onNewSession={onNewSession} />)

    fireEvent.click(screen.getByRole('button', { name: /create new session/i }))

    expect(onNewSession).toHaveBeenCalledTimes(1)
  })
})
