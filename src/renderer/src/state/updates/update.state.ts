import { type Observable, observable } from '@legendapp/state'
import type { AppUpdateState } from '../../../../shared/ipc/contracts'

export const PLACEHOLDER_UPDATE_STATE: AppUpdateState = {
  phase: 'idle',
  currentVersion: '',
  availableVersion: null,
  downloadedVersion: null,
  progressPercent: null,
  message: null,
  canInstall: false,
}

export interface UpdateState {
  state: AppUpdateState
  hasLoadedState: boolean
  refreshError: string | null
  promptDismissed: boolean
}

export function createDefaultUpdateState(): UpdateState {
  return {
    state: PLACEHOLDER_UPDATE_STATE,
    hasLoadedState: false,
    refreshError: null,
    promptDismissed: false,
  }
}

export function createUpdateState$(): Observable<UpdateState> {
  return observable(createDefaultUpdateState())
}
