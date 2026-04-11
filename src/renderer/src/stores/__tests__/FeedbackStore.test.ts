// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedbackStore } from '../FeedbackStore'

describe('FeedbackStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows feedback with a default success tone and auto-dismisses after 2500ms', () => {
    const store = new FeedbackStore()

    store.showFeedback('Saved')

    expect(store.feedback).toEqual({ message: 'Saved', tone: 'success' })

    vi.advanceTimersByTime(2_500)

    expect(store.feedback).toBeNull()
  })

  it('shows error feedback and allows manual dismissal', () => {
    const store = new FeedbackStore()

    store.showFeedback('Failed', 'error')

    expect(store.feedback).toEqual({ message: 'Failed', tone: 'error' })

    store.dismissFeedback()

    expect(store.feedback).toBeNull()
  })

  it('replaces existing feedback and resets the auto-dismiss timer', () => {
    const store = new FeedbackStore()

    store.showFeedback('First')
    vi.advanceTimersByTime(1_000)
    store.showFeedback('Second')

    vi.advanceTimersByTime(1_500)

    expect(store.feedback).toEqual({ message: 'Second', tone: 'success' })

    vi.advanceTimersByTime(1_000)

    expect(store.feedback).toBeNull()
  })

  it('clears pending timer on dispose', () => {
    const store = new FeedbackStore()

    store.showFeedback('Pending')
    store.dispose()

    expect(store.feedback).toBeNull()
  })
})
