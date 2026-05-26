// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  LiveSessionEventBatchPayload,
  LiveSessionSnapshot,
  SessionRecord,
} from '../../../../../shared/ipc/contracts'
import { LiveSessionStore } from '../../stores/LiveSessionStore'
import { SessionStore } from '../../stores/SessionStore'
import { createStoreEventBus } from '../../stores/storeEventBus'

import { useLiveSessionPoll } from '../useLiveSessionPoll'

function createSnapshot(sessionId: string): LiveSessionSnapshot {
  return {
    sessionId,
    title: 'Live session',
    status: 'active',
    transport: 'stream-jsonrpc',
    processId: 42,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/workspace',
    parentSessionId: null,
    availableModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
    settings: {
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
    },
    messages: [],
    events: [],
  }
}

function createSessionRecord(): SessionRecord {
  return {
    id: 'session-live-1',
    projectId: 'project-live',
    projectWorkspacePath: '/tmp/workspace',
    projectDisplayName: 'Factory Desktop',
    modelId: 'gpt-5.4',
    parentSessionId: null,
    derivationType: null,
    title: 'Live session',
    status: 'active',
    transport: 'stream-jsonrpc',
    createdAt: '2026-05-16T00:00:00.000Z',
    lastActivityAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  }
}

function LiveSessionPollProbe({
  liveSessionStore,
  sessionApi,
}: {
  liveSessionStore: {
    selectedSnapshotId: string | null
    refreshSnapshot: (sessionId: string) => Promise<void>
    upsertSnapshot: (snapshot: LiveSessionSnapshot) => void
    applyEventBatch?: (payload: LiveSessionEventBatchPayload) => void
  }
  sessionApi: {
    onSnapshotChanged?: (
      listener: (payload: { snapshot: LiveSessionSnapshot }) => void,
    ) => (() => void) | undefined
    onEventBatch?: (
      listener: (payload: LiveSessionEventBatchPayload) => void,
    ) => (() => void) | undefined
  }
}) {
  useLiveSessionPoll({ liveSessionStore, sessionApi })
  return null
}

describe('useLiveSessionPoll', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('refreshes the selected live session immediately and applies matching snapshot events', async () => {
    const liveSessionStore = {
      selectedSnapshotId: 'session-live-1',
      refreshSnapshot: vi.fn().mockResolvedValue(undefined),
      upsertSnapshot: vi.fn(),
    }
    let snapshotListener: ((payload: { snapshot: LiveSessionSnapshot }) => void) | undefined
    const sessionApi = {
      onSnapshotChanged: vi.fn((listener) => {
        snapshotListener = listener
        return undefined
      }),
    }

    render(<LiveSessionPollProbe liveSessionStore={liveSessionStore} sessionApi={sessionApi} />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(liveSessionStore.refreshSnapshot).toHaveBeenCalledWith('session-live-1')
    expect(liveSessionStore.refreshSnapshot).toHaveBeenCalledTimes(1)

    await act(async () => {
      snapshotListener?.({ snapshot: createSnapshot('session-live-2') })
      snapshotListener?.({ snapshot: createSnapshot('session-live-1') })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(liveSessionStore.upsertSnapshot).toHaveBeenCalledTimes(1)
    expect(liveSessionStore.upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-live-1' }),
    )
  })

  it('does not refresh or apply events when no live session is selected', async () => {
    const liveSessionStore = {
      selectedSnapshotId: null,
      refreshSnapshot: vi.fn().mockResolvedValue(undefined),
      upsertSnapshot: vi.fn(),
      applyEventBatch: vi.fn(),
    }
    let eventBatchListener: ((payload: LiveSessionEventBatchPayload) => void) | undefined
    const sessionApi = {
      onSnapshotChanged: vi.fn(),
      onEventBatch: vi.fn((listener) => {
        eventBatchListener = listener
        return undefined
      }),
    }

    render(<LiveSessionPollProbe liveSessionStore={liveSessionStore} sessionApi={sessionApi} />)
    await act(async () => {
      eventBatchListener?.({
        sessionId: 'session-live-1',
        sequenceStart: 1,
        sequenceEnd: 1,
        events: [{ type: 'message.delta', messageId: 'assistant-1', delta: 'ignored' }],
      })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(liveSessionStore.refreshSnapshot).not.toHaveBeenCalled()
    expect(liveSessionStore.upsertSnapshot).not.toHaveBeenCalled()
    expect(liveSessionStore.applyEventBatch).not.toHaveBeenCalled()
  })

  it('coalesces high-frequency matching snapshot updates to the latest frame', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(16), 16)),
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((handle: number) => window.clearTimeout(handle)),
    )

    const liveSessionStore = {
      selectedSnapshotId: 'session-live-1',
      refreshSnapshot: vi.fn().mockResolvedValue(undefined),
      upsertSnapshot: vi.fn(),
    }
    let snapshotListener: ((payload: { snapshot: LiveSessionSnapshot }) => void) | undefined
    const sessionApi = {
      onSnapshotChanged: vi.fn((listener) => {
        snapshotListener = listener
        return undefined
      }),
    }

    render(<LiveSessionPollProbe liveSessionStore={liveSessionStore} sessionApi={sessionApi} />)

    await act(async () => {
      snapshotListener?.({
        snapshot: { ...createSnapshot('session-live-1'), title: 'first streaming chunk' },
      })
      snapshotListener?.({
        snapshot: { ...createSnapshot('session-live-1'), title: 'second streaming chunk' },
      })
      snapshotListener?.({
        snapshot: { ...createSnapshot('session-live-1'), title: 'final streaming chunk' },
      })
      await Promise.resolve()
    })

    expect(liveSessionStore.upsertSnapshot).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16)
    })

    expect(liveSessionStore.upsertSnapshot).toHaveBeenCalledTimes(1)
    expect(liveSessionStore.upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'final streaming chunk' }),
    )
  })

  it('coalesces matching event batches without dropping streamed deltas', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(16), 16)),
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((handle: number) => window.clearTimeout(handle)),
    )

    const liveSessionStore = {
      selectedSnapshotId: 'session-live-1',
      refreshSnapshot: vi.fn().mockResolvedValue(undefined),
      upsertSnapshot: vi.fn(),
      applyEventBatch: vi.fn(),
    }
    let eventBatchListener: ((payload: LiveSessionEventBatchPayload) => void) | undefined
    const sessionApi = {
      onSnapshotChanged: vi.fn(),
      onEventBatch: vi.fn((listener) => {
        eventBatchListener = listener
        return undefined
      }),
    }

    render(<LiveSessionPollProbe liveSessionStore={liveSessionStore} sessionApi={sessionApi} />)

    await act(async () => {
      eventBatchListener?.({
        sessionId: 'session-live-1',
        sequenceStart: 1,
        sequenceEnd: 1,
        events: [{ type: 'message.delta', messageId: 'assistant-1', delta: 'Hel' }],
      })
      eventBatchListener?.({
        sessionId: 'session-live-2',
        sequenceStart: 1,
        sequenceEnd: 1,
        events: [{ type: 'message.delta', messageId: 'assistant-2', delta: 'ignored' }],
      })
      eventBatchListener?.({
        sessionId: 'session-live-1',
        sequenceStart: 2,
        sequenceEnd: 2,
        events: [{ type: 'message.delta', messageId: 'assistant-1', delta: 'lo' }],
      })
      await Promise.resolve()
    })

    expect(liveSessionStore.applyEventBatch).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16)
    })

    expect(liveSessionStore.applyEventBatch).toHaveBeenCalledTimes(1)
    expect(liveSessionStore.applyEventBatch).toHaveBeenCalledWith({
      sessionId: 'session-live-1',
      sequenceStart: 1,
      sequenceEnd: 2,
      events: [
        { type: 'message.delta', messageId: 'assistant-1', delta: 'Hel' },
        { type: 'message.delta', messageId: 'assistant-1', delta: 'lo' },
      ],
    })
  })

  it('does not resubscribe when live snapshot state changes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(16), 16)),
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((handle: number) => window.clearTimeout(handle)),
    )

    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])
    sessionStore.selectSession('session-live-1')

    const liveSessionStore = new LiveSessionStore(
      () => sessionStore.selectedSessionId || null,
      createStoreEventBus(),
      async () => createSnapshot('session-live-1'),
    )
    liveSessionStore.upsertSnapshot(createSnapshot('session-live-1'))

    let eventBatchListener: ((payload: LiveSessionEventBatchPayload) => void) | undefined
    const sessionApi = {
      onSnapshotChanged: vi.fn(() => undefined),
      onEventBatch: vi.fn((listener) => {
        eventBatchListener = listener
        return vi.fn()
      }),
    }

    render(<LiveSessionPollProbe liveSessionStore={liveSessionStore} sessionApi={sessionApi} />)

    await act(async () => {
      eventBatchListener?.({
        sessionId: 'session-live-1',
        sequenceStart: 1,
        sequenceEnd: 1,
        events: [{ type: 'message.delta', messageId: 'assistant-1', delta: 'Hello' }],
      })
      await vi.advanceTimersByTimeAsync(16)
    })

    expect(sessionApi.onEventBatch).toHaveBeenCalledTimes(1)
  })
})
