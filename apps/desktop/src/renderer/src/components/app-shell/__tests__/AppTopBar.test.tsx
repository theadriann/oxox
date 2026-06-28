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
})
