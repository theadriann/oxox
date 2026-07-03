import { type Observable, observable } from '@legendapp/state'

export interface CompactWorkflowState {
  customInstructionsDraft: string
  compactionModelDraft: string
  isCompactDialogOpen: boolean
  compactingSessionId: string | null
  error: string | null
}

export function createDefaultCompactWorkflowState(): CompactWorkflowState {
  return {
    customInstructionsDraft: '',
    compactionModelDraft: 'current-model',
    isCompactDialogOpen: false,
    compactingSessionId: null,
    error: null,
  }
}

export function createCompactWorkflowState$(): Observable<CompactWorkflowState> {
  return observable(createDefaultCompactWorkflowState())
}
