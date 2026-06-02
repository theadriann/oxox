import { batch, type Observable, observable } from '@legendapp/state'
export interface RenameSessionApi {
  rename?: (sessionId: string, title: string) => Promise<void>
  renameViaDaemon?: (sessionId: string, title: string) => Promise<void>
}

interface RenameWorkflowState {
  renameDraft: string
  isRenameDialogOpen: boolean
  renamingSessionId: string | null
  error: string | null
}

export class RenameWorkflowStore {
  readonly state$: Observable<RenameWorkflowState> = observable({
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
  }

  get renameDraft(): string {
    return this.state$.renameDraft.get()
  }

  set renameDraft(value: string) {
    this.state$.renameDraft.set(value)
  }

  get isRenameDialogOpen(): boolean {
    return this.state$.isRenameDialogOpen.get()
  }

  set isRenameDialogOpen(value: boolean) {
    this.state$.isRenameDialogOpen.set(value)
  }

  get renamingSessionId(): string | null {
    return this.state$.renamingSessionId.get()
  }

  set renamingSessionId(value: string | null) {
    this.state$.renamingSessionId.set(value)
  }

  get error(): string | null {
    return this.state$.error.get()
  }

  set error(value: string | null) {
    this.state$.error.set(value)
  }

  openRenameDialog = (): void => {
    const selectedSessionId = this.getSelectedSessionId()

    if (!selectedSessionId) {
      return
    }

    this.renameDraft = this.getSelectedSession()?.title ?? ''
    this.isRenameDialogOpen = true
    this.error = null
  }

  closeRenameDialog = (): void => {
    this.isRenameDialogOpen = false
    this.renameDraft = ''
  }

  setRenameDraft = (value: string): void => {
    this.renameDraft = value
  }

  submitRename = async (): Promise<void> => {
    const selectedSessionId = this.getSelectedSessionId()
    const nextTitle = this.renameDraft.trim()
    const rename = this.sessionApi.rename ?? this.sessionApi.renameViaDaemon

    if (!selectedSessionId || nextTitle.length === 0 || !rename) {
      return
    }

    batch(() => {
      this.renamingSessionId = selectedSessionId
      this.error = null
    })

    try {
      await rename(selectedSessionId, nextTitle)
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
