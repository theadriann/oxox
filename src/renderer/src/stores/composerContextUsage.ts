import type {
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
  totalProcessedTokens: number
}

interface DeriveComposerContextUsageOptions {
  compactionTokenLimit?: number
  modelMaxContextLimit?: number | null
  cumulativeTokenUsage?: LiveSessionTokenUsageRecord | null
  lastCallTokenUsage?: LiveSessionLastCallTokenUsageRecord | null
}

export function deriveComposerContextUsage({
  compactionTokenLimit,
  modelMaxContextLimit,
  cumulativeTokenUsage,
  lastCallTokenUsage,
}: DeriveComposerContextUsageOptions): ComposerContextUsageState | null {
  if (!lastCallTokenUsage) {
    return null
  }

  const usedContext = lastCallTokenUsage.inputTokens + lastCallTokenUsage.cacheReadTokens

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
  const totalProcessedTokens = cumulativeTokenUsage
    ? cumulativeTokenUsage.inputTokens +
      cumulativeTokenUsage.outputTokens +
      cumulativeTokenUsage.cacheCreationTokens +
      cumulativeTokenUsage.cacheReadTokens +
      cumulativeTokenUsage.thinkingTokens
    : 0

  return {
    contextLimit,
    usedContext,
    remainingContext,
    usedPercentage: Math.max(0, Math.min(100, Math.round((usedContext / contextLimit) * 100))),
    totalProcessedTokens,
  }
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
