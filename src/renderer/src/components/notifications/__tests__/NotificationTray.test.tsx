// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NotificationTray } from '../NotificationTray'
import { resetNotificationCenterForTesting, showAppNotification } from '../notificationCenter'

const toastMocks = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: toastMocks,
}))

describe('NotificationTray', () => {
  afterEach(() => {
    cleanup()
    resetNotificationCenterForTesting()
    vi.clearAllMocks()
  })

  it('renders a bell counter that minimizes and restores notifications', () => {
    act(() => {
      showAppNotification({
        id: 'runtime-warning-1',
        kind: 'warning',
        title: 'Connection interrupted',
        description: 'Reconnecting… partial response preserved.',
      })
    })

    render(<NotificationTray />)

    const minimizeButton = screen.getByRole('button', {
      name: /Notifications, 1 notification\. Click to minimize/i,
    })

    expect(screen.getByText('1')).toBeTruthy()

    act(() => {
      fireEvent.click(minimizeButton)
    })

    expect(toastMocks.dismiss).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', {
        name: /Notifications minimized, 1 notification\. Click to show/i,
      }),
    ).toBeTruthy()

    act(() => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /Notifications minimized, 1 notification\. Click to show/i,
        }),
      )
    })

    expect(toastMocks.warning).toHaveBeenCalledWith(
      'Connection interrupted',
      expect.objectContaining({
        description: 'Reconnecting… partial response preserved.',
      }),
    )
  })
})
