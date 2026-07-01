import type { Virtualizer } from '@tanstack/react-virtual'

const MAX_SCROLL_DEBUG_EVENTS = 500
const RAW_SCROLL_DELTA_THRESHOLD_PX = 64
const RAW_SCROLL_GAP_THRESHOLD_MS = 50

export interface TranscriptScrollDebugEvent {
  adjustments: number | null
  behavior: ScrollBehavior | undefined
  contextKey: string
  delta: number | null
  elapsedMs: number | null
  estimate: number | null
  index: number | null
  isScrolling: boolean
  kind: 'measure' | 'scroll' | 'scrollTo'
  key: string | null
  measured: number | null
  previous: number | null
  rowKind: string | null
  scrollDirection: string | null
  scrollHeight: number | null
  scrollHeightDelta: number | null
  scrollOffset: number | null
  scrollTop: number | null
  stack: string | null
  timestamp: number
  toOffset: number | null
  totalSize: number | null
}

let enabled = false
const events: TranscriptScrollDebugEvent[] = []
const lastRawScrollByContext = new Map<
  string,
  {
    scrollHeight: number
    timestamp: number
  }
>()

export function setTranscriptScrollDebugEnabled(nextEnabled: boolean): void {
  enabled = nextEnabled
}

export function isTranscriptScrollDebugEnabled(): boolean {
  return enabled
}

export function recordTranscriptScrollTo({
  adjustments,
  behavior,
  contextKey,
  instance,
  toOffset,
}: {
  adjustments?: number
  behavior?: ScrollBehavior
  contextKey: string
  instance: Virtualizer<HTMLDivElement, HTMLDivElement>
  toOffset: number
}): void {
  if (!enabled) {
    return
  }

  pushDebugEvent({
    adjustments: typeof adjustments === 'number' ? adjustments : null,
    behavior,
    contextKey,
    delta: null,
    elapsedMs: null,
    estimate: null,
    index: null,
    isScrolling: instance.isScrolling,
    kind: 'scrollTo',
    key: null,
    measured: null,
    previous: null,
    rowKind: null,
    scrollDirection: instance.scrollDirection,
    scrollHeight: null,
    scrollHeightDelta: null,
    scrollOffset: instance.scrollOffset,
    scrollTop: null,
    stack: new Error().stack ?? null,
    timestamp: performance.now(),
    toOffset,
    totalSize: instance.getTotalSize(),
  })
}

export function recordTranscriptScrollEvent({
  contextKey,
  delta,
  element,
  isProgrammatic,
}: {
  contextKey: string
  delta: number
  element: HTMLElement
  isProgrammatic: boolean
}): void {
  if (!enabled) {
    return
  }

  const timestamp = performance.now()
  const previousRawScroll = lastRawScrollByContext.get(contextKey)
  const elapsedMs = previousRawScroll ? timestamp - previousRawScroll.timestamp : null
  const scrollHeightDelta = previousRawScroll
    ? element.scrollHeight - previousRawScroll.scrollHeight
    : null
  lastRawScrollByContext.set(contextKey, {
    scrollHeight: element.scrollHeight,
    timestamp,
  })

  if (!shouldRecordRawScrollEvent({ delta, elapsedMs, scrollHeightDelta })) {
    return
  }

  pushDebugEvent({
    adjustments: null,
    behavior: undefined,
    contextKey,
    delta,
    elapsedMs,
    estimate: null,
    index: null,
    isScrolling: !isProgrammatic,
    kind: 'scroll',
    key: null,
    measured: null,
    previous: null,
    rowKind: null,
    scrollDirection: delta > 0 ? 'forward' : delta < 0 ? 'backward' : null,
    scrollHeight: element.scrollHeight,
    scrollHeightDelta,
    scrollOffset: null,
    scrollTop: element.scrollTop,
    stack: null,
    timestamp,
    toOffset: null,
    totalSize: null,
  })
}

export function recordTranscriptMeasurementDebug({
  contextKey,
  delta,
  element,
  estimate,
  index,
  isScrolling,
  key,
  measured,
  previous,
  scrollDirection,
  scrollOffset,
}: {
  contextKey: string
  delta: number
  element: HTMLElement
  estimate: number
  index: number
  isScrolling: boolean
  key: string | number
  measured: number
  previous: number | null
  scrollDirection: string | null
  scrollOffset: number | null
}): void {
  if (!enabled) {
    return
  }

  pushDebugEvent({
    adjustments: null,
    behavior: undefined,
    contextKey,
    delta,
    elapsedMs: null,
    estimate,
    index,
    isScrolling,
    kind: 'measure',
    key: String(key),
    measured,
    previous,
    rowKind: element.dataset.transcriptRowKind ?? null,
    scrollDirection,
    scrollHeight: null,
    scrollHeightDelta: null,
    scrollOffset,
    scrollTop: null,
    stack: new Error().stack ?? null,
    timestamp: performance.now(),
    toOffset: null,
    totalSize: null,
  })
}

export function getTranscriptScrollDebugEvents(): TranscriptScrollDebugEvent[] {
  return [...events]
}

export function clearTranscriptScrollDebugEvents(): void {
  events.length = 0
  lastRawScrollByContext.clear()
}

function pushDebugEvent(event: TranscriptScrollDebugEvent): void {
  events.push(event)

  if (events.length <= MAX_SCROLL_DEBUG_EVENTS) {
    return
  }

  events.splice(0, events.length - MAX_SCROLL_DEBUG_EVENTS)
}

function shouldRecordRawScrollEvent({
  delta,
  elapsedMs,
  scrollHeightDelta,
}: {
  delta: number
  elapsedMs: number | null
  scrollHeightDelta: number | null
}): boolean {
  return (
    elapsedMs === null ||
    Math.abs(delta) >= RAW_SCROLL_DELTA_THRESHOLD_PX ||
    (scrollHeightDelta !== null && scrollHeightDelta !== 0) ||
    elapsedMs >= RAW_SCROLL_GAP_THRESHOLD_MS
  )
}
