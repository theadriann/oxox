// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RightContextRail } from '../RightContextRail'

describe('RightContextRail', () => {
  it('renders mutually exclusive panel toggles', () => {
    const onTogglePanel = vi.fn()

    render(
      <RightContextRail
        activeMode="session-details"
        isPanelHidden={false}
        onTogglePanel={onTogglePanel}
      />,
    )

    expect(
      screen
        .getByRole('button', { name: 'Toggle session details panel' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByRole('button', { name: 'Toggle git diff panel' }).getAttribute('aria-pressed'),
    ).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Toggle git diff panel' }))

    expect(onTogglePanel).toHaveBeenCalledWith('git-diff')
  })
})
