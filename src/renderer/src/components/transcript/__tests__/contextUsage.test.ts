import { describe, expect, it } from 'vitest'

import { deriveComposerContextUsage } from '../../../stores/composerContextUsage'

describe('deriveComposerContextUsage', () => {
  it('ignores over-limit estimated SDK context stats and falls back to latest token usage', () => {
    expect(
      deriveComposerContextUsage({
        contextStats: {
          used: 889897,
          remaining: 0,
          limit: 300000,
          accuracy: 'estimated',
          updatedAt: '2026-04-27T12:00:00.000Z',
        },
        compactionTokenLimit: 300000,
        lastCallTokenUsage: {
          inputTokens: 48000,
          cacheReadTokens: 0,
        },
      }),
    ).toEqual({
      contextLimit: 300000,
      usedContext: 48000,
      remainingContext: 252000,
      usedPercentage: 16,
      totalProcessedTokens: null,
      source: 'token-usage-estimate',
    })
  })

  it('returns unavailable for over-limit estimated SDK context stats when no fallback exists', () => {
    expect(
      deriveComposerContextUsage({
        contextStats: {
          used: 889897,
          remaining: 0,
          limit: 300000,
          accuracy: 'estimated',
          updatedAt: '2026-04-27T12:00:00.000Z',
        },
      }),
    ).toBeNull()
  })

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
      source: 'token-usage-estimate',
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
