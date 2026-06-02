import { type Observable, observable } from '@legendapp/state'
import type { ComposerState } from './composer.types'

export function createDefaultComposerState(): ComposerState {
  return {
    draft: '',
    error: null,
    preferencesBySessionId: {},
    pendingDraftWorkspacePath: null,
    pendingDraftPreferences: null,
    sendingSessionId: null,
    isPendingDraftSubmitting: false,
    attachingSessionId: null,
    interruptingSessionId: null,
  }
}

export function createComposerState$(): Observable<ComposerState> {
  return observable(createDefaultComposerState())
}
