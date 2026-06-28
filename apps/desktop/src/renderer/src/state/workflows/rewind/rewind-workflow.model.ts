import { batch, type Observable } from '@legendapp/state'
import type {
  LiveSessionExecuteRewindResult,
  LiveSessionRewindInfo,
} from '../../../../../shared/ipc/contracts'
import type { AsyncActionsStore } from '../../composer/async-actions.model'
import { createRewindWorkflowState$, type RewindWorkflowState } from './rewind-workflow.state'

export interface RewindSessionApi {
  getRewindInfo?: (sessionId: string, messageId: string) => Promise<LiveSessionRewindInfo>
  executeRewind?: (
    sessionId: string,
    params: {
      messageId: string
      filesToRestore: LiveSessionRewindInfo['availableFiles']
      filesToDelete: LiveSessionRewindInfo['createdFiles']
      forkTitle: string
    },
  ) => Promise<LiveSessionExecuteRewindResult>
}

export class RewindWorkflowStore {
  readonly state$: Observable<RewindWorkflowState> = createRewindWorkflowState$()

  private readonly getSelectedSessionId: () => string | null
  private readonly getSelectedSession: () => { title: string } | null
  private readonly sessionApi: RewindSessionApi
  private readonly onRewound?: (result: LiveSessionExecuteRewindResult) => Promise<void>
  private readonly asyncActionsStore?: AsyncActionsStore

  constructor(
    getSelectedSessionId: () => string | null,
    getSelectedSession: () => { title: string } | null,
    sessionApi: RewindSessionApi,
    onRewound?: (result: LiveSessionExecuteRewindResult) => Promise<void>,
    asyncActionsStore?: AsyncActionsStore,
  ) {
    this.getSelectedSessionId = getSelectedSessionId
    this.getSelectedSession = getSelectedSession
    this.sessionApi = sessionApi
    this.onRewound = onRewound
    this.asyncActionsStore = asyncActionsStore
  }

  get rewindMessageId(): string {
    return this.state$.rewindMessageId.get()
  }

  set rewindMessageId(value: string) {
    this.state$.rewindMessageId.set(value)
  }

  get rewindForkTitle(): string {
    return this.state$.rewindForkTitle.get()
  }

  set rewindForkTitle(value: string) {
    this.state$.rewindForkTitle.set(value)
  }

  get rewindInfo(): LiveSessionRewindInfo | null {
    return this.state$.rewindInfo.get()
  }

  set rewindInfo(value: LiveSessionRewindInfo | null) {
    this.state$.rewindInfo.set(value)
  }

  get rewindError(): string | null {
    return this.state$.rewindError.get()
  }

  set rewindError(value: string | null) {
    this.state$.rewindError.set(value)
  }

  get isRewindDialogOpen(): boolean {
    return this.state$.isRewindDialogOpen.get()
  }

  set isRewindDialogOpen(value: boolean) {
    this.state$.isRewindDialogOpen.set(value)
  }

  get loadingRewindSessionId(): string | null {
    return this.state$.loadingRewindSessionId.get()
  }

  set loadingRewindSessionId(value: string | null) {
    this.state$.loadingRewindSessionId.set(value)
  }

  get rewindingSessionId(): string | null {
    return this.state$.rewindingSessionId.get()
  }

  set rewindingSessionId(value: string | null) {
    this.state$.rewindingSessionId.set(value)
  }

  get selectedRestoreFilePaths(): string[] {
    return this.state$.selectedRestoreFilePaths.get()
  }

  set selectedRestoreFilePaths(value: string[]) {
    this.state$.selectedRestoreFilePaths.set(value)
  }

  get selectedDeleteFilePaths(): string[] {
    return this.state$.selectedDeleteFilePaths.get()
  }

  set selectedDeleteFilePaths(value: string[]) {
    this.state$.selectedDeleteFilePaths.set(value)
  }

  openRewindDialog = (): void => {
    const selectedSessionId = this.getSelectedSessionId()

    if (!selectedSessionId) {
      return
    }

    this.isRewindDialogOpen = true
    this.rewindMessageId = ''
    this.rewindInfo = null
    this.rewindError = null
    this.selectedRestoreFilePaths = []
    this.selectedDeleteFilePaths = []
    this.rewindForkTitle = `Rewind ${this.getSelectedSession()?.title ?? 'session'}`
  }

  closeRewindDialog = (): void => {
    this.isRewindDialogOpen = false
    this.rewindMessageId = ''
    this.rewindForkTitle = ''
    this.rewindInfo = null
    this.rewindError = null
    this.selectedRestoreFilePaths = []
    this.selectedDeleteFilePaths = []
  }

  setRewindMessageId = (value: string): void => {
    this.rewindMessageId = value
    this.rewindInfo = null
    this.rewindError = null
    this.selectedRestoreFilePaths = []
    this.selectedDeleteFilePaths = []
  }

  setRewindForkTitle = (value: string): void => {
    this.rewindForkTitle = value
  }

  toggleRewindRestoreFile = (filePath: string): void => {
    this.selectedRestoreFilePaths = this.selectedRestoreFilePaths.includes(filePath)
      ? this.selectedRestoreFilePaths.filter((candidate) => candidate !== filePath)
      : [...this.selectedRestoreFilePaths, filePath]
  }

  toggleRewindDeleteFile = (filePath: string): void => {
    this.selectedDeleteFilePaths = this.selectedDeleteFilePaths.includes(filePath)
      ? this.selectedDeleteFilePaths.filter((candidate) => candidate !== filePath)
      : [...this.selectedDeleteFilePaths, filePath]
  }

  loadRewindInfo = async (): Promise<void> => {
    const selectedSessionId = this.getSelectedSessionId()
    const messageId = this.rewindMessageId.trim()

    if (!selectedSessionId || messageId.length === 0 || !this.sessionApi.getRewindInfo) {
      return
    }

    batch(() => {
      this.loadingRewindSessionId = selectedSessionId
      this.rewindError = null
    })

    try {
      const rewindInfo = await this.sessionApi.getRewindInfo(selectedSessionId, messageId)

      batch(() => {
        this.rewindInfo = rewindInfo
        this.selectedRestoreFilePaths = rewindInfo.availableFiles.map((file) => file.filePath)
        this.selectedDeleteFilePaths = rewindInfo.createdFiles.map((file) => file.filePath)
      })
    } catch (error) {
      batch(() => {
        this.rewindError =
          error instanceof Error ? error.message : 'Unable to load rewind information.'
      })
    } finally {
      batch(() => {
        this.loadingRewindSessionId = null
      })
    }
  }

  submitExecuteRewind = async (): Promise<void> => {
    const selectedSessionId = this.getSelectedSessionId()
    const messageId = this.rewindMessageId.trim()
    const forkTitle = this.rewindForkTitle.trim()

    if (
      !selectedSessionId ||
      messageId.length === 0 ||
      forkTitle.length === 0 ||
      !this.rewindInfo ||
      !this.sessionApi.executeRewind
    ) {
      return
    }

    batch(() => {
      this.rewindingSessionId = selectedSessionId
      this.rewindError = null
    })

    try {
      const result = await this.sessionApi.executeRewind(selectedSessionId, {
        messageId,
        filesToRestore: this.rewindInfo.availableFiles.filter((file) =>
          this.selectedRestoreFilePaths.includes(file.filePath),
        ),
        filesToDelete: this.rewindInfo.createdFiles.filter((file) =>
          this.selectedDeleteFilePaths.includes(file.filePath),
        ),
        forkTitle,
      })

      await this.onRewound?.(result)

      batch(() => {
        this.closeRewindDialog()
      })
    } catch (error) {
      batch(() => {
        this.rewindError =
          error instanceof Error ? error.message : 'Unable to execute the rewind request.'
      })
    } finally {
      batch(() => {
        this.rewindingSessionId = null
      })
    }
  }

  executeRewindFromMessage = async (
    messageId: string,
  ): Promise<LiveSessionExecuteRewindResult | null> => {
    const selectedSessionId = this.getSelectedSessionId()
    const trimmedMessageId = messageId.trim()

    if (!selectedSessionId || trimmedMessageId.length === 0 || !this.sessionApi.executeRewind) {
      return null
    }

    const forkTitle = `Fork from ${this.getSelectedSession()?.title?.trim() || 'session'}`
    const actionId = this.asyncActionsStore?.startAction('Creating fork', forkTitle)

    batch(() => {
      this.rewindingSessionId = selectedSessionId
      this.rewindError = null
    })

    try {
      const result = await this.sessionApi.executeRewind(selectedSessionId, {
        messageId: trimmedMessageId,
        filesToRestore: [],
        filesToDelete: [],
        forkTitle,
      })

      await this.onRewound?.(result)
      if (actionId) {
        this.asyncActionsStore?.completeAction(actionId, 'Fork created', result.snapshot.title)
      }

      return result
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to fork from the selected message.'

      batch(() => {
        this.rewindError = message
      })
      if (actionId) {
        this.asyncActionsStore?.failAction(actionId, 'Fork failed', message)
      }

      return null
    } finally {
      batch(() => {
        this.rewindingSessionId = null
      })
    }
  }
}
