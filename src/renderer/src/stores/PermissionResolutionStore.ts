import type { LiveSessionAskUserAnswerRecord } from '../../../shared/ipc/contracts'
import { batch, bindMethods, observable, readField, writeField } from './legend'

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
  readonly stateNode = observable({
    pendingPermissionRequestIds: [] as string[],
    pendingAskUserRequestIds: [] as string[],
    error: null as string | null,
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

    bindMethods(this)
  }

  get pendingPermissionRequestIds(): string[] {
    return readField(this.stateNode, 'pendingPermissionRequestIds')
  }

  set pendingPermissionRequestIds(value: string[]) {
    writeField(this.stateNode, 'pendingPermissionRequestIds', value)
  }

  get pendingAskUserRequestIds(): string[] {
    return readField(this.stateNode, 'pendingAskUserRequestIds')
  }

  set pendingAskUserRequestIds(value: string[]) {
    writeField(this.stateNode, 'pendingAskUserRequestIds', value)
  }

  get error(): string | null {
    return readField(this.stateNode, 'error')
  }

  set error(value: string | null) {
    writeField(this.stateNode, 'error', value)
  }

  async resolvePermission(requestId: string, option: string): Promise<void> {
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

  async resolveAskUser(
    requestId: string,
    answers: LiveSessionAskUserAnswerRecord[],
  ): Promise<void> {
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
