import { batch, type Observable, observable } from '@legendapp/state'
import type { LiveSessionAskUserAnswerRecord } from '../../../shared/ipc/contracts'

export interface PermissionSessionApi {
  resolvePermissionRequest?: (
    sessionId: string,
    requestId: string,
    selectedOption: string,
  ) => Promise<void>
  resolveAskUser?: (
    sessionId: string,
    requestId: string,
    answers: LiveSessionAskUserAnswerRecord[],
  ) => Promise<void>
}

interface PermissionResolutionState {
  pendingPermissionRequestIds: string[]
  pendingAskUserRequestIds: string[]
  error: string | null
}

export class PermissionResolutionStore {
  readonly state$: Observable<PermissionResolutionState> = observable({
    pendingPermissionRequestIds: [] as string[],
    pendingAskUserRequestIds: [] as string[],
    error: null,
  })

  private readonly getSelectedSnapshot: () => { sessionId: string } | null
  private readonly sessionApi: PermissionSessionApi
  private readonly onRefreshSnapshot?: (sessionId: string) => Promise<void>

  constructor(
    getSelectedSnapshot: () => { sessionId: string } | null,
    sessionApi: PermissionSessionApi,
    onRefreshSnapshot?: (sessionId: string) => Promise<void>,
  ) {
    this.getSelectedSnapshot = getSelectedSnapshot
    this.sessionApi = sessionApi
    this.onRefreshSnapshot = onRefreshSnapshot
  }

  get pendingPermissionRequestIds(): string[] {
    return this.state$.pendingPermissionRequestIds.get()
  }

  set pendingPermissionRequestIds(value: string[]) {
    this.state$.pendingPermissionRequestIds.set(value)
  }

  get pendingAskUserRequestIds(): string[] {
    return this.state$.pendingAskUserRequestIds.get()
  }

  set pendingAskUserRequestIds(value: string[]) {
    this.state$.pendingAskUserRequestIds.set(value)
  }

  get error(): string | null {
    return this.state$.error.get()
  }

  set error(value: string | null) {
    this.state$.error.set(value)
  }

  resolvePermission = async (requestId: string, option: string): Promise<void> => {
    const selectedSnapshot = this.getSelectedSnapshot()

    if (!selectedSnapshot || !this.sessionApi.resolvePermissionRequest) {
      return
    }

    batch(() => {
      this.pendingPermissionRequestIds = this.pendingPermissionRequestIds.includes(requestId)
        ? this.pendingPermissionRequestIds
        : [...this.pendingPermissionRequestIds, requestId]
    })

    try {
      await this.sessionApi.resolvePermissionRequest(selectedSnapshot.sessionId, requestId, option)
      await this.onRefreshSnapshot?.(selectedSnapshot.sessionId)
    } catch (error) {
      batch(() => {
        this.error =
          error instanceof Error ? error.message : 'Unable to resolve the permission request.'
      })
    } finally {
      batch(() => {
        this.pendingPermissionRequestIds = this.pendingPermissionRequestIds.filter(
          (pendingRequestId) => pendingRequestId !== requestId,
        )
      })
    }
  }

  resolveAskUser = async (
    requestId: string,
    answers: LiveSessionAskUserAnswerRecord[],
  ): Promise<void> => {
    const selectedSnapshot = this.getSelectedSnapshot()

    if (!selectedSnapshot || !this.sessionApi.resolveAskUser) {
      return
    }

    batch(() => {
      this.pendingAskUserRequestIds = this.pendingAskUserRequestIds.includes(requestId)
        ? this.pendingAskUserRequestIds
        : [...this.pendingAskUserRequestIds, requestId]
    })

    try {
      await this.sessionApi.resolveAskUser(selectedSnapshot.sessionId, requestId, answers)
      await this.onRefreshSnapshot?.(selectedSnapshot.sessionId)
    } catch (error) {
      batch(() => {
        this.error =
          error instanceof Error ? error.message : 'Unable to submit the callback response.'
      })
    } finally {
      batch(() => {
        this.pendingAskUserRequestIds = this.pendingAskUserRequestIds.filter(
          (pendingRequestId) => pendingRequestId !== requestId,
        )
      })
    }
  }
}
