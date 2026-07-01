const DEFAULT_MAX_MEASURED_ROWS = 5000

export interface TranscriptMeasurementCache<TItem> {
  estimate: (item: TItem | undefined, index: number) => number
  record: (item: TItem | undefined, index: number, measuredSize: number) => void
  get: (key: string | number) => number | undefined
  keyFor: (item: TItem | undefined, index: number) => string | number
  clear: () => void
  size: () => number
}

export function createTranscriptMeasurementCache<TItem>({
  estimateSize,
  getItemKey,
  maxMeasuredRows = DEFAULT_MAX_MEASURED_ROWS,
}: {
  estimateSize: (item: TItem | undefined) => number
  getItemKey: (item: TItem | undefined, index: number) => string | number
  maxMeasuredRows?: number
}): TranscriptMeasurementCache<TItem> {
  const measuredSizes = new Map<string | number, number>()

  const remember = (key: string | number, measuredSize: number) => {
    if (!Number.isFinite(measuredSize) || measuredSize <= 0) return

    measuredSizes.set(key, Math.ceil(measuredSize))
    if (measuredSizes.size <= maxMeasuredRows) return

    const oldestKey = measuredSizes.keys().next().value
    if (oldestKey !== undefined) {
      measuredSizes.delete(oldestKey)
    }
  }

  return {
    estimate: (item, index) => measuredSizes.get(getItemKey(item, index)) ?? estimateSize(item),
    record: (item, index, measuredSize) => remember(getItemKey(item, index), measuredSize),
    get: (key) => measuredSizes.get(key),
    keyFor: (item, index) => getItemKey(item, index),
    clear: () => measuredSizes.clear(),
    size: () => measuredSizes.size,
  }
}
