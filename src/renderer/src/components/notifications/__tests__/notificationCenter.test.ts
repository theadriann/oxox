import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getNotificationCenterSnapshot,
  minimizeNotifications,
  resetNotificationCenterForTesting,
  restoreNotifications,
  showAppNotification,
} from '../notificationCenter'

const toastMocks = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: toastMocks,
}))

describe('notificationCenter', () => {
  afterEach(() => {
    resetNotificationCenterForTesting()
    vi.clearAllMocks()
  })

  it('records notifications and shows toasts by default', () => {
    showAppNotification({
      id: 'runtime-warning-1',
      kind: 'warning',
      title: 'Connection interrupted',
      description: 'Reconnecting… partial response preserved.',
    })

    expect(getNotificationCenterSnapshot()).toMatchObject({
      count: 1,
      minimized: false,
    })
    expect(toastMocks.warning).toHaveBeenCalledWith(
      'Connection interrupted',
      expect.objectContaining({
        description: 'Reconnecting… partial response preserved.',
        id: 'runtime-warning-1',
      }),
    )
  })

  it('minimizes visible toasts and restores recorded notifications on demand', () => {
    showAppNotification({
      id: 'runtime-warning-1',
      kind: 'warning',
      title: 'Connection interrupted',
      description: 'Reconnecting… partial response preserved.',
    })

    minimizeNotifications()

    showAppNotification({
      id: 'runtime-error-1',
      kind: 'error',
      title: 'Turn failed',
      description: '403 Forbidden',
    })

    expect(toastMocks.dismiss).toHaveBeenCalledTimes(1)
    expect(getNotificationCenterSnapshot()).toMatchObject({
      count: 2,
      minimized: true,
    })
    expect(toastMocks.error).not.toHaveBeenCalled()

    restoreNotifications()

    expect(getNotificationCenterSnapshot()).toMatchObject({
      count: 2,
      minimized: false,
    })
    expect(toastMocks.error).toHaveBeenCalledWith(
      'Turn failed',
      expect.objectContaining({
        description: '403 Forbidden',
        id: 'runtime-error-1',
      }),
    )
  })
})
