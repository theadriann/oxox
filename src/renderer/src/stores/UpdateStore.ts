import type { AppUpdateState } from '../../../shared/ipc/contracts'
import type { PlatformApiClient } from '../platform/apiClient'
import { batch, bindMethods, observable, readField, writeField } from './legend'

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
  readonly stateNode = observable({
    state: PLACEHOLDER_UPDATE_STATE as AppUpdateState,
    hasLoadedState: false,
    refreshError: null as string | null,
    promptDismissed: false,
  })

  constructor(private readonly bridge: UpdateStoreBridge) {
    bindMethods(this)
  }

  get state(): AppUpdateState {
    return readField(this.stateNode, 'state')
  }

  set state(value: AppUpdateState) {
    writeField(this.stateNode, 'state', value)
  }

  get hasLoadedState(): boolean {
    return readField(this.stateNode, 'hasLoadedState')
  }

  set hasLoadedState(value: boolean) {
    writeField(this.stateNode, 'hasLoadedState', value)
  }

  get refreshError(): string | null {
    return readField(this.stateNode, 'refreshError')
  }

  set refreshError(value: string | null) {
    writeField(this.stateNode, 'refreshError', value)
  }

  get downloadedVersion(): string | null {
    return this.state.downloadedVersion
  }

  get shouldShowPrompt(): boolean {
    return this.state.phase === 'downloaded' && !readField(this.stateNode, 'promptDismissed')
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
    batch(() => {
      const shouldResetPrompt =
        snapshot.phase === 'downloaded' &&
        (this.state.phase !== 'downloaded' ||
          this.state.downloadedVersion !== snapshot.downloadedVersion)

      if (snapshot.phase !== 'downloaded' || shouldResetPrompt) {
        writeField(this.stateNode, 'promptDismissed', false)
      }

      this.state = snapshot
      this.hasLoadedState = true
      this.refreshError = null
    })
  }

  dismissPrompt(): void {
    writeField(this.stateNode, 'promptDismissed', true)
  }

  async refresh(): Promise<void> {
    const getUpdateState = this.bridge.getUpdateState

    if (!getUpdateState) {
      batch(() => {
        this.state = PLACEHOLDER_UPDATE_STATE
        this.hasLoadedState = false
        this.refreshError = 'Update bridge unavailable.'
      })
      return
    }

    try {
      const snapshot = await getUpdateState()
      this.applySnapshot(snapshot)
    } catch (error) {
      batch(() => {
        this.refreshError = error instanceof Error ? error.message : 'Unable to load update state.'
      })
    }
  }

  async checkForUpdates(): Promise<void> {
    const checkForUpdates = this.bridge.checkForUpdates

    if (!checkForUpdates) {
      batch(() => {
        this.refreshError = 'Update bridge unavailable.'
      })
      return
    }

    const snapshot = await checkForUpdates()
    this.applySnapshot(snapshot)
  }

  async installUpdate(): Promise<void> {
    const installUpdate = this.bridge.installUpdate

    if (!installUpdate) {
      batch(() => {
        this.refreshError = 'Update bridge unavailable.'
      })
      return
    }

    await installUpdate()
  }
}
