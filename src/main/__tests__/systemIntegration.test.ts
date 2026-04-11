import { describe, expect, it, vi } from 'vitest'

import { installSystemIntegration } from '../native/systemIntegration'

describe('installSystemIntegration', () => {
  it('installs app name, dock icon, menu, tray, and session notifications, then cleans them up', () => {
    const tray = {
      destroy: vi.fn(),
    }
    const notificationController = {
      stop: vi.fn(),
    }
    const listLiveSessionNotificationSummaries = vi
      .fn()
      .mockReturnValue([{ sessionId: 'session-1' }])
    const setAppName = vi.fn()
    const createAppIcon = vi.fn().mockReturnValue('icon')
    const setDockIcon = vi.fn()
    const installMacApplicationMenu = vi.fn()
    const createSystemTray = vi.fn().mockReturnValue(tray)
    const startSessionNotificationController = vi.fn().mockReturnValue(notificationController)
    const onOpenNewWindow = vi.fn()
    const onShowWindow = vi.fn()
    const onQuit = vi.fn()
    const onNavigateToSession = vi.fn()
    const isAppInBackground = vi.fn().mockReturnValue(true)

    const cleanup = installSystemIntegration({
      appName: 'OXOX',
      foundationService: {
        listLiveSessionNotificationSummaries,
      },
      platform: 'darwin',
      setAppName,
      createAppIcon,
      setDockIcon,
      installMacApplicationMenu,
      createSystemTray,
      startSessionNotificationController,
      isAppInBackground,
      onOpenNewWindow,
      onShowWindow,
      onQuit,
      onNavigateToSession,
    })

    expect(setAppName).toHaveBeenCalledWith('OXOX')
    expect(createAppIcon).toHaveBeenCalledTimes(1)
    expect(setDockIcon).toHaveBeenCalledWith('icon')
    expect(installMacApplicationMenu).toHaveBeenCalledWith('OXOX', {
      onOpenNewWindow,
    })
    expect(createSystemTray).toHaveBeenCalledWith({
      appName: 'OXOX',
      onQuit,
      onShow: onShowWindow,
    })
    expect(startSessionNotificationController).toHaveBeenCalledTimes(1)

    const notificationOptions = startSessionNotificationController.mock.calls[0]?.[0]

    expect(notificationOptions.appName).toBe('OXOX')
    expect(notificationOptions.getSessionSummaries()).toEqual([{ sessionId: 'session-1' }])
    expect(notificationOptions.getTray()).toBe(tray)
    expect(notificationOptions.isAppInBackground()).toBe(true)
    notificationOptions.onNavigateToSession('session-2')
    expect(onNavigateToSession).toHaveBeenCalledWith('session-2')

    cleanup()

    expect(notificationController.stop).toHaveBeenCalledTimes(1)
    expect(tray.destroy).toHaveBeenCalledTimes(1)
  })

  it('skips dock icon installation outside macOS', () => {
    const setDockIcon = vi.fn()

    installSystemIntegration({
      appName: 'OXOX',
      foundationService: {
        listLiveSessionNotificationSummaries: vi.fn().mockReturnValue([]),
      },
      platform: 'linux',
      setAppName: vi.fn(),
      createAppIcon: vi.fn(),
      setDockIcon,
      installMacApplicationMenu: vi.fn(),
      createSystemTray: vi.fn().mockReturnValue({
        destroy: vi.fn(),
      }),
      startSessionNotificationController: vi.fn().mockReturnValue({
        stop: vi.fn(),
      }),
      isAppInBackground: vi.fn().mockReturnValue(false),
      onOpenNewWindow: vi.fn(),
      onShowWindow: vi.fn(),
      onQuit: vi.fn(),
      onNavigateToSession: vi.fn(),
    })

    expect(setDockIcon).not.toHaveBeenCalled()
  })
})
