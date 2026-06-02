import { type Observable, observable } from '@legendapp/state'

export interface RenameWorkflowState {
  renameDraft: string
  isRenameDialogOpen: boolean
  renamingSessionId: string | null
  error: string | null
}

export function createDefaultRenameWorkflowState(): RenameWorkflowState {
  return {
    renameDraft: '',
    isRenameDialogOpen: false,
    renamingSessionId: null,
    error: null,
  }
}

export function createRenameWorkflowState$(): Observable<RenameWorkflowState> {
  return observable(createDefaultRenameWorkflowState())
}
