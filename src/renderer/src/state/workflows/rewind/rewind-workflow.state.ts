import { type Observable, observable } from '@legendapp/state'
import type { LiveSessionRewindInfo } from '../../../../../shared/ipc/contracts'

export interface RewindWorkflowState {
  rewindMessageId: string
  rewindForkTitle: string
  rewindInfo: LiveSessionRewindInfo | null
  rewindError: string | null
  isRewindDialogOpen: boolean
  loadingRewindSessionId: string | null
  rewindingSessionId: string | null
  selectedRestoreFilePaths: string[]
  selectedDeleteFilePaths: string[]
}

export function createDefaultRewindWorkflowState(): RewindWorkflowState {
  return {
    rewindMessageId: '',
    rewindForkTitle: '',
    rewindInfo: null,
    rewindError: null,
    isRewindDialogOpen: false,
    loadingRewindSessionId: null,
    rewindingSessionId: null,
    selectedRestoreFilePaths: [],
    selectedDeleteFilePaths: [],
  }
}

export function createRewindWorkflowState$(): Observable<RewindWorkflowState> {
  return observable(createDefaultRewindWorkflowState())
}
