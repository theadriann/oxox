import { describe, expect, it } from 'vitest'

import { deriveComposerContextUsage } from '../../../stores/composerContextUsage'

describe('deriveComposerContextUsage', () => {
  it('uses the lower of the compaction limit and model max context limit', () => {
    expect(
      deriveComposerContextUsage({
        compactionTokenLimit: 300000,
        modelMaxContextLimit: 258000,
        cumulativeTokenUsage: {
          inputTokens: 298000,
          outputTokens: 4000,
          cacheCreationTokens: 0,
          cacheReadTokens: 1000,
          thinkingTokens: 0,
        },
        lastCallTokenUsage: {
          inputTokens: 78000,
          cacheReadTokens: 0,
        },
      }),
    ).toEqual({
      contextLimit: 258000,
      usedContext: 78000,
      remainingContext: 180000,
      usedPercentage: 30,
      totalProcessedTokens: 303000,
    })
  })

  it('returns unavailable when lastCallTokenUsage reports zero (no real turn yet)', () => {
    expect(
      deriveComposerContextUsage({
        compactionTokenLimit: 300000,
        modelMaxContextLimit: 258000,
        cumulativeTokenUsage: {
          inputTokens: 298000,
          outputTokens: 4000,
          cacheCreationTokens: 0,
          cacheReadTokens: 1000,
          thinkingTokens: 0,
        },
        lastCallTokenUsage: {
          inputTokens: 0,
          cacheReadTokens: 0,
        },
      }),
    ).toBeNull()
  })

  it('returns unavailable when exact live context inputs are missing', () => {
    expect(
      deriveComposerContextUsage({
        compactionTokenLimit: 300000,
        modelMaxContextLimit: null,
        cumulativeTokenUsage: {
          inputTokens: 298000,
          outputTokens: 4000,
          cacheCreationTokens: 0,
          cacheReadTokens: 1000,
          thinkingTokens: 0,
        },
        lastCallTokenUsage: null,
      }),
    ).toBeNull()
  })
})
