import {
  elementScroll,
  measureElement as measureVirtualElement,
  useVirtualizer,
  type VirtualItem,
  type Virtualizer,
} from '@tanstack/react-virtual'
import {
  type MutableRefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type {
  SessionSearchTarget,
  SessionTranscriptScrollState,
} from '../../../../shared/ipc/contracts'
import { createTranscriptMeasurementCache } from './transcriptMeasurementCache'
import {
  isTranscriptScrollDebugEnabled,
  recordTranscriptMeasurementDebug,
  recordTranscriptScrollEvent,
  recordTranscriptScrollTo,
} from './transcriptScrollDebug'
import {
  getScrollOffsetRatio,
  getTranscriptScrollRequestKey,
  type TranscriptScrollRequest,
  toVirtualizerAlign,
} from './transcriptScrollTarget'
import {
  isTranscriptSizeProfilingEnabled,
  recordTranscriptRowSizeProfile,
} from './transcriptSizeProfile'

export type TranscriptVirtualRow = Pick<VirtualItem, 'index' | 'key' | 'start'>

const SCROLLING_RESET_DELAY_MS = 120

interface UseTranscriptVirtualScrollOptions<TItem> {
  items: TItem[]
  scrollContextKey: string
  scrollToBottomSignal: number
  scrollPersistenceEnabled: boolean
  scrollRestoreState: SessionTranscriptScrollState | null
  searchTarget?: SessionSearchTarget | null
  scrollTargetRequest?: TranscriptScrollRequest | null
  latestTimelineMarker?: string
  overscan: number
  endPaddingPx?: number
  primaryActionRef?: MutableRefObject<HTMLElement | null>
  estimateSize: (item: TItem | undefined) => number
  getItemKey: (item: TItem | undefined, index: number) => string | number
  findSearchTargetIndex: (items: TItem[], target: SessionSearchTarget) => number
  findScrollTargetIndex?: (items: TItem[], request: TranscriptScrollRequest) => number
  onScrollStateChange?: (state: SessionTranscriptScrollState) => void
}

export function useTranscriptVirtualScroll<TItem>({
  items,
  scrollContextKey,
  scrollToBottomSignal,
  scrollPersistenceEnabled,
  scrollRestoreState,
  searchTarget,
  scrollTargetRequest,
  latestTimelineMarker,
  overscan,
  endPaddingPx = 0,
  primaryActionRef,
  estimateSize,
  getItemKey,
  findSearchTargetIndex,
  findScrollTargetIndex,
  onScrollStateChange,
}: UseTranscriptVirtualScrollOptions<TItem>) {
  const [showJumpButton, setShowJumpButton] = useState(false)
  const showJumpButtonRef = useRef(false)
  const autoScrollRef = useRef(true)
  const isAtBottomRef = useRef(true)
  const isProgrammaticScrollRef = useRef(false)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const lastScrollContextKeyRef = useRef(scrollContextKey)
  const scrollStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingScrollStateRef = useRef<SessionTranscriptScrollState | null>(null)
  const initialScrollDoneRef = useRef(false)
  const appliedScrollRestoreKeyRef = useRef<string | null>(null)
  const prevTimelineMarkerRef = useRef(latestTimelineMarker)
  const lastConsumedScrollSignalRef = useRef(scrollToBottomSignal)
  const appliedSearchTargetRef = useRef<string | null>(null)
  const appliedScrollTargetRef = useRef<string | null>(null)
  const lastObservedScrollTopRef = useRef<number | null>(null)
  const measurementCacheInputsRef = useRef({
    estimateSize,
    getItemKey,
    scrollContextKey,
  })
  const measurementCacheRef = useRef(
    createTranscriptMeasurementCache({
      estimateSize,
      getItemKey,
    }),
  )

  if (
    measurementCacheInputsRef.current.estimateSize !== estimateSize ||
    measurementCacheInputsRef.current.getItemKey !== getItemKey ||
    measurementCacheInputsRef.current.scrollContextKey !== scrollContextKey
  ) {
    measurementCacheInputsRef.current = { estimateSize, getItemKey, scrollContextKey }
    measurementCacheRef.current = createTranscriptMeasurementCache({
      estimateSize,
      getItemKey,
    })
  }

  const measureElement = useCallback(
    (
      element: HTMLDivElement,
      entry: ResizeObserverEntry | undefined,
      instance: Virtualizer<HTMLDivElement, HTMLDivElement>,
    ) => {
      const measuredSize = measureVirtualElement(element, entry, instance)
      const index = instance.indexFromElement(element)
      const item = items[index]
      const key = measurementCacheRef.current.keyFor(item, index)
      const cachedSize = measurementCacheRef.current.get(key)
      const estimate = cachedSize ?? estimateSize(item)
      const delta = measuredSize - estimate
      if (isTranscriptScrollDebugEnabled()) {
        recordTranscriptMeasurementDebug({
          contextKey: scrollContextKey,
          delta,
          element,
          estimate,
          index,
          isScrolling: instance.isScrolling,
          key,
          measured: measuredSize,
          previous: cachedSize ?? null,
          scrollDirection: instance.scrollDirection,
          scrollOffset: instance.scrollOffset,
        })
      }

      if (isTranscriptSizeProfilingEnabled()) {
        recordTranscriptRowSizeProfile({
          contextKey: scrollContextKey,
          element,
          estimate,
          index,
          key,
          measured: measuredSize,
          virtualizer: instance,
        })
      }
      measurementCacheRef.current.record(item, index, measuredSize)
      return measuredSize
    },
    [estimateSize, items, scrollContextKey],
  )

  const scrollToFn = useCallback(
    (
      toOffset: number,
      options: { adjustments?: number; behavior?: ScrollBehavior },
      instance: Virtualizer<HTMLDivElement, HTMLDivElement>,
    ) => {
      recordTranscriptScrollTo({
        adjustments: options.adjustments,
        behavior: options.behavior,
        contextKey: scrollContextKey,
        instance,
        toOffset,
      })
      elementScroll(toOffset, options, instance)
    },
    [scrollContextKey],
  )

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: items.length,
    getItemKey: (index) => getItemKey(items[index], index),
    getScrollElement: () => scrollAreaRef.current,
    initialRect: { height: 640, width: 960 },
    initialOffset: () =>
      scrollPersistenceEnabled && scrollRestoreState
        ? scrollRestoreState.scrollTop
        : Number.MAX_SAFE_INTEGER,
    estimateSize: (index) => measurementCacheRef.current.estimate(items[index], index),
    isScrollingResetDelay: SCROLLING_RESET_DELAY_MS,
    measureElement,
    overscan,
    paddingEnd: endPaddingPx,
    scrollToFn,
  })

  virtualizer.shouldAdjustScrollPositionOnItemSizeChange =
    shouldAdjustScrollPositionOnItemSizeChange

  const virtualItems = virtualizer.getVirtualItems()
  const fallbackEstimatedTotalHeight = estimateTotalHeight(
    items,
    (item, index) => measurementCacheRef.current.estimate(item, index),
    endPaddingPx,
  )
  const virtualizedTotalHeight = virtualizer.getTotalSize()
  const estimatedTotalHeight =
    virtualizedTotalHeight > endPaddingPx ? virtualizedTotalHeight : fallbackEstimatedTotalHeight
  const rowsToRender =
    virtualItems.length > 0
      ? virtualItems
      : createFallbackVirtualRows(
          items,
          (item, index) => measurementCacheRef.current.estimate(item, index),
          getItemKey,
        )

  const setScrollElement = useCallback(
    (el: HTMLDivElement | null) => {
      scrollAreaRef.current = el
      lastObservedScrollTopRef.current = el?.scrollTop ?? null
      if (primaryActionRef) primaryActionRef.current = el
    },
    [primaryActionRef],
  )

  const flushScrollState = useCallback(() => {
    if (!scrollPersistenceEnabled || !onScrollStateChange) return

    const pendingState = pendingScrollStateRef.current
    if (!pendingState) return

    pendingScrollStateRef.current = null
    onScrollStateChange(pendingState)
  }, [onScrollStateChange, scrollPersistenceEnabled])

  const scheduleScrollStateSave = useCallback(() => {
    if (!scrollPersistenceEnabled || !onScrollStateChange) return
    if (scrollStateTimerRef.current) clearTimeout(scrollStateTimerRef.current)
    scrollStateTimerRef.current = setTimeout(flushScrollState, 250)
  }, [flushScrollState, onScrollStateChange, scrollPersistenceEnabled])

  const setJumpButtonVisible = useCallback((visible: boolean) => {
    if (showJumpButtonRef.current === visible) return

    showJumpButtonRef.current = visible
    setShowJumpButton(visible)
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current
    if (!el) return
    const previousScrollTop = lastObservedScrollTopRef.current
    const scrollDelta = previousScrollTop === null ? 0 : el.scrollTop - previousScrollTop
    lastObservedScrollTopRef.current = el.scrollTop

    if (scrollDelta !== 0) {
      recordTranscriptScrollEvent({
        contextKey: scrollContextKey,
        delta: scrollDelta,
        element: el,
        isProgrammatic: isProgrammaticScrollRef.current,
      })
    }

    const atBottom = isScrolledToBottom(el)
    isAtBottomRef.current = atBottom
    autoScrollRef.current = atBottom

    setJumpButtonVisible(!atBottom)

    if (!isProgrammaticScrollRef.current) {
      pendingScrollStateRef.current = readTranscriptScrollState(el, scrollContextKey)
      scheduleScrollStateSave()
    }
  }, [scheduleScrollStateSave, scrollContextKey, setJumpButtonVisible])

  const scrollToLatest = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      isProgrammaticScrollRef.current = true
      scrollVirtualizerToEnd(virtualizer, items.length, behavior)
      isAtBottomRef.current = true
      autoScrollRef.current = true
      setJumpButtonVisible(false)
      window.setTimeout(() => {
        isProgrammaticScrollRef.current = false
      }, 250)
    },
    [items.length, setJumpButtonVisible, virtualizer],
  )

  const navigateToRow = useCallback(
    (
      rowIndex: number,
      options: {
        align?: TranscriptScrollRequest['align']
        behavior?: ScrollBehavior
      } = {},
    ) => {
      autoScrollRef.current = false
      isAtBottomRef.current = false
      isProgrammaticScrollRef.current = true
      initialScrollDoneRef.current = true
      setJumpButtonVisible(true)
      virtualizer.scrollToIndex(rowIndex, {
        align: toVirtualizerAlign(options.align),
        behavior: options.behavior,
      })
      correctScrollToOffsetRatio({
        align: options.align,
        behavior: options.behavior,
        rowIndex,
        virtualizer,
        scrollAreaRef,
      })
      window.setTimeout(() => {
        isProgrammaticScrollRef.current = false
      }, 250)
    },
    [setJumpButtonVisible, virtualizer],
  )

  useLayoutEffect(() => {
    if (lastScrollContextKeyRef.current === scrollContextKey) return
    lastScrollContextKeyRef.current = scrollContextKey
    isAtBottomRef.current = true
    autoScrollRef.current = true
    initialScrollDoneRef.current = false
    appliedScrollRestoreKeyRef.current = null
    appliedScrollTargetRef.current = null
    pendingScrollStateRef.current = null
    lastObservedScrollTopRef.current = null
    setJumpButtonVisible(false)
  }, [scrollContextKey, setJumpButtonVisible])

  useLayoutEffect(() => {
    return () => {
      if (scrollStateTimerRef.current) clearTimeout(scrollStateTimerRef.current)
      flushScrollState()
    }
  }, [flushScrollState])

  useLayoutEffect(() => {
    if (
      !scrollPersistenceEnabled ||
      !scrollRestoreState ||
      searchTarget ||
      scrollTargetRequest ||
      items.length === 0
    ) {
      return
    }

    const latestRenderedRow = rowsToRender.at(-1)
    if (!latestRenderedRow) return

    const restoreKey = getScrollRestoreKey(scrollRestoreState)
    if (appliedScrollRestoreKeyRef.current === restoreKey) return

    const el = scrollAreaRef.current
    const targetTop = el
      ? getRestoredScrollTop(el, scrollRestoreState)
      : scrollRestoreState.scrollTop
    isProgrammaticScrollRef.current = true
    virtualizer.scrollToOffset(targetTop, { align: 'start' })
    appliedScrollRestoreKeyRef.current = restoreKey
    initialScrollDoneRef.current = true
    isAtBottomRef.current = scrollRestoreState.isAtBottom
    autoScrollRef.current = scrollRestoreState.isAtBottom
    setJumpButtonVisible(!scrollRestoreState.isAtBottom)
    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false
    }, 250)
  }, [
    items.length,
    rowsToRender,
    scrollPersistenceEnabled,
    scrollRestoreState,
    searchTarget,
    scrollTargetRequest,
    setJumpButtonVisible,
    virtualizer,
  ])

  useLayoutEffect(() => {
    const latestRenderedRow = rowsToRender.at(-1)
    if (
      initialScrollDoneRef.current ||
      searchTarget ||
      scrollTargetRequest ||
      (scrollPersistenceEnabled && scrollRestoreState) ||
      !autoScrollRef.current ||
      items.length === 0 ||
      !latestRenderedRow
    ) {
      return
    }

    const el = scrollAreaRef.current
    if (!el) return

    isProgrammaticScrollRef.current = true
    scrollVirtualizerToEnd(virtualizer, items.length)

    if (isScrolledToBottom(el)) {
      initialScrollDoneRef.current = true
    }
    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false
      const element = scrollAreaRef.current
      if (element) {
        isAtBottomRef.current = isScrolledToBottom(element)
      }
    }, 250)
  }, [
    items.length,
    rowsToRender,
    scrollPersistenceEnabled,
    scrollRestoreState,
    searchTarget,
    scrollTargetRequest,
    virtualizer,
  ])

  useLayoutEffect(() => {
    if (!latestTimelineMarker || !autoScrollRef.current || items.length === 0) return
    if (prevTimelineMarkerRef.current === latestTimelineMarker) return
    prevTimelineMarkerRef.current = latestTimelineMarker

    scrollToLatest()
  }, [items.length, latestTimelineMarker, scrollToLatest])

  useLayoutEffect(() => {
    if (scrollToBottomSignal === lastConsumedScrollSignalRef.current) return
    lastConsumedScrollSignalRef.current = scrollToBottomSignal

    scrollToLatest()
    initialScrollDoneRef.current = true
  }, [scrollToBottomSignal, scrollToLatest])

  const searchTargetKey = searchTarget ? getSearchTargetKey(searchTarget, scrollContextKey) : null
  const scrollTargetKey = getTranscriptScrollRequestKey(scrollTargetRequest)

  useLayoutEffect(() => {
    if (!searchTarget || items.length === 0) return
    if (appliedSearchTargetRef.current === searchTargetKey) return

    const targetIndex = findSearchTargetIndex(items, searchTarget)
    if (targetIndex < 0) return

    appliedSearchTargetRef.current = searchTargetKey
    navigateToRow(targetIndex)

    let frame = 0
    let attempts = 0
    const scrollTargetIntoView = () => {
      isProgrammaticScrollRef.current = true
      virtualizer.scrollToIndex(targetIndex, { align: 'center' })
      attempts += 1
      if (attempts < 4) {
        frame = requestAnimationFrame(scrollTargetIntoView)
      }
    }

    frame = requestAnimationFrame(scrollTargetIntoView)

    return () => cancelAnimationFrame(frame)
  }, [findSearchTargetIndex, items, navigateToRow, searchTarget, searchTargetKey, virtualizer])

  useLayoutEffect(() => {
    if (!scrollTargetRequest || !findScrollTargetIndex || items.length === 0) return
    if (appliedScrollTargetRef.current === scrollTargetKey) return

    const targetIndex = findScrollTargetIndex(items, scrollTargetRequest)
    if (targetIndex < 0) return

    appliedScrollTargetRef.current = scrollTargetKey
    navigateToRow(targetIndex, {
      align: scrollTargetRequest.align,
      behavior: scrollTargetRequest.behavior,
    })

    let frame = 0
    let attempts = 0
    const correctTargetPosition = () => {
      correctScrollToOffsetRatio({
        align: scrollTargetRequest.align,
        behavior: scrollTargetRequest.behavior,
        rowIndex: targetIndex,
        virtualizer,
        scrollAreaRef,
      })
      attempts += 1
      if (attempts < 4) {
        frame = requestAnimationFrame(correctTargetPosition)
      }
    }

    frame = requestAnimationFrame(correctTargetPosition)

    return () => cancelAnimationFrame(frame)
  }, [
    findScrollTargetIndex,
    items,
    navigateToRow,
    scrollTargetKey,
    scrollTargetRequest,
    virtualizer,
  ])

  return useMemo(
    () => ({
      estimatedTotalHeight,
      handleScroll,
      measureElement: virtualizer.measureElement,
      navigateToRow,
      rowsToRender,
      scrollAreaRef,
      scrollToLatest,
      setScrollElement,
      showJumpButton,
      virtualizer,
    }),
    [
      estimatedTotalHeight,
      handleScroll,
      navigateToRow,
      rowsToRender,
      scrollToLatest,
      setScrollElement,
      showJumpButton,
      virtualizer,
    ],
  )
}

function estimateTotalHeight<TItem>(
  items: TItem[],
  estimateSize: (item: TItem | undefined, index: number) => number,
  endPaddingPx = 0,
): number {
  return items.reduce((total, item, index) => total + estimateSize(item, index), endPaddingPx)
}

function createFallbackVirtualRows<TItem>(
  items: TItem[],
  estimateSize: (item: TItem | undefined, index: number) => number,
  getItemKey: (item: TItem | undefined, index: number) => string | number,
): TranscriptVirtualRow[] {
  let nextStart = 0

  return items.slice(0, Math.min(items.length, 12)).map((item, index) => {
    const row = {
      index,
      key: getItemKey(item, index),
      start: nextStart,
    }

    nextStart += estimateSize(item, index)
    return row
  })
}

export function shouldAdjustScrollPositionOnItemSizeChange(
  item: VirtualItem,
  _delta: number,
  instance: Virtualizer<HTMLDivElement, HTMLDivElement>,
): boolean {
  const firstVisible = instance.getVirtualItems()[0]

  return (
    Boolean(firstVisible) &&
    item.index < firstVisible.index &&
    instance.scrollDirection !== 'backward'
  )
}

function getSearchTargetKey(target: SessionSearchTarget, scrollContextKey: string): string {
  return [
    scrollContextKey,
    target.sessionId,
    target.sourceKind,
    target.sourceId,
    target.messageId ?? '',
    target.toolCallId ?? '',
  ].join(':')
}

function isScrolledToBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.clientHeight - el.scrollTop <= 32
}

function readTranscriptScrollState(
  el: HTMLElement,
  sessionId: string,
): SessionTranscriptScrollState {
  const distanceFromBottom = Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop)

  return {
    sessionId,
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    distanceFromBottom,
    isAtBottom: distanceFromBottom <= 32,
    updatedAt: new Date().toISOString(),
  }
}

function getScrollRestoreKey(state: SessionTranscriptScrollState): string {
  return [
    state.sessionId,
    state.updatedAt,
    state.scrollTop,
    state.scrollHeight,
    state.clientHeight,
    state.distanceFromBottom,
    state.isAtBottom,
  ].join(':')
}

function getRestoredScrollTop(el: HTMLElement, state: SessionTranscriptScrollState): number {
  if (state.isAtBottom) {
    return Math.max(state.scrollHeight, el.scrollHeight)
  }

  const topFromBottom = el.scrollHeight - el.clientHeight - state.distanceFromBottom
  const rawTop = Number.isFinite(topFromBottom) ? topFromBottom : state.scrollTop
  const maxTop = Math.max(0, el.scrollHeight - el.clientHeight)
  return Math.min(maxTop, Math.max(0, rawTop))
}

function correctScrollToOffsetRatio<TScrollElement extends Element, TItemElement extends Element>({
  align,
  behavior,
  rowIndex,
  scrollAreaRef,
  virtualizer,
}: {
  align: TranscriptScrollRequest['align']
  behavior?: ScrollBehavior
  rowIndex: number
  scrollAreaRef: MutableRefObject<HTMLDivElement | null>
  virtualizer: Virtualizer<TScrollElement, TItemElement>
}) {
  const offsetRatio = getScrollOffsetRatio(align)
  const scrollArea = scrollAreaRef.current
  if (offsetRatio === null || !scrollArea) return

  const virtualRow = virtualizer.getVirtualItems().find((row) => row.index === rowIndex)
  if (!virtualRow) return

  const rawOffset = virtualRow.start - (scrollArea.clientHeight - virtualRow.size) * offsetRatio
  const maxOffset = Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight)
  virtualizer.scrollToOffset(Math.min(maxOffset, Math.max(0, rawOffset)), {
    align: 'start',
    behavior,
  })
}

export function scrollVirtualizerToEnd<
  TScrollElement extends Element,
  TItemElement extends Element,
>(
  virtualizer: Virtualizer<TScrollElement, TItemElement>,
  itemCount: number,
  behavior: ScrollBehavior = 'auto',
) {
  if (itemCount === 0) return

  virtualizer.scrollToOffset(Number.MAX_SAFE_INTEGER, { align: 'start', behavior })

  requestAnimationFrame(() => {
    virtualizer.scrollToOffset(Number.MAX_SAFE_INTEGER, { align: 'start' })
  })
}
