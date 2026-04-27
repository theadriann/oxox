import { describe, expect, it, vi } from 'vitest'

import { createLiveSessionSnapshotBroadcaster } from '../liveSessionSnapshotBroadcaster'

function createWindow(webContentsId: number) {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      id: webContentsId,
      send: vi.fn(),
    },
  }
}

describe('createLiveSessionSnapshotBroadcaster', () => {
  it('coalesces repeated stream updates so main does not serialize full snapshots per event', async () => {
    vi.useFakeTimers()
    const window = createWindow(1)
    const getSessionSnapshot = vi.fn((sessionId: string) => ({
      sessionId,
      messages: [{ id: 'm-1', content: 'latest content' }],
      events: Array.from({ length: 500 }, (_, index) => ({ type: 'message.delta', index })),
    }))
    const broadcaster = createLiveSessionSnapshotBroadcaster({
      getAllWindows: () => [window],
      getSessionSnapshot,
      isRendererAttachedToSession: () => true,
      schedule: (callback, delay) => setTimeout(callback, delay),
      clearScheduled: (timer) => clearTimeout(timer),
      coalesceWindowMs: 16,
    })

    broadcaster.broadcast({ sessionId: 'session-1' })
    broadcaster.broadcast({ sessionId: 'session-1' })
    broadcaster.broadcast({ sessionId: 'session-1' })

    expect(getSessionSnapshot).not.toHaveBeenCalled()
    expect(window.webContents.send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(16)

    expect(getSessionSnapshot).toHaveBeenCalledTimes(1)
    expect(window.webContents.send).toHaveBeenCalledTimes(1)

    broadcaster.dispose()
    vi.useRealTimers()
  })
})
