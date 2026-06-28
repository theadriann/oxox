import type { TranscriptPerformanceEvent } from '../../../../shared/ipc/contracts'

type TranscriptPerformanceSink = (events: TranscriptPerformanceEvent[]) => Promise<void> | void

const STORAGE_KEY = 'oxox.transcriptPerfLogging'
const FLUSH_DELAY_MS = 1000
const MAX_BATCH_SIZE = 100

let sink: TranscriptPerformanceSink | undefined
let queue: TranscriptPerformanceEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

export function configureTranscriptPerformanceLogger(
  nextSink: TranscriptPerformanceSink | undefined,
): void {
  sink = nextSink
}

export function isTranscriptPerformanceLoggingEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(STORAGE_KEY) === '1'
}

export function logTranscriptPerformanceEvent(
  event: Omit<TranscriptPerformanceEvent, 'source' | 'timestamp'>,
): void {
  if (!sink || !isTranscriptPerformanceLoggingEnabled()) {
    return
  }

  queue.push({
    ...event,
    source: 'renderer',
    timestamp: new Date().toISOString(),
  })

  if (queue.length >= MAX_BATCH_SIZE) {
    flushTranscriptPerformanceEvents()
    return
  }

  if (flushTimer !== null) {
    return
  }

  flushTimer = setTimeout(flushTranscriptPerformanceEvents, FLUSH_DELAY_MS)
}

export function flushTranscriptPerformanceEvents(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }

  if (!sink || queue.length === 0) {
    queue = []
    return
  }

  const events = queue
  queue = []
  void sink(events)
}
