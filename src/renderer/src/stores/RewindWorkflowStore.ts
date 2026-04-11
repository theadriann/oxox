import { makeAutoObservable, runInAction } from 'mobx'

import type {
  LiveSessionExecuteRewindResult,
  LiveSessionRewindInfo,
} from '../../../shared/ipc/contracts'

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
  rewindMessageId = ''
  rewindForkTitle = ''
  rewindInfo: LiveSessionRewindInfo | null = null
  rewindError: string | null = null
  isRewindDialogOpen = false
  loadingRewindSessionId: string | null = null
  rewindingSessionId: string | null = null
  selectedRestoreFilePaths: string[] = []
  selectedDeleteFilePaths: string[] = []

  private readonly getSelectedSessionId: () => string | null
  private readonly getSelectedSession: () => { title: string } | null
  private readonly sessionApi: RewindSessionApi
  private readonly onRewound?: (result: LiveSessionExecuteRewindResult) => Promise<void>

  constructor(
    getSelectedSessionId: () => string | null,
    getSelectedSession: () => { title: string } | null,
    sessionApi: RewindSessionApi,
    onRewound?: (result: LiveSessionExecuteRewindResult) => Promise<void>,
  ) {
    this.getSelectedSessionId = getSelectedSessionId
    this.getSelectedSession = getSelectedSession
    this.sessionApi = sessionApi
    this.onRewound = onRewound

    makeAutoObservable(
      this,
      {
        getSelectedSessionId: false,
        getSelectedSession: false,
        sessionApi: false,
        onRewound: false,
      },
      { autoBind: true },
    )
  }

  openRewindDialog(): void {
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

  closeRewindDialog(): void {
    this.isRewindDialogOpen = false
    this.rewindMessageId = ''
    this.rewindForkTitle = ''
    this.rewindInfo = null
    this.rewindError = null
    this.selectedRestoreFilePaths = []
    this.selectedDeleteFilePaths = []
  }

  setRewindMessageId(value: string): void {
    this.rewindMessageId = value
    this.rewindInfo = null
    this.rewindError = null
    this.selectedRestoreFilePaths = []
    this.selectedDeleteFilePaths = []
  }

  setRewindForkTitle(value: string): void {
    this.rewindForkTitle = value
  }

  toggleRewindRestoreFile(filePath: string): void {
    this.selectedRestoreFilePaths = this.selectedRestoreFilePaths.includes(filePath)
      ? this.selectedRestoreFilePaths.filter((candidate) => candidate !== filePath)
      : [...this.selectedRestoreFilePaths, filePath]
  }

  toggleRewindDeleteFile(filePath: string): void {
    this.selectedDeleteFilePaths = this.selectedDeleteFilePaths.includes(filePath)
      ? this.selectedDeleteFilePaths.filter((candidate) => candidate !== filePath)
      : [...this.selectedDeleteFilePaths, filePath]
  }

  async loadRewindInfo(): Promise<void> {
    const selectedSessionId = this.getSelectedSessionId()
    const messageId = this.rewindMessageId.trim()

    if (!selectedSessionId || messageId.length === 0 || !this.sessionApi.getRewindInfo) {
      return
    }

    runInAction(() => {
      this.loadingRewindSessionId = selectedSessionId
      this.rewindError = null
    })

    try {
      const rewindInfo = await this.sessionApi.getRewindInfo(selectedSessionId, messageId)

      runInAction(() => {
        this.rewindInfo = rewindInfo
        this.selectedRestoreFilePaths = rewindInfo.availableFiles.map((file) => file.filePath)
        this.selectedDeleteFilePaths = rewindInfo.createdFiles.map((file) => file.filePath)
      })
    } catch (error) {
      runInAction(() => {
        this.rewindError =
          error instanceof Error ? error.message : 'Unable to load rewind information.'
      })
    } finally {
      runInAction(() => {
        this.loadingRewindSessionId = null
      })
    }
  }

  async submitExecuteRewind(): Promise<void> {
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

    runInAction(() => {
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

      runInAction(() => {
        this.closeRewindDialog()
      })
    } catch (error) {
      runInAction(() => {
        this.rewindError =
          error instanceof Error ? error.message : 'Unable to execute the rewind request.'
      })
    } finally {
      runInAction(() => {
        this.rewindingSessionId = null
      })
    }
  }
}
