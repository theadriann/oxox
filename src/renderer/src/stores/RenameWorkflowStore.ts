import { batch, bindMethods, observable, readField, writeField } from './legend'
export interface RenameSessionApi {
  renameViaDaemon?: (sessionId: string, title: string) => Promise<void>
}

export class RenameWorkflowStore {
  readonly stateNode = observable({
    renameDraft: '',
    isRenameDialogOpen: false,
    renamingSessionId: null as string | null,
    error: null as string | null,
  })

  private readonly getSelectedSessionId: () => string | null
  private readonly getSelectedSession: () => { title: string } | null
  private readonly sessionApi: RenameSessionApi
  private readonly onRenamed?: (sessionId: string, newTitle: string) => Promise<void>

  constructor(
    getSelectedSessionId: () => string | null,
    getSelectedSession: () => { title: string } | null,
    sessionApi: RenameSessionApi,
    onRenamed?: (sessionId: string, newTitle: string) => Promise<void>,
  ) {
    this.getSelectedSessionId = getSelectedSessionId
    this.getSelectedSession = getSelectedSession
    this.sessionApi = sessionApi
    this.onRenamed = onRenamed

    bindMethods(this)
  }

  get renameDraft(): string {
    return readField(this.stateNode, 'renameDraft')
  }

  set renameDraft(value: string) {
    writeField(this.stateNode, 'renameDraft', value)
  }

  get isRenameDialogOpen(): boolean {
    return readField(this.stateNode, 'isRenameDialogOpen')
  }

  set isRenameDialogOpen(value: boolean) {
    writeField(this.stateNode, 'isRenameDialogOpen', value)
  }

  get renamingSessionId(): string | null {
    return readField(this.stateNode, 'renamingSessionId')
  }

  set renamingSessionId(value: string | null) {
    writeField(this.stateNode, 'renamingSessionId', value)
  }

  get error(): string | null {
    return readField(this.stateNode, 'error')
  }

  set error(value: string | null) {
    writeField(this.stateNode, 'error', value)
  }

  openRenameDialog(): void {
    const selectedSessionId = this.getSelectedSessionId()

    if (!selectedSessionId) {
      return
    }

    this.renameDraft = this.getSelectedSession()?.title ?? ''
    this.isRenameDialogOpen = true
    this.error = null
  }

  closeRenameDialog(): void {
    this.isRenameDialogOpen = false
    this.renameDraft = ''
  }

  setRenameDraft(value: string): void {
    this.renameDraft = value
  }

  async submitRename(): Promise<void> {
    const selectedSessionId = this.getSelectedSessionId()
    const nextTitle = this.renameDraft.trim()

    if (!selectedSessionId || nextTitle.length === 0 || !this.sessionApi.renameViaDaemon) {
      return
    }

    batch(() => {
      this.renamingSessionId = selectedSessionId
      this.error = null
    })

    try {
      await this.sessionApi.renameViaDaemon(selectedSessionId, nextTitle)
      await this.onRenamed?.(selectedSessionId, nextTitle)

      batch(() => {
        this.closeRenameDialog()
      })
    } catch (error) {
      batch(() => {
        this.error =
          error instanceof Error ? error.message : 'Unable to rename the selected session.'
      })
    } finally {
      batch(() => {
        this.renamingSessionId = null
      })
    }
  }
}
