import { type Observable, observable } from '@legendapp/state'

export interface ComposerFeedback {
  message: string
  tone: 'success' | 'error'
}

export interface FeedbackState {
  feedback: ComposerFeedback | null
}

export function createDefaultFeedbackState(): FeedbackState {
  return {
    feedback: null,
  }
}

export function createFeedbackState$(): Observable<FeedbackState> {
  return observable(createDefaultFeedbackState())
}
