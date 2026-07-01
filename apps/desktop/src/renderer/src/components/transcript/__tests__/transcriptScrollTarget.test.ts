import { getScrollOffsetRatio, getTranscriptScrollRequestKey } from '../transcriptScrollTarget'

describe('transcriptScrollTarget', () => {
  it('includes behavior in request keys', () => {
    const baseRequest = {
      requestId: 'row-1',
      target: { kind: 'row' as const, index: 1 },
    }

    expect(getTranscriptScrollRequestKey({ ...baseRequest, behavior: 'auto' })).not.toBe(
      getTranscriptScrollRequestKey({ ...baseRequest, behavior: 'smooth' }),
    )
  })

  it('rejects non-finite offset ratios', () => {
    expect(getScrollOffsetRatio({ offsetRatio: Number.NaN })).toBeNull()
    expect(getScrollOffsetRatio({ offsetRatio: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('clamps finite offset ratios', () => {
    expect(getScrollOffsetRatio({ offsetRatio: -0.5 })).toBe(0)
    expect(getScrollOffsetRatio({ offsetRatio: 1.5 })).toBe(1)
  })
})
