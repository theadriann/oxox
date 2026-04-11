import { describe, expect, it, vi } from 'vitest'

import { startSessionNotificationController } from '../native/sessionNotifications'

function createSessionSummary(
  overrides: {
    sessionId?: string
    title?: string
    pendingPermissions?: Array<{ requestId: string; reason: string | null }>
    pendingAskUser?: Array<{ requestId: string; prompt: string | null }>
    completionCount?: number
  } = {},
) {
  return {
    sessionId: overrides.sessionId ?? 'session-live-1',
    title: overrides.title ?? 'Background session',
    pendingPermissions: overrides.pendingPermissions ?? [],
    pendingAskUser: overrides.pendingAskUser ?? [],
    completionCount: overrides.completionCount ?? 0,
    ...overrides,
  }
}

function createNotificationDouble(options: { title: string; body: string }) {
  const listeners = new Map<string, () => void>()

  return {
    options,
    show: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener)
      return undefined
    }),
    click: () => listeners.get('click')?.(),
  }
}

describe('startSessionNotificationController', () => {
  it('shows background request notifications, updates the tray badge count, and deep-links on click', () => {
    const tray = {
      setTitle: vi.fn(),
      setToolTip: vi.fn(),
    }
    const notifications: Array<ReturnType<typeof createNotificationDouble>> = []
    const onNavigateToSession = vi.fn()
    let sessionSummaries = [
      createSessionSummary({
        pendingPermissions: [
          {
            requestId: 'permission-1',
            reason: 'Approve the release cutover',
          },
        ],
        pendingAskUser: [
          {
            requestId: 'ask-user-1',
            prompt: 'Which workspace should OXOX use next?',
          },
        ],
      }),
    ]

    const controller = startSessionNotificationController({
      appName: 'OXOX',
      getSessionSummaries: () => sessionSummaries,
      getTray: () => tray,
      isAppInBackground: () => true,
      onNavigateToSession,
      notificationFactory: (options) => {
        const notification = createNotificationDouble(options)
        notifications.push(notification)
        return notification
      },
    })

    expect(tray.setTitle).toHaveBeenLastCalledWith('2')
    expect(tray.setToolTip).toHaveBeenLastCalledWith('OXOX · 2 pending actions')
    expect(notifications).toHaveLength(2)
    expect(notifications[0]?.options.title).toMatch(/Needs permission/i)
    expect(notifications[1]?.options.title).toMatch(/Needs your input/i)

    notifications[0]?.click()
    expect(onNavigateToSession).toHaveBeenCalledWith('session-live-1')

    sessionSummaries = [createSessionSummary()]

    controller.sync()

    expect(tray.setTitle).toHaveBeenLastCalledWith('')
    expect(tray.setToolTip).toHaveBeenLastCalledWith('OXOX')

    controller.stop()
  })

  it('notifies exactly once when a background session completes', () => {
    const notifications: Array<ReturnType<typeof createNotificationDouble>> = []
    let sessionSummaries = [createSessionSummary()]

    const controller = startSessionNotificationController({
      appName: 'OXOX',
      getSessionSummaries: () => sessionSummaries,
      getTray: () => null,
      isAppInBackground: () => true,
      onNavigateToSession: vi.fn(),
      notificationFactory: (options) => {
        const notification = createNotificationDouble(options)
        notifications.push(notification)
        return notification
      },
    })

    expect(notifications).toHaveLength(0)

    sessionSummaries = [createSessionSummary({ completionCount: 1 })]

    controller.sync()
    controller.sync()

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.options.title).toMatch(/Completed/i)
    expect(notifications[0]?.options.body).toMatch(/Background session/i)

    controller.stop()
  })

  it('suppresses native notifications while the app is foregrounded', () => {
    const notificationFactory = vi.fn()

    startSessionNotificationController({
      appName: 'OXOX',
      getSessionSummaries: () => [
        createSessionSummary({
          pendingPermissions: [
            {
              requestId: 'permission-foreground',
              reason: 'Open package.json',
            },
          ],
        }),
      ],
      getTray: () => null,
      isAppInBackground: () => false,
      onNavigateToSession: vi.fn(),
      notificationFactory,
    }).stop()

    expect(notificationFactory).not.toHaveBeenCalled()
  })
})
