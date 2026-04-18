import type {
  LiveSessionExecuteRewindResult,
  LiveSessionRewindInfo,
} from '../../../shared/ipc/contracts'
import { batch, bindMethods, observable, readField, writeField } from './legend'

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
  readonly stateNode = observable({
    rewindMessageId: '',
    rewindForkTitle: '',
    rewindInfo: null as LiveSessionRewindInfo | null,
    rewindError: null as string | null,
    isRewindDialogOpen: false,
    loadingRewindSessionId: null as string | null,
    rewindingSessionId: null as string | null,
    selectedRestoreFilePaths: [] as string[],
    selectedDeleteFilePaths: [] as string[],
  })

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

    bindMethods(this)
  }

  get rewindMessageId(): string {
    return readField(this.stateNode, 'rewindMessageId')
  }

  set rewindMessageId(value: string) {
    writeField(this.stateNode, 'rewindMessageId', value)
  }

  get rewindForkTitle(): string {
    return readField(this.stateNode, 'rewindForkTitle')
  }

  set rewindForkTitle(value: string) {
    writeField(this.stateNode, 'rewindForkTitle', value)
  }

  get rewindInfo(): LiveSessionRewindInfo | null {
    return readField(this.stateNode, 'rewindInfo')
  }

  set rewindInfo(value: LiveSessionRewindInfo | null) {
    writeField(this.stateNode, 'rewindInfo', value)
  }

  get rewindError(): string | null {
    return readField(this.stateNode, 'rewindError')
  }

  set rewindError(value: string | null) {
    writeField(this.stateNode, 'rewindError', value)
  }

  get isRewindDialogOpen(): boolean {
    return readField(this.stateNode, 'isRewindDialogOpen')
  }

  set isRewindDialogOpen(value: boolean) {
    writeField(this.stateNode, 'isRewindDialogOpen', value)
  }

  get loadingRewindSessionId(): string | null {
    return readField(this.stateNode, 'loadingRewindSessionId')
  }

  set loadingRewindSessionId(value: string | null) {
    writeField(this.stateNode, 'loadingRewindSessionId', value)
  }

  get rewindingSessionId(): string | null {
    return readField(this.stateNode, 'rewindingSessionId')
  }

  set rewindingSessionId(value: string | null) {
    writeField(this.stateNode, 'rewindingSessionId', value)
  }

  get selectedRestoreFilePaths(): string[] {
    return readField(this.stateNode, 'selectedRestoreFilePaths')
  }

  set selectedRestoreFilePaths(value: string[]) {
    writeField(this.stateNode, 'selectedRestoreFilePaths', value)
  }

  get selectedDeleteFilePaths(): string[] {
    return readField(this.stateNode, 'selectedDeleteFilePaths')
  }

  set selectedDeleteFilePaths(value: string[]) {
    writeField(this.stateNode, 'selectedDeleteFilePaths', value)
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
}
