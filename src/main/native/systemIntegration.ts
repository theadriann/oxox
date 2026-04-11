import type { Tray } from 'electron'

import type { FoundationService } from '../integration/foundationService'

import { createAppIcon } from './appIcon'
import { installMacApplicationMenu } from './menu'
import {
  type SessionNotificationController,
  startSessionNotificationController,
} from './sessionNotifications'
import { createSystemTray } from './tray'

type TrayLike = Pick<Tray, 'destroy' | 'setTitle' | 'setToolTip'>
type SessionNotificationControllerLike = Pick<SessionNotificationController, 'stop'>

interface InstallSystemIntegrationOptions {
  appName: string
  foundationService: Pick<FoundationService, 'listLiveSessionSnapshots'>
  platform: NodeJS.Platform | string
  setAppName: (name: string) => void
  createAppIcon?: () => unknown
  setDockIcon?: (icon: unknown) => void
  installMacApplicationMenu?: (
    appName: string,
    options: {
      onOpenNewWindow: () => void
    },
  ) => void
  createSystemTray?: (options: {
    appName: string
    onQuit: () => void
    onShow: () => void
  }) => TrayLike
  startSessionNotificationController?: (options: {
    appName: string
    getSessionSummaries: () => ReturnType<FoundationService['listLiveSessionNotificationSummaries']>
    getTray: () => TrayLike | null
    isAppInBackground: () => boolean
    onNavigateToSession: (sessionId: string) => void
  }) => SessionNotificationControllerLike
  isAppInBackground: () => boolean
  onOpenNewWindow: () => void
  onShowWindow: () => void
  onQuit: () => void
  onNavigateToSession: (sessionId: string) => void
}

export function installSystemIntegration({
  appName,
  foundationService,
  platform,
  setAppName,
  createAppIcon: buildAppIcon = createAppIcon,
  setDockIcon,
  installMacApplicationMenu: installMenu = installMacApplicationMenu,
  createSystemTray: buildSystemTray = createSystemTray,
  startSessionNotificationController: startNotifications = startSessionNotificationController,
  isAppInBackground,
  onOpenNewWindow,
  onShowWindow,
  onQuit,
  onNavigateToSession,
}: InstallSystemIntegrationOptions): () => void {
  setAppName(appName)

  if (platform === 'darwin') {
    setDockIcon?.(buildAppIcon())
  }

  installMenu(appName, {
    onOpenNewWindow,
  })

  const tray = buildSystemTray({
    appName,
    onQuit,
    onShow: onShowWindow,
  })
  const notificationController = startNotifications({
    appName,
    getSessionSummaries: () => foundationService.listLiveSessionNotificationSummaries(),
    getTray: () => tray,
    isAppInBackground,
    onNavigateToSession,
  })

  return () => {
    notificationController.stop()
    tray.destroy()
  }
}
