import type { Virtualizer } from '@tanstack/react-virtual'

const MAX_PROFILED_ROWS_PER_CONTEXT = 2000

export interface TranscriptRowSizeProfile {
  contextKey: string
  delta: number
  estimate: number
  expanded: boolean | null
  expandedToolCount: number | null
  index: number
  isScrolling: boolean
  key: string
  kind: string
  measured: number
  scrollDirection: string | null
  scrollOffset: number | null
  sourceId: string | null
  timestamp: number
  toolCount: number | null
}

export interface TranscriptSizeProfile {
  contextKey: string
  maxAbsDelta: number
  measuredRowCount: number
  rows: TranscriptRowSizeProfile[]
  totalDelta: number
  totalEstimatedSize: number
  totalMeasuredSize: number
}

const profilesByContext = new Map<string, Map<string, TranscriptRowSizeProfile>>()
let latestContextKey: string | null = null
let enabled = false

export function setTranscriptSizeProfilingEnabled(nextEnabled: boolean): void {
  enabled = nextEnabled
}

export function isTranscriptSizeProfilingEnabled(): boolean {
  return enabled
}

export function recordTranscriptRowSizeProfile({
  contextKey,
  element,
  estimate,
  index,
  key,
  measured,
  virtualizer,
}: {
  contextKey: string
  element: HTMLElement
  estimate: number
  index: number
  key: string | number
  measured: number
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
}): void {
  if (!enabled) {
    return
  }

  latestContextKey = contextKey

  let rows = profilesByContext.get(contextKey)
  if (!rows) {
    rows = new Map()
    profilesByContext.set(contextKey, rows)
  }

  const rowKey = String(key)
  rows.set(rowKey, {
    contextKey,
    delta: measured - estimate,
    estimate,
    expanded: toOptionalBoolean(element.dataset.transcriptRowExpanded),
    expandedToolCount: toOptionalNumber(element.dataset.transcriptExpandedToolCount),
    index,
    isScrolling: virtualizer.isScrolling,
    key: rowKey,
    kind: element.dataset.transcriptRowKind ?? 'unknown',
    measured,
    scrollDirection: virtualizer.scrollDirection,
    scrollOffset: virtualizer.scrollOffset,
    sourceId: element.dataset.transcriptSourceId ?? null,
    timestamp: performance.now(),
    toolCount: toOptionalNumber(element.dataset.transcriptToolCount),
  })

  if (rows.size <= MAX_PROFILED_ROWS_PER_CONTEXT) {
    return
  }

  const oldestKey = rows.keys().next().value
  if (oldestKey !== undefined) {
    rows.delete(oldestKey)
  }
}

export function getTranscriptSizeProfile(contextKey?: string): TranscriptSizeProfile | null {
  const resolvedContextKey = contextKey ?? latestContextKey
  if (!resolvedContextKey) return null

  const rowMap = profilesByContext.get(resolvedContextKey)
  if (!rowMap) return null

  const rows = [...rowMap.values()].sort((left, right) => left.index - right.index)
  const totalEstimatedSize = rows.reduce((total, row) => total + row.estimate, 0)
  const totalMeasuredSize = rows.reduce((total, row) => total + row.measured, 0)
  const totalDelta = totalMeasuredSize - totalEstimatedSize
  const maxAbsDelta = rows.reduce((max, row) => Math.max(max, Math.abs(row.delta)), 0)

  return {
    contextKey: resolvedContextKey,
    maxAbsDelta,
    measuredRowCount: rows.length,
    rows,
    totalDelta,
    totalEstimatedSize,
    totalMeasuredSize,
  }
}

export function clearTranscriptSizeProfile(contextKey?: string): void {
  if (contextKey) {
    profilesByContext.delete(contextKey)
    if (latestContextKey === contextKey) {
      latestContextKey = profilesByContext.keys().next().value ?? null
    }
    return
  }

  profilesByContext.clear()
  latestContextKey = null
}

function toOptionalNumber(value: string | undefined): number | null {
  if (!value) return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toOptionalBoolean(value: string | undefined): boolean | null {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}
