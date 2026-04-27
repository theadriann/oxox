import { describe, expect, it, vi } from 'vitest'

import { createLiveSessionSearchIndexScheduler } from '../search/liveSessionSearchIndexScheduler'

describe('createLiveSessionSearchIndexScheduler', () => {
  it('coalesces active stream updates before reading and indexing the full snapshot', async () => {
    vi.useFakeTimers()
    const snapshot = { sessionId: 'session-1' }
    const getSessionSnapshot = vi.fn(() => snapshot)
    const scheduleLiveSnapshotUpdate = vi.fn()
    const scheduler = createLiveSessionSearchIndexScheduler({
      getSessionSnapshot,
      scheduleLiveSnapshotUpdate,
      debounceMs: 25,
    })

    scheduler.schedule('session-1')
    scheduler.schedule('session-1')
    scheduler.schedule('session-1')

    expect(getSessionSnapshot).not.toHaveBeenCalled()
    expect(scheduleLiveSnapshotUpdate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(25)

    expect(getSessionSnapshot).toHaveBeenCalledTimes(1)
    expect(scheduleLiveSnapshotUpdate).toHaveBeenCalledWith(snapshot)

    scheduler.dispose()
    vi.useRealTimers()
  })
})
