import { createTranscriptMeasurementCache } from '../transcriptMeasurementCache'

describe('createTranscriptMeasurementCache', () => {
  it('reuses measured row heights by stable item id', () => {
    const cache = createTranscriptMeasurementCache({
      estimateSize: (item: { id: string; estimate: number } | undefined) => item?.estimate ?? 100,
      getItemKey: (item, index) => item?.id ?? index,
    })

    expect(cache.estimate({ id: 'row-1', estimate: 180 }, 0)).toBe(180)

    cache.record({ id: 'row-1', estimate: 180 }, 0, 143.2)

    expect(cache.estimate({ id: 'row-1', estimate: 260 }, 0)).toBe(144)
    expect(cache.get('row-1')).toBe(144)
  })

  it('bounds the cache to the configured row count', () => {
    const cache = createTranscriptMeasurementCache({
      estimateSize: () => 100,
      getItemKey: (item: { id: string } | undefined, index) => item?.id ?? index,
      maxMeasuredRows: 2,
    })

    cache.record({ id: 'row-1' }, 0, 101)
    cache.record({ id: 'row-2' }, 1, 102)
    cache.record({ id: 'row-3' }, 2, 103)

    expect(cache.get('row-1')).toBeUndefined()
    expect(cache.get('row-2')).toBe(102)
    expect(cache.get('row-3')).toBe(103)
    expect(cache.size()).toBe(2)
  })
})
