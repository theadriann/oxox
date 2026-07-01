import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual'

import {
  scrollVirtualizerToEnd,
  shouldAdjustScrollPositionOnItemSizeChange,
} from '../useTranscriptVirtualScroll'

describe('shouldAdjustScrollPositionOnItemSizeChange', () => {
  const measuredAboveViewport: VirtualItem = {
    end: 800,
    index: 4,
    key: 'row-4',
    lane: 0,
    size: 120,
    start: 680,
  }
  const firstVisibleRow: VirtualItem = {
    end: 1120,
    index: 6,
    key: 'row-6',
    lane: 0,
    size: 120,
    start: 1000,
  }
  const createVirtualizer = ({
    isScrolling,
    scrollDirection,
    virtualItems = [firstVisibleRow],
  }: {
    isScrolling: boolean
    scrollDirection: 'forward' | 'backward' | null
    virtualItems?: VirtualItem[]
  }): Virtualizer<HTMLDivElement, HTMLDivElement> =>
    ({
      getVirtualItems: () => virtualItems,
      isScrolling,
      scrollDirection,
      scrollOffset: firstVisibleRow.start,
    }) as Virtualizer<HTMLDivElement, HTMLDivElement>

  it('does not fight first-time upward scrolling corrections', () => {
    expect(
      shouldAdjustScrollPositionOnItemSizeChange(
        measuredAboveViewport,
        -180,
        createVirtualizer({
          isScrolling: false,
          scrollDirection: 'backward',
        }),
      ),
    ).toBe(false)
  })

  it('keeps settled forward/downward anchors stable for above-viewport changes', () => {
    expect(
      shouldAdjustScrollPositionOnItemSizeChange(
        measuredAboveViewport,
        80,
        createVirtualizer({
          isScrolling: false,
          scrollDirection: 'forward',
        }),
      ),
    ).toBe(true)
  })

  it('does not correct rows that are in the visible viewport', () => {
    expect(
      shouldAdjustScrollPositionOnItemSizeChange(
        {
          ...measuredAboveViewport,
          end: 1120,
          index: firstVisibleRow.index,
          start: 1000,
        },
        80,
        createVirtualizer({
          isScrolling: false,
          scrollDirection: 'forward',
        }),
      ),
    ).toBe(false)
  })

  it('preserves the visible anchor for settled hydration measurements above the viewport', () => {
    expect(
      shouldAdjustScrollPositionOnItemSizeChange(
        measuredAboveViewport,
        -88,
        createVirtualizer({
          isScrolling: false,
          scrollDirection: null,
        }),
      ),
    ).toBe(true)
  })
})

describe('scrollVirtualizerToEnd', () => {
  it('scrolls to the real maximum offset so virtualizer paddingEnd is included', () => {
    const scrollToOffset = vi.fn()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0)
        return 0
      }),
    )

    try {
      scrollVirtualizerToEnd(
        {
          scrollToOffset,
        } as unknown as Virtualizer<HTMLDivElement, HTMLDivElement>,
        5,
        'smooth',
      )

      expect(scrollToOffset).toHaveBeenNthCalledWith(1, Number.MAX_SAFE_INTEGER, {
        align: 'start',
        behavior: 'smooth',
      })
      expect(scrollToOffset).toHaveBeenNthCalledWith(2, Number.MAX_SAFE_INTEGER, {
        align: 'start',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
