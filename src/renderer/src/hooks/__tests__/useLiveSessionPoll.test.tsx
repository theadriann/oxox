// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { LiveSessionSnapshot } from '../../../../../shared/ipc/contracts'

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

function LiveSessionPollProbe({
  liveSessionStore,
  sessionApi,
}: {
  liveSessionStore: {
    selectedSnapshotId: string | null
    refreshSnapshot: (sessionId: string) => Promise<void>
    upsertSnapshot: (snapshot: LiveSessionSnapshot) => void
  }
  sessionApi: {
    onSnapshotChanged?: (
      listener: (payload: { snapshot: LiveSessionSnapshot }) => void,
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

  it('does not start polling when no live session is selected', () => {
    const liveSessionStore = {
      selectedSnapshotId: null,
      refreshSnapshot: vi.fn().mockResolvedValue(undefined),
      upsertSnapshot: vi.fn(),
    }
    const sessionApi = {
      onSnapshotChanged: vi.fn(),
    }

    render(<LiveSessionPollProbe liveSessionStore={liveSessionStore} sessionApi={sessionApi} />)

    expect(liveSessionStore.refreshSnapshot).not.toHaveBeenCalled()
    expect(sessionApi.onSnapshotChanged).not.toHaveBeenCalled()
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
})
