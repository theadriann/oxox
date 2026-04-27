import type {
  LiveSessionContextStatsInfo,
  LiveSessionLastCallTokenUsageRecord,
  LiveSessionSnapshot,
  LiveSessionTokenUsageChangedEventRecord,
  LiveSessionTokenUsageRecord,
} from '../../../shared/ipc/contracts'

export interface ComposerContextUsageState {
  contextLimit: number
  usedContext: number
  remainingContext: number
  usedPercentage: number
  totalProcessedTokens: number | null
  accuracy?: LiveSessionContextStatsInfo['accuracy']
  source: 'sdk-context-stats' | 'token-usage-estimate'
}

interface DeriveComposerContextUsageOptions {
  contextStats?: LiveSessionContextStatsInfo | null
  compactionTokenLimit?: number
  modelMaxContextLimit?: number | null
  cumulativeTokenUsage?: LiveSessionTokenUsageRecord | null
  lastCallTokenUsage?: LiveSessionLastCallTokenUsageRecord | null
}

export function deriveComposerContextUsage({
  contextStats,
  compactionTokenLimit,
  modelMaxContextLimit,
  cumulativeTokenUsage,
  lastCallTokenUsage,
}: DeriveComposerContextUsageOptions): ComposerContextUsageState | null {
  const totalProcessedTokens = cumulativeTokenUsage
    ? cumulativeTokenUsage.inputTokens +
      cumulativeTokenUsage.outputTokens +
      cumulativeTokenUsage.cacheCreationTokens +
      cumulativeTokenUsage.cacheReadTokens +
      cumulativeTokenUsage.thinkingTokens
    : null

  const normalizedContextStats = contextStats ? normalizeContextStats(contextStats) : null

  if (normalizedContextStats) {
    return {
      contextLimit: normalizedContextStats.limit,
      usedContext: normalizedContextStats.used,
      remainingContext: normalizedContextStats.remaining,
      usedPercentage: Math.max(
        0,
        Math.min(
          100,
          Math.round((normalizedContextStats.used / normalizedContextStats.limit) * 100),
        ),
      ),
      totalProcessedTokens,
      accuracy: normalizedContextStats.accuracy,
      source: 'sdk-context-stats',
    }
  }

  if (!lastCallTokenUsage) {
    return null
  }

  const usedContext = lastCallTokenUsage.inputTokens

  if (usedContext === 0) {
    return null
  }

  const limits = [compactionTokenLimit, modelMaxContextLimit].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  )

  if (limits.length === 0) {
    return null
  }

  const contextLimit = Math.min(...limits)
  const remainingContext = Math.max(0, contextLimit - usedContext)

  return {
    contextLimit,
    usedContext,
    remainingContext,
    usedPercentage: Math.max(0, Math.min(100, Math.round((usedContext / contextLimit) * 100))),
    totalProcessedTokens,
    source: 'token-usage-estimate',
  }
}

export function normalizeContextStats(
  stats: LiveSessionContextStatsInfo,
): LiveSessionContextStatsInfo | null {
  const limit = toNonNegativeFiniteNumber(stats.limit)
  const rawUsed = toNonNegativeFiniteNumber(stats.used)

  if (limit === 0 || (stats.accuracy === 'estimated' && rawUsed > limit)) {
    return null
  }

  const used = Math.min(rawUsed, limit)
  const remaining = Math.min(toNonNegativeFiniteNumber(stats.remaining), Math.max(0, limit - used))

  return {
    ...stats,
    limit,
    used,
    remaining,
  }
}

function toNonNegativeFiniteNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function getLatestTokenUsageEvent(
  snapshot: LiveSessionSnapshot | null,
): LiveSessionTokenUsageChangedEventRecord | null {
  if (!snapshot) {
    return null
  }

  for (let index = snapshot.events.length - 1; index >= 0; index -= 1) {
    const event = snapshot.events[index]

    if (event?.type === 'session.tokenUsageChanged') {
      return event
    }
  }

  return null
}
