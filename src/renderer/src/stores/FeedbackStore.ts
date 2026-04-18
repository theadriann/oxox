import { bindMethods, observable, readField, writeField } from './legend'

export interface ComposerFeedback {
  message: string
  tone: 'success' | 'error'
}

export class FeedbackStore {
  readonly stateNode = observable({
    feedback: null as ComposerFeedback | null,
  })
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    bindMethods(this)
  }

  get feedback(): ComposerFeedback | null {
    return readField(this.stateNode, 'feedback')
  }

  set feedback(value: ComposerFeedback | null) {
    writeField(this.stateNode, 'feedback', value)
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
