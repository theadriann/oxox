import { batch, type Observable } from '@legendapp/state'
import type { AppUpdateState } from '../../../../shared/ipc/contracts'
import type { PlatformApiClient } from '../../platform/apiClient'
import { createUpdateState$, PLACEHOLDER_UPDATE_STATE, type UpdateState } from './update.state'

export { PLACEHOLDER_UPDATE_STATE } from './update.state'

export interface UpdateStoreBridge {
  getUpdateState?: PlatformApiClient['app']['getUpdateState']
  checkForUpdates?: PlatformApiClient['app']['checkForUpdates']
  installUpdate?: PlatformApiClient['app']['installUpdate']
}

export class UpdateStore {
  readonly state$: Observable<UpdateState> = createUpdateState$()

  constructor(private readonly bridge: UpdateStoreBridge) {}

  get state(): AppUpdateState {
    return this.state$.state.get()
  }

  set state(value: AppUpdateState) {
    this.state$.state.set(value)
  }

  get hasLoadedState(): boolean {
    return this.state$.hasLoadedState.get()
  }

  set hasLoadedState(value: boolean) {
    this.state$.hasLoadedState.set(value)
  }

  get refreshError(): string | null {
    return this.state$.refreshError.get()
  }

  set refreshError(value: string | null) {
    this.state$.refreshError.set(value)
  }

  get downloadedVersion(): string | null {
    return this.state.downloadedVersion
  }

  get shouldShowPrompt(): boolean {
    return this.state.phase === 'downloaded' && !this.state$.promptDismissed.get()
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

  applySnapshot = (snapshot: AppUpdateState): void => {
    batch(() => {
      const shouldResetPrompt =
        snapshot.phase === 'downloaded' &&
        (this.state.phase !== 'downloaded' ||
          this.state.downloadedVersion !== snapshot.downloadedVersion)

      if (snapshot.phase !== 'downloaded' || shouldResetPrompt) {
        this.state$.promptDismissed.set(false)
      }

      this.state = snapshot
      this.hasLoadedState = true
      this.refreshError = null
    })
  }

  dismissPrompt = (): void => {
    this.state$.promptDismissed.set(true)
  }

  refresh = async (): Promise<void> => {
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

  checkForUpdates = async (): Promise<void> => {
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

  installUpdate = async (): Promise<void> => {
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
