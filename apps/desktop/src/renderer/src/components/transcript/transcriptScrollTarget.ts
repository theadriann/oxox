export type TranscriptScrollTarget =
  | { kind: 'message'; messageId: string }
  | { kind: 'tool'; toolUseId: string }
  | { kind: 'timelineItem'; id: string }
  | { kind: 'row'; index: number }

export type TranscriptScrollAlign = 'start' | 'center' | 'end' | { offsetRatio: number }

export interface TranscriptScrollRequest {
  align?: TranscriptScrollAlign
  behavior?: ScrollBehavior
  requestId?: number | string
  target: TranscriptScrollTarget
}

export function getTranscriptScrollRequestKey(
  request: TranscriptScrollRequest | null | undefined,
): string | null {
  if (!request) return null

  return JSON.stringify({
    align: request.align ?? 'center',
    behavior: request.behavior ?? 'auto',
    requestId: request.requestId ?? null,
    target: request.target,
  })
}

export function toVirtualizerAlign(align: TranscriptScrollAlign | undefined) {
  if (!align || typeof align === 'object') return 'center'

  return align
}

export function getScrollOffsetRatio(align: TranscriptScrollAlign | undefined): number | null {
  if (!align || typeof align === 'string') return null
  if (!Number.isFinite(align.offsetRatio)) return null

  return Math.min(1, Math.max(0, align.offsetRatio))
}
