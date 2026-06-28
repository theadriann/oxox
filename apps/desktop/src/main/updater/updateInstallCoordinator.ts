import type { AppUpdateState } from '../../shared/ipc/contracts'

interface AppUpdaterForInstall {
  getState: () => AppUpdateState
  checkForUpdates: () => Promise<AppUpdateState>
  installDownloadedUpdate: () => void
}

interface CreateUpdateInstallCoordinatorOptions {
  updater: AppUpdaterForInstall
  requestQuit: (finalize: () => void) => boolean
}

export interface AppUpdateIpcController {
  getState: () => AppUpdateState
  checkForUpdates: () => Promise<AppUpdateState>
  installUpdate: () => void
}

export function createUpdateInstallCoordinator({
  updater,
  requestQuit,
}: CreateUpdateInstallCoordinatorOptions): AppUpdateIpcController {
  return {
    getState: () => updater.getState(),
    checkForUpdates: () => updater.checkForUpdates(),
    installUpdate: () => {
      if (!updater.getState().canInstall) {
        return
      }

      requestQuit(() => {
        updater.installDownloadedUpdate()
      })
    },
  }
}
