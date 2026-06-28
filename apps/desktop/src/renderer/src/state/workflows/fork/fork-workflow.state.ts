import { type Observable, observable } from '@legendapp/state'

export interface ForkWorkflowState {
  forkDraft: string
  isForkDialogOpen: boolean
  forkingSessionId: string | null
  error: string | null
}

export function createDefaultForkWorkflowState(): ForkWorkflowState {
  return {
    forkDraft: '',
    isForkDialogOpen: false,
    forkingSessionId: null,
    error: null,
  }
}

export function createForkWorkflowState$(): Observable<ForkWorkflowState> {
  return observable(createDefaultForkWorkflowState())
}
