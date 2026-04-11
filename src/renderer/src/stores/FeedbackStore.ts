import { makeAutoObservable } from 'mobx'

export interface ComposerFeedback {
  message: string
  tone: 'success' | 'error'
}

export class FeedbackStore {
  feedback: ComposerFeedback | null = null
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    makeAutoObservable(this, { feedbackTimer: false }, { autoBind: true })
  }

  showFeedback(message: string, tone: ComposerFeedback['tone'] = 'success'): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer)
    }

    this.feedback = { message, tone }
    this.feedbackTimer = setTimeout(() => {
      this.dismissFeedback()
    }, 2_500)
  }

  dismissFeedback(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer)
      this.feedbackTimer = null
    }

    this.feedback = null
  }

  dispose(): void {
    this.dismissFeedback()
  }
}
