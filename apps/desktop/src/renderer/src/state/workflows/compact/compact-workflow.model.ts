import { batch, type Observable } from '@legendapp/state'
import type {
  LiveSessionCompactRequest,
  LiveSessionCompactResult,
} from '../../../../../shared/ipc/contracts'
import type { AsyncActionsStore } from '../../composer/async-actions.model'
import { type CompactWorkflowState, createCompactWorkflowState$ } from './compact-workflow.state'

export interface CompactSessionApi {
  compact?: (
    sessionId: string,
    request?: LiveSessionCompactRequest,
  ) => Promise<LiveSessionCompactResult>
}

export class CompactWorkflowStore {
  readonly state$: Observable<CompactWorkflowState> = createCompactWorkflowState$()

  private readonly getSelectedSessionId: () => string | null
  private readonly getSelectedSession: () => { title: string } | null
  private readonly getSelectedCompactionModel: () => string | null
  private readonly sessionApi: CompactSessionApi
  private readonly asyncActionsStore: AsyncActionsStore
  private readonly onCompacted?: (result: LiveSessionCompactResult) => Promise<void>

  constructor(
    getSelectedSessionId: () => string | null,
    getSelectedSession: () => { title: string } | null,
    getSelectedCompactionModel: () => string | null,
    sessionApi: CompactSessionApi,
    asyncActionsStore: AsyncActionsStore,
    onCompacted?: (result: LiveSessionCompactResult) => Promise<void>,
  ) {
    this.getSelectedSessionId = getSelectedSessionId
    this.getSelectedSession = getSelectedSession
    this.getSelectedCompactionModel = getSelectedCompactionModel
    this.sessionApi = sessionApi
    this.asyncActionsStore = asyncActionsStore
    this.onCompacted = onCompacted
  }

  get customInstructionsDraft(): string {
    return this.state$.customInstructionsDraft.get()
  }

  set customInstructionsDraft(value: string) {
    this.state$.customInstructionsDraft.set(value)
  }

  get compactionModelDraft(): string {
    return this.state$.compactionModelDraft.get()
  }

  set compactionModelDraft(value: string) {
    this.state$.compactionModelDraft.set(value)
  }

  get isCompactDialogOpen(): boolean {
    return this.state$.isCompactDialogOpen.get()
  }

  set isCompactDialogOpen(value: boolean) {
    this.state$.isCompactDialogOpen.set(value)
  }

  get compactingSessionId(): string | null {
    return this.state$.compactingSessionId.get()
  }

  set compactingSessionId(value: string | null) {
    this.state$.compactingSessionId.set(value)
  }

  get error(): string | null {
    return this.state$.error.get()
  }

  set error(value: string | null) {
    this.state$.error.set(value)
  }

  openCompactDialog = (): void => {
    const selectedSessionId = this.getSelectedSessionId()

    if (!selectedSessionId) {
      return
    }

    batch(() => {
      this.customInstructionsDraft = ''
      this.compactionModelDraft = this.getSelectedCompactionModel() ?? 'current-model'
      this.isCompactDialogOpen = true
      this.error = null
    })
  }

  closeCompactDialog = (): void => {
    batch(() => {
      this.isCompactDialogOpen = false
      this.customInstructionsDraft = ''
      this.error = null
    })
  }

  setCustomInstructionsDraft = (value: string): void => {
    this.customInstructionsDraft = value
  }

  setCompactionModelDraft = (value: string): void => {
    this.compactionModelDraft = value
  }

  submitCompact = async (): Promise<LiveSessionCompactResult | null> => {
    const selectedSessionId = this.getSelectedSessionId()
    const compact = this.sessionApi.compact

    if (!selectedSessionId || !compact) {
      return null
    }

    const sessionTitle = this.getSelectedSession()?.title ?? 'session'
    const actionId = this.asyncActionsStore.startAction('Compressing session', sessionTitle)
    const request: LiveSessionCompactRequest = {
      customInstructions: this.customInstructionsDraft.trim() || undefined,
      compactionModel: this.compactionModelDraft.trim() || 'current-model',
    }

    batch(() => {
      this.compactingSessionId = selectedSessionId
      this.error = null
      this.closeCompactDialog()
    })

    try {
      const result = await compact(selectedSessionId, request)
      await this.onCompacted?.(result)
      this.asyncActionsStore.completeAction(
        actionId,
        'Compression complete',
        `${result.snapshot.title} · removed ${result.removedCount} messages`,
      )

      return result
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to compact the selected session.'

      batch(() => {
        this.error = message
      })
      this.asyncActionsStore.failAction(actionId, 'Compression failed', message)
      return null
    } finally {
      batch(() => {
        this.compactingSessionId = null
      })
    }
  }
}
