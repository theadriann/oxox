import { type Observable, observable } from '@legendapp/state'

export interface PermissionResolutionState {
  pendingPermissionRequestIds: string[]
  pendingAskUserRequestIds: string[]
  error: string | null
}

export function createDefaultPermissionResolutionState(): PermissionResolutionState {
  return {
    pendingPermissionRequestIds: [],
    pendingAskUserRequestIds: [],
    error: null,
  }
}

export function createPermissionResolutionState$(): Observable<PermissionResolutionState> {
  return observable(createDefaultPermissionResolutionState())
}
