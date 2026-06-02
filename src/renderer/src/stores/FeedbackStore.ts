import { type Observable, observable } from '@legendapp/state'

export interface ComposerFeedback {
  message: string
  tone: 'success' | 'error'
}

interface FeedbackState {
  feedback: ComposerFeedback | null
}

export class FeedbackStore {
  readonly state$: Observable<FeedbackState> = observable({
    feedback: null,
  })
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null

  get feedback(): ComposerFeedback | null {
    return this.state$.feedback.get()
  }

  set feedback(value: ComposerFeedback | null) {
    this.state$.feedback.set(value)
  }

  showFeedback = (message: string, tone: ComposerFeedback['tone'] = 'success'): void => {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer)
    }

    this.feedback = { message, tone }
    this.feedbackTimer = setTimeout(() => {
      this.dismissFeedback()
    }, 2_500)
  }

  dismissFeedback = (): void => {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer)
      this.feedbackTimer = null
    }

    this.feedback = null
  }

  dispose = (): void => {
    this.dismissFeedback()
  }
}
