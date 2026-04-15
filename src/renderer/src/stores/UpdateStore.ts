import { makeAutoObservable, runInAction } from 'mobx'

import type { AppUpdateState } from '../../../shared/ipc/contracts'
import type { PlatformApiClient } from '../platform/apiClient'

export const PLACEHOLDER_UPDATE_STATE: AppUpdateState = {
  phase: 'idle',
  currentVersion: '',
  availableVersion: null,
  downloadedVersion: null,
  progressPercent: null,
  message: null,
  canInstall: false,
}

export interface UpdateStoreBridge {
  getUpdateState?: PlatformApiClient['app']['getUpdateState']
  checkForUpdates?: PlatformApiClient['app']['checkForUpdates']
  installUpdate?: PlatformApiClient['app']['installUpdate']
}

export class UpdateStore {
  state: AppUpdateState = PLACEHOLDER_UPDATE_STATE
  hasLoadedState = false
  refreshError: string | null = null
  private promptDismissed = false

  constructor(private readonly bridge: UpdateStoreBridge) {
    makeAutoObservable(this, { bridge: false }, { autoBind: true })
  }

  get downloadedVersion(): string | null {
    return this.state.downloadedVersion
  }

  get shouldShowPrompt(): boolean {
    return this.state.phase === 'downloaded' && !this.promptDismissed
  }

  get statusLabel(): string | null {
    if (this.state.phase === 'downloaded') {
      return 'Update ready'
    }

    if (this.state.phase === 'checking' || this.state.phase === 'downloading') {
      return this.state.message
    }

    return null
  }

  applySnapshot(snapshot: AppUpdateState): void {
    const shouldResetPrompt =
      snapshot.phase === 'downloaded' &&
      (this.state.phase !== 'downloaded' ||
        this.state.downloadedVersion !== snapshot.downloadedVersion)

    if (snapshot.phase !== 'downloaded' || shouldResetPrompt) {
      this.promptDismissed = false
    }

    this.state = snapshot
    this.hasLoadedState = true
    this.refreshError = null
  }

  dismissPrompt(): void {
    this.promptDismissed = true
  }

  async refresh(): Promise<void> {
    const getUpdateState = this.bridge.getUpdateState

    if (!getUpdateState) {
      runInAction(() => {
        this.state = PLACEHOLDER_UPDATE_STATE
        this.hasLoadedState = false
        this.refreshError = 'Update bridge unavailable.'
      })
      return
    }

    try {
      const snapshot = await getUpdateState()
      runInAction(() => {
        this.applySnapshot(snapshot)
      })
    } catch (error) {
      runInAction(() => {
        this.refreshError = error instanceof Error ? error.message : 'Unable to load update state.'
      })
    }
  }

  async checkForUpdates(): Promise<void> {
    const checkForUpdates = this.bridge.checkForUpdates

    if (!checkForUpdates) {
      runInAction(() => {
        this.refreshError = 'Update bridge unavailable.'
      })
      return
    }

    const snapshot = await checkForUpdates()

    runInAction(() => {
      this.applySnapshot(snapshot)
    })
  }

  async installUpdate(): Promise<void> {
    const installUpdate = this.bridge.installUpdate

    if (!installUpdate) {
      runInAction(() => {
        this.refreshError = 'Update bridge unavailable.'
      })
      return
    }

    await installUpdate()
  }
}
