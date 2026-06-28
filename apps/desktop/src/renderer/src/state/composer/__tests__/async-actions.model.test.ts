// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AsyncActionsStore } from '../async-actions.model'

describe('AsyncActionsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks running, successful, and failed background actions', () => {
    const store = new AsyncActionsStore()

    const firstId = store.startAction('Creating fork', '[Fork] Alpha')
    const secondId = store.startAction('Renaming session')

    expect(store.actions).toMatchObject([
      {
        id: firstId,
        title: 'Creating fork',
        description: '[Fork] Alpha',
        status: 'running',
      },
      {
        id: secondId,
        title: 'Renaming session',
        description: null,
        status: 'running',
      },
    ])

    store.completeAction(firstId, 'Fork created', '[Fork] Alpha')
    store.failAction(secondId, 'Rename failed', 'Could not rename')

    expect(store.actions).toMatchObject([
      {
        id: firstId,
        title: 'Fork created',
        description: '[Fork] Alpha',
        status: 'success',
      },
      {
        id: secondId,
        title: 'Rename failed',
        description: 'Could not rename',
        status: 'error',
      },
    ])

    vi.advanceTimersByTime(4_000)

    expect(store.actions).toHaveLength(1)
    expect(store.actions[0]?.id).toBe(secondId)
  })
})
