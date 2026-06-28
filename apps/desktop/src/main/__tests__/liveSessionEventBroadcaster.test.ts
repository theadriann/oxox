import { describe, expect, it, vi } from 'vitest'

import { IPC_CHANNELS, type LiveSessionEventRecord } from '../../shared/ipc/contracts'
import { createLiveSessionEventBroadcaster } from '../liveSessionEventBroadcaster'

function createWindow(webContentsId: number) {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      id: webContentsId,
      send: vi.fn(),
    },
  }
}

function delta(messageId: string, text: string): LiveSessionEventRecord {
  return {
    type: 'message.delta',
    messageId,
    delta: text,
    channel: 'assistant',
  }
}

describe('createLiveSessionEventBroadcaster', () => {
  it('coalesces event bursts into ordered delta batches without snapshot serialization', async () => {
    vi.useFakeTimers()
    const attachedWindow = createWindow(1)
    const detachedWindow = createWindow(2)
    const broadcaster = createLiveSessionEventBroadcaster({
      getAllWindows: () => [attachedWindow, detachedWindow],
      isRendererAttachedToSession: (webContentsId, sessionId) =>
        webContentsId === 1 && sessionId === 'session-1',
      schedule: (callback, delay) => setTimeout(callback, delay),
      clearScheduled: (timer) => clearTimeout(timer),
      coalesceWindowMs: 8,
    })

    broadcaster.broadcast({ sessionId: 'session-1', event: delta('assistant-1', 'Hel') })
    broadcaster.broadcast({ sessionId: 'session-1', event: delta('assistant-1', 'lo') })
    broadcaster.broadcast({ sessionId: 'session-2', event: delta('assistant-2', 'ignored') })

    expect(attachedWindow.webContents.send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(8)

    expect(attachedWindow.webContents.send).toHaveBeenCalledTimes(1)
    expect(attachedWindow.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.sessionEventBatch, {
      sessionId: 'session-1',
      sequenceStart: 1,
      sequenceEnd: 2,
      events: [delta('assistant-1', 'Hel'), delta('assistant-1', 'lo')],
    })
    expect(detachedWindow.webContents.send).not.toHaveBeenCalled()

    broadcaster.dispose()
    vi.useRealTimers()
  })
})
