import { autoUpdater } from 'electron-updater'

import type { AppUpdateState } from '../../shared/ipc/contracts'

interface UpdateVersionInfo {
  version?: string | null
}

interface DownloadProgressInfo {
  percent?: number | null
}

interface AutoUpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void
  checkForUpdates: () => Promise<unknown>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
}

export interface AppUpdater {
  start: () => Promise<AppUpdateState>
  getState: () => AppUpdateState
  checkForUpdates: () => Promise<AppUpdateState>
  installUpdate: () => void
  dispose: () => void
}

interface CreateAppUpdaterOptions {
  appVersion: string
  autoUpdater?: AutoUpdaterLike
  isPackaged: boolean
  onStateChanged?: (state: AppUpdateState) => void
}

const CHECKING_MESSAGE = 'Checking for updates…'
const DOWNLOADING_MESSAGE = 'Downloading update…'
const READY_MESSAGE = 'Restart to install update.'
const UP_TO_DATE_MESSAGE = 'App is up to date.'
const UNSUPPORTED_MESSAGE = 'Automatic updates are only available in packaged builds.'

export function createAppUpdater({
  appVersion,
  autoUpdater: providedAutoUpdater = autoUpdater,
  isPackaged,
  onStateChanged,
}: CreateAppUpdaterOptions): AppUpdater {
  let state: AppUpdateState = {
    phase: 'idle',
    currentVersion: appVersion,
    availableVersion: null,
    downloadedVersion: null,
    progressPercent: null,
    message: null,
    canInstall: false,
  }
  let listenersRegistered = false

  const listeners = {
    checkingForUpdate: () => {
      updateState({
        phase: 'checking',
        availableVersion: null,
        downloadedVersion: null,
        progressPercent: null,
        message: CHECKING_MESSAGE,
        canInstall: false,
      })
    },
    updateAvailable: (info: UpdateVersionInfo) => {
      updateState({
        phase: 'downloading',
        availableVersion: normalizeVersion(info.version),
        downloadedVersion: null,
        progressPercent: null,
        message: DOWNLOADING_MESSAGE,
        canInstall: false,
      })
    },
    updateNotAvailable: () => {
      updateState({
        phase: 'not-available',
        availableVersion: null,
        downloadedVersion: null,
        progressPercent: null,
        message: UP_TO_DATE_MESSAGE,
        canInstall: false,
      })
    },
    downloadProgress: (progress: DownloadProgressInfo) => {
      updateState({
        phase: 'downloading',
        progressPercent: normalizePercent(progress.percent),
        message: DOWNLOADING_MESSAGE,
        canInstall: false,
      })
    },
    updateDownloaded: (info: UpdateVersionInfo) => {
      const version = normalizeVersion(info.version)

      updateState({
        phase: 'downloaded',
        availableVersion: version,
        downloadedVersion: version,
        progressPercent: 100,
        message: READY_MESSAGE,
        canInstall: true,
      })
    },
    error: (error: unknown) => {
      updateState({
        phase: 'error',
        availableVersion: null,
        downloadedVersion: null,
        progressPercent: null,
        message: error instanceof Error ? error.message : 'Update check failed.',
        canInstall: false,
      })
    },
  }

  const ensureListeners = (): void => {
    if (listenersRegistered) {
      return
    }

    providedAutoUpdater.on('checking-for-update', listeners.checkingForUpdate)
    providedAutoUpdater.on('update-available', listeners.updateAvailable)
    providedAutoUpdater.on('update-not-available', listeners.updateNotAvailable)
    providedAutoUpdater.on('download-progress', listeners.downloadProgress)
    providedAutoUpdater.on('update-downloaded', listeners.updateDownloaded)
    providedAutoUpdater.on('error', listeners.error)
    listenersRegistered = true
  }

  const updateState = (partial: Partial<AppUpdateState>): AppUpdateState => {
    state = {
      ...state,
      ...partial,
    }
    onStateChanged?.(state)
    return state
  }

  const setUnsupportedState = (): AppUpdateState =>
    updateState({
      phase: 'unsupported',
      availableVersion: null,
      downloadedVersion: null,
      progressPercent: null,
      message: UNSUPPORTED_MESSAGE,
      canInstall: false,
    })

  return {
    async start() {
      if (!isPackaged) {
        return setUnsupportedState()
      }

      ensureListeners()
      providedAutoUpdater.autoDownload = true
      providedAutoUpdater.autoInstallOnAppQuit = false
      await this.checkForUpdates()
      return state
    },
    getState() {
      return state
    },
    async checkForUpdates() {
      if (!isPackaged) {
        return setUnsupportedState()
      }

      ensureListeners()
      updateState({
        phase: 'checking',
        availableVersion: null,
        downloadedVersion: null,
        progressPercent: null,
        message: CHECKING_MESSAGE,
        canInstall: false,
      })

      try {
        await providedAutoUpdater.checkForUpdates()
      } catch (error) {
        listeners.error(error)
      }

      return state
    },
    installUpdate() {
      if (!state.canInstall) {
        return
      }

      providedAutoUpdater.quitAndInstall(false, true)
    },
    dispose() {
      if (!listenersRegistered) {
        return
      }

      providedAutoUpdater.removeListener('checking-for-update', listeners.checkingForUpdate)
      providedAutoUpdater.removeListener('update-available', listeners.updateAvailable)
      providedAutoUpdater.removeListener('update-not-available', listeners.updateNotAvailable)
      providedAutoUpdater.removeListener('download-progress', listeners.downloadProgress)
      providedAutoUpdater.removeListener('update-downloaded', listeners.updateDownloaded)
      providedAutoUpdater.removeListener('error', listeners.error)
      listenersRegistered = false
    },
  }
}

function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null
  }

  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeVersion(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
