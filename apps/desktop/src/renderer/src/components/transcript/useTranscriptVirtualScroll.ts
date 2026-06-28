import { useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual'
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

export type TranscriptVirtualRow = Pick<VirtualItem, 'index' | 'key' | 'start'>

interface UseTranscriptVirtualScrollOptions<TItem> {
  items: TItem[]
  scrollContextKey: string
  scrollToBottomSignal: number
  scrollPersistenceEnabled: boolean
  scrollRestoreState: SessionTranscriptScrollState | null
  searchTarget?: SessionSearchTarget | null
  latestTimelineMarker?: string
  overscan: number
  primaryActionRef?: MutableRefObject<HTMLElement | null>
  estimateSize: (item: TItem | undefined) => number
  getItemKey: (item: TItem | undefined, index: number) => string | number
  findSearchTargetIndex: (items: TItem[], target: SessionSearchTarget) => number
  onScrollStateChange?: (state: SessionTranscriptScrollState) => void
}

export function useTranscriptVirtualScroll<TItem>({
  items,
  scrollContextKey,
  scrollToBottomSignal,
  scrollPersistenceEnabled,
  scrollRestoreState,
  searchTarget,
  latestTimelineMarker,
  overscan,
  primaryActionRef,
  estimateSize,
  getItemKey,
  findSearchTargetIndex,
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

  const virtualizer = useVirtualizer({
    count: items.length,
    getItemKey: (index) => getItemKey(items[index], index),
    getScrollElement: () => scrollAreaRef.current,
    initialRect: { height: 640, width: 960 },
    initialOffset: () =>
      scrollPersistenceEnabled && scrollRestoreState
        ? scrollRestoreState.scrollTop
        : Number.MAX_SAFE_INTEGER,
    estimateSize: (index) => estimateSize(items[index]),
    overscan,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const estimatedTotalHeight =
    virtualizer.getTotalSize() > 0
      ? virtualizer.getTotalSize()
      : estimateTotalHeight(items, estimateSize)
  const rowsToRender =
    virtualItems.length > 0
      ? virtualItems
      : createFallbackVirtualRows(items, estimateSize, getItemKey)

  const setScrollElement = useCallback(
    (el: HTMLDivElement | null) => {
      scrollAreaRef.current = el
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
    (rowIndex: number) => {
      autoScrollRef.current = false
      isAtBottomRef.current = false
      initialScrollDoneRef.current = true
      setJumpButtonVisible(true)
      virtualizer.scrollToIndex(rowIndex, { align: 'center' })
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
    pendingScrollStateRef.current = null
    setJumpButtonVisible(false)
  }, [scrollContextKey, setJumpButtonVisible])

  useLayoutEffect(() => {
    return () => {
      if (scrollStateTimerRef.current) clearTimeout(scrollStateTimerRef.current)
      flushScrollState()
    }
  }, [flushScrollState])

  useLayoutEffect(() => {
    if (!scrollPersistenceEnabled || !scrollRestoreState || searchTarget || items.length === 0) {
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
    setJumpButtonVisible,
    virtualizer,
  ])

  useLayoutEffect(() => {
    const latestRenderedRow = rowsToRender.at(-1)
    if (
      initialScrollDoneRef.current ||
      searchTarget ||
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
      virtualizer.scrollToIndex(targetIndex, { align: 'center' })
      attempts += 1
      if (attempts < 4) {
        frame = requestAnimationFrame(scrollTargetIntoView)
      }
    }

    frame = requestAnimationFrame(scrollTargetIntoView)

    return () => cancelAnimationFrame(frame)
  }, [findSearchTargetIndex, items, navigateToRow, searchTarget, searchTargetKey, virtualizer])

  return useMemo(
    () => ({
      estimatedTotalHeight,
      handleScroll,
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
  estimateSize: (item: TItem | undefined) => number,
): number {
  return items.reduce((total, item) => total + estimateSize(item), 0)
}

function createFallbackVirtualRows<TItem>(
  items: TItem[],
  estimateSize: (item: TItem | undefined) => number,
  getItemKey: (item: TItem | undefined, index: number) => string | number,
): TranscriptVirtualRow[] {
  let nextStart = 0

  return items.slice(0, Math.min(items.length, 12)).map((item, index) => {
    const row = {
      index,
      key: getItemKey(item, index),
      start: nextStart,
    }

    nextStart += estimateSize(item)
    return row
  })
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

function scrollVirtualizerToEnd<TScrollElement extends Element, TItemElement extends Element>(
  virtualizer: Virtualizer<TScrollElement, TItemElement>,
  itemCount: number,
  behavior: ScrollBehavior = 'auto',
) {
  if (itemCount === 0) return

  const lastIndex = itemCount - 1
  virtualizer.scrollToIndex(lastIndex, { align: 'end', behavior })

  requestAnimationFrame(() => {
    virtualizer.scrollToIndex(lastIndex, { align: 'end' })
  })
}
