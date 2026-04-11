import { makeAutoObservable, runInAction } from 'mobx'

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

export class PermissionResolutionStore {
  pendingPermissionRequestIds: string[] = []
  pendingAskUserRequestIds: string[] = []
  error: string | null = null

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

    makeAutoObservable(
      this,
      { getSelectedSnapshot: false, sessionApi: false, onRefreshSnapshot: false },
      { autoBind: true },
    )
  }

  async resolvePermission(requestId: string, option: string): Promise<void> {
    const selectedSnapshot = this.getSelectedSnapshot()

    if (!selectedSnapshot || !this.sessionApi.resolvePermissionRequest) {
      return
    }

    runInAction(() => {
      this.pendingPermissionRequestIds = this.pendingPermissionRequestIds.includes(requestId)
        ? this.pendingPermissionRequestIds
        : [...this.pendingPermissionRequestIds, requestId]
    })

    try {
      await this.sessionApi.resolvePermissionRequest(selectedSnapshot.sessionId, requestId, option)
      await this.onRefreshSnapshot?.(selectedSnapshot.sessionId)
    } catch (error) {
      runInAction(() => {
        this.error =
          error instanceof Error ? error.message : 'Unable to resolve the permission request.'
      })
    } finally {
      runInAction(() => {
        this.pendingPermissionRequestIds = this.pendingPermissionRequestIds.filter(
          (pendingRequestId) => pendingRequestId !== requestId,
        )
      })
    }
  }

  async resolveAskUser(
    requestId: string,
    answers: LiveSessionAskUserAnswerRecord[],
  ): Promise<void> {
    const selectedSnapshot = this.getSelectedSnapshot()

    if (!selectedSnapshot || !this.sessionApi.resolveAskUser) {
      return
    }

    runInAction(() => {
      this.pendingAskUserRequestIds = this.pendingAskUserRequestIds.includes(requestId)
        ? this.pendingAskUserRequestIds
        : [...this.pendingAskUserRequestIds, requestId]
    })

    try {
      await this.sessionApi.resolveAskUser(selectedSnapshot.sessionId, requestId, answers)
      await this.onRefreshSnapshot?.(selectedSnapshot.sessionId)
    } catch (error) {
      runInAction(() => {
        this.error =
          error instanceof Error ? error.message : 'Unable to submit the callback response.'
      })
    } finally {
      runInAction(() => {
        this.pendingAskUserRequestIds = this.pendingAskUserRequestIds.filter(
          (pendingRequestId) => pendingRequestId !== requestId,
        )
      })
    }
  }
}
