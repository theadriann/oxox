// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Toaster } from '../sonner'

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark' }),
}))

vi.mock('sonner', () => ({
  Toaster: ({
    closeButton,
    closeButtonAriaLabel,
    position,
    style,
    visibleToasts,
  }: {
    closeButton?: boolean
    closeButtonAriaLabel?: string
    position?: string
    style?: React.CSSProperties
    visibleToasts?: number
  }) => (
    <div
      data-close-button={closeButton ? 'true' : 'false'}
      data-close-label={closeButtonAriaLabel}
      data-position={position}
      data-testid="sonner-toaster"
      data-visible-toasts={visibleToasts}
      style={style}
    />
  ),
}))

describe('Toaster', () => {
  it('uses OXOX theme tokens for an opaque toast surface', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: '',
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    })

    render(<Toaster />)

    const toasterStyle = screen.getByTestId('sonner-toaster').getAttribute('style')

    expect(toasterStyle).toContain('--normal-bg: var(--fd-elevated)')
    expect(toasterStyle).toContain('--normal-text: var(--fd-text-primary)')
    expect(toasterStyle).toContain('--normal-border: var(--fd-border-strong)')
  })

  it('keeps toasts bottom-right and individually dismissible', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: '',
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    })

    render(<Toaster />)

    const toaster = screen.getByTestId('sonner-toaster')

    expect(toaster.getAttribute('data-position')).toBe('bottom-right')
    expect(toaster.getAttribute('data-close-button')).toBe('true')
    expect(toaster.getAttribute('data-close-label')).toBe('Dismiss notification')
    expect(toaster.getAttribute('data-visible-toasts')).toBe('3')
  })
})
