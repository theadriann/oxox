// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionSidebarConnected } from '../SessionSidebarConnected'
import { SessionSidebarStore } from '../SessionSidebarStore'

describe('SessionSidebarConnected', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        return {
          bottom: 600,
          height: 600,
          left: 0,
          right: 280,
          top: 0,
          width: 280,
          x: 0,
          y: 0,
          toJSON() {
            return {}
          },
        }
      },
    })
  })

  it('accepts an injected SessionSidebarStore and ticks relative time on mount', async () => {
    vi.useFakeTimers()
    const store = new SessionSidebarStore()
    const initialNow = store.now

    render(
      <SessionSidebarConnected
        store={store}
        groups={[]}
        pinnedSessions={[]}
        selectedSessionId=""
        activeCount={0}
        isProjectCollapsed={() => false}
        onToggleProject={() => undefined}
        onSelectSession={() => undefined}
        onTogglePinnedSession={() => undefined}
        onSetProjectDisplayName={() => undefined}
        onNewSession={() => undefined}
        onResizeStart={() => undefined}
      />,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(store.now).toBeGreaterThan(initialNow)
    vi.useRealTimers()
  })
})
