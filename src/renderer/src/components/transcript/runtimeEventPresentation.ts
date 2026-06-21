import type { LiveSessionEventRecord } from '../../../../shared/ipc/contracts'
import type { EventTone, SystemEventTimelineItem } from './timelineTypes'

export interface RuntimeEventPresentation {
  title: string
  body: string
  details: string[]
  tone: EventTone
  layout: SystemEventTimelineItem['layout']
  detailsLayout?: SystemEventTimelineItem['detailsLayout']
  toastKind?: 'error' | 'success' | 'warning'
  toastId: string
}

export function presentRuntimeEvent(
  event: LiveSessionEventRecord,
): RuntimeEventPresentation | null {
  switch (event.type) {
    case 'session.result':
      if (event.success) {
        return null
      }

      return {
        title: 'Turn failed',
        body:
          summarizeErrorText(event.error ?? event.text) ?? event.text ?? 'Droid reported an error.',
        details: [
          `Duration: ${Math.round(event.durationMs / 100) / 10}s`,
          `Turns: ${event.turnCount}`,
          event.error ? `Details: ${event.error}` : null,
          typeof event.structuredOutput !== 'undefined'
            ? `Structured output: ${formatUnknownValue(event.structuredOutput)}`
            : null,
        ].filter((detail): detail is string => Boolean(detail)),
        tone: 'danger',
        layout: 'compact',
        detailsLayout: 'disclosure',
        toastKind: 'error',
        toastId: runtimeToastId(event),
      }

    case 'stream.error':
      if (event.recoverable) {
        return {
          title: 'Connection interrupted',
          body: 'Reconnecting… partial response preserved.',
          details: compactDetails(event.error),
          tone: 'warning',
          layout: 'compact',
          detailsLayout: 'disclosure',
          toastKind: 'warning',
          toastId: runtimeToastId(event),
        }
      }

      return {
        title: 'Stream error',
        body: summarizeErrorText(event.error) ?? 'The live stream reported an unknown error.',
        details: compactDetails(event.error),
        tone: 'danger',
        layout: 'compact',
        detailsLayout: 'disclosure',
        toastKind: 'error',
        toastId: runtimeToastId(event),
      }

    case 'stream.warning':
      if (event.kind === 'reconnected') {
        return {
          title: 'Connection restored',
          body: 'Streaming resumed.',
          details: [],
          tone: 'success',
          layout: 'compact',
          toastKind: 'success',
          toastId: runtimeToastId(event),
        }
      }

      return {
        title: 'Stream warning',
        body: event.warning || 'The stream reported a warning.',
        details: event.kind ? [`Kind: ${event.kind}`] : [],
        tone: 'warning',
        layout: 'compact',
        toastKind: 'warning',
        toastId: runtimeToastId(event),
      }

    case 'session.compacted':
      return {
        title: 'Conversation compressed',
        body: `Removed ${event.removedCount.toLocaleString()} transcript ${event.removedCount === 1 ? 'item' : 'items'} from active context.`,
        details: [
          `Summary: ${event.summaryId}`,
          event.visibleBoundaryMessageId
            ? `Visible boundary: ${event.visibleBoundaryMessageId}`
            : null,
        ].filter((detail): detail is string => Boolean(detail)),
        tone: 'success',
        layout: 'compact',
        detailsLayout: 'disclosure',
        toastId: runtimeToastId(event),
      }

    default:
      return null
  }
}

export function summarizeErrorText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  const parsed = parseEmbeddedErrorJson(value)
  if (!parsed) {
    return value.split('\n').at(0) ?? value
  }

  const status = toOptionalString(parsed.status)
  const title = toOptionalString(parsed.title)
  const detail = toOptionalString(parsed.detail) ?? toOptionalString(parsed.message)
  const prefix = [status, title].filter(Boolean).join(' ')

  if (prefix && detail) {
    return `${prefix} — ${detail}`
  }

  return detail ?? prefix ?? value
}

function compactDetails(value: unknown): string[] {
  const summary = summarizeErrorText(value)

  return summary ? [`Details: ${summary}`] : []
}

function parseEmbeddedErrorJson(value: string): Record<string, unknown> | null {
  const jsonStart = value.indexOf('{')

  if (jsonStart === -1) {
    return null
  }

  try {
    const parsed = JSON.parse(value.slice(jsonStart))
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function formatUnknownValue(value: unknown): string {
  if (value === null || typeof value === 'undefined') return 'No additional details.'
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function runtimeToastId(event: LiveSessionEventRecord): string {
  const occurredAt = typeof event.occurredAt === 'string' ? event.occurredAt : 'latest'

  if (event.type === 'session.result') {
    return `${event.type}:${occurredAt}:${event.success}:${event.error ?? event.text}`
  }

  if (event.type === 'stream.error') {
    return `${event.type}:${occurredAt}:${event.recoverable ? 'recoverable' : 'fatal'}:${event.error}`
  }

  if (event.type === 'stream.warning') {
    return `${event.type}:${occurredAt}:${event.kind ?? event.warning}`
  }

  return `${event.type}:${occurredAt}`
}

function toOptionalString(value: unknown): string | null {
  if (typeof value === 'number') {
    return String(value)
  }

  return typeof value === 'string' && value.length > 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}
