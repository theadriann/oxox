// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useFoundationPoll } from '../useFoundationPoll'

type FoundationChangeEvent = {
  refreshedAt: string
  changes?: { daemon?: { status: string } }
}

function FoundationPollProbe({
  foundationApi,
  foundationStore,
}: {
  foundationApi: {
    onChanged?: (listener: (payload: FoundationChangeEvent) => void) => (() => void) | undefined
  }
  foundationStore: {
    initRuntime: () => Promise<void>
    refresh: () => Promise<void>
    applyUpdate: (payload: FoundationChangeEvent) => void
  }
}) {
  useFoundationPoll({ foundationApi, foundationStore })
  return null
}

describe('useFoundationPoll', () => {
  it('initializes runtime once, refreshes immediately, and applies incremental foundation updates', async () => {
    const foundationStore = {
      initRuntime: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      applyUpdate: vi.fn(),
    }
    const unsubscribe = vi.fn()
    let changeListener: ((payload: FoundationChangeEvent) => void) | undefined
    const foundationApi = {
      onChanged: vi.fn((listener: (payload: FoundationChangeEvent) => void) => {
        changeListener = listener
        return unsubscribe
      }),
    }

    const { unmount } = render(
      <FoundationPollProbe foundationApi={foundationApi} foundationStore={foundationStore} />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(foundationStore.initRuntime).toHaveBeenCalledTimes(1)
    expect(foundationStore.refresh).toHaveBeenCalledTimes(1)
    expect(foundationApi.onChanged).toHaveBeenCalledTimes(1)

    await act(async () => {
      changeListener?.({
        refreshedAt: '2026-04-01T18:00:00.000Z',
        changes: {
          daemon: { status: 'connected' },
        },
      })
      await Promise.resolve()
    })

    expect(foundationStore.refresh).toHaveBeenCalledTimes(1)
    expect(foundationStore.applyUpdate).toHaveBeenCalledWith({
      refreshedAt: '2026-04-01T18:00:00.000Z',
      changes: {
        daemon: { status: 'connected' },
      },
    })

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('falls back to a full refresh when a foundation event does not include incremental changes', async () => {
    const foundationStore = {
      initRuntime: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      applyUpdate: vi.fn(),
    }
    let changeListener: ((payload: FoundationChangeEvent) => void) | undefined

    render(
      <FoundationPollProbe
        foundationApi={{
          onChanged: (listener) => {
            changeListener = listener
            return undefined
          },
        }}
        foundationStore={foundationStore}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      changeListener?.({ refreshedAt: '2026-04-01T18:00:00.000Z' })
      await Promise.resolve()
    })

    expect(foundationStore.refresh).toHaveBeenCalledTimes(2)
    expect(foundationStore.applyUpdate).not.toHaveBeenCalled()
  })
})
