import { makeAutoObservable, runInAction } from 'mobx'

export interface RenameSessionApi {
  renameViaDaemon?: (sessionId: string, title: string) => Promise<void>
}

export class RenameWorkflowStore {
  renameDraft = ''
  isRenameDialogOpen = false
  renamingSessionId: string | null = null
  error: string | null = null

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

    makeAutoObservable(
      this,
      {
        getSelectedSessionId: false,
        getSelectedSession: false,
        sessionApi: false,
        onRenamed: false,
      },
      { autoBind: true },
    )
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

    runInAction(() => {
      this.renamingSessionId = selectedSessionId
      this.error = null
    })

    try {
      await this.sessionApi.renameViaDaemon(selectedSessionId, nextTitle)
      await this.onRenamed?.(selectedSessionId, nextTitle)

      runInAction(() => {
        this.closeRenameDialog()
      })
    } catch (error) {
      runInAction(() => {
        this.error =
          error instanceof Error ? error.message : 'Unable to rename the selected session.'
      })
    } finally {
      runInAction(() => {
        this.renamingSessionId = null
      })
    }
  }
}
