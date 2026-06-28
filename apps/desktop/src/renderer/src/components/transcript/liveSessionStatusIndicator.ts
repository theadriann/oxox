import type { LiveSessionSnapshot } from '../../../../shared/ipc/contracts'
import type { TimelineItem } from './timelineTypes'

export type LiveSessionStatusKind =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'generating'
  | 'tool'
  | 'waiting'
  | 'compressing'
  | 'reconnecting'
  | 'completed'
  | 'error'

export interface LiveSessionStatusIndicator {
  kind: LiveSessionStatusKind
  label: string
  detail: string
  isActive: boolean
}

export function deriveLiveSessionStatusIndicator(
  snapshot: LiveSessionSnapshot | null,
  items: TimelineItem[],
): LiveSessionStatusIndicator | null {
  if (!snapshot) {
    return null
  }

  if (snapshot.status === 'compacting_conversation') {
    return {
      kind: 'compressing',
      label: 'Compressing context',
      detail: tokenDetail(snapshot) ?? 'Droid is compacting the conversation.',
      isActive: true,
    }
  }

  const unresolvedAskUser = findLastItem(
    items,
    (item) => item.kind === 'askUser' && !item.submittedAnswers,
  )
  if (unresolvedAskUser?.kind === 'askUser') {
    return {
      kind: 'waiting',
      label: 'Waiting for you',
      detail: unresolvedAskUser.prompt,
      isActive: false,
    }
  }

  const unresolvedPermission = findLastItem(
    items,
    (item) => item.kind === 'permission' && !item.selectedOption,
  )
  if (unresolvedPermission?.kind === 'permission') {
    return {
      kind: 'waiting',
      label: 'Waiting for approval',
      detail: unresolvedPermission.description,
      isActive: false,
    }
  }

  const runningTool = findLastItem(
    items,
    (item) => item.kind === 'tool' && item.status === 'running',
  )
  if (runningTool?.kind === 'tool') {
    return {
      kind: 'tool',
      label: `Using ${runningTool.toolName}`,
      detail: runningTool.progressSummary ?? `Running ${runningTool.toolName}.`,
      isActive: true,
    }
  }

  const streamingThinking = findLastItem(
    items,
    (item) => item.kind === 'thinking' && item.status === 'streaming',
  )
  if (streamingThinking?.kind === 'thinking') {
    return {
      kind: 'thinking',
      label: 'Thinking',
      detail: 'Droid is reasoning through the next step.',
      isActive: true,
    }
  }

  const streamingMessage = findLastItem(
    items,
    (item) => item.kind === 'message' && item.status === 'streaming',
  )
  if (streamingMessage?.kind === 'message') {
    return {
      kind: 'streaming',
      label: 'Streaming response',
      detail: 'Droid is writing a response.',
      isActive: true,
    }
  }

  switch (snapshot.status) {
    case 'active':
      return {
        kind: 'generating',
        label: 'Generating',
        detail: tokenDetail(snapshot) ?? 'Droid is working.',
        isActive: true,
      }
    case 'waiting':
      return {
        kind: 'waiting',
        label: 'Waiting',
        detail: 'Droid is waiting for input or approval.',
        isActive: false,
      }
    case 'reconnecting':
      return {
        kind: 'reconnecting',
        label: 'Reconnecting',
        detail: 'OXOX is restoring the live session connection.',
        isActive: true,
      }
    case 'completed':
      return {
        kind: 'completed',
        label: 'Session ended',
        detail: 'This session is completed.',
        isActive: false,
      }
    case 'error':
      return {
        kind: 'error',
        label: 'Error',
        detail: 'The live session needs attention.',
        isActive: false,
      }
    default:
      return {
        kind: 'idle',
        label: 'Idle',
        detail: tokenDetail(snapshot) ?? 'Droid is ready.',
        isActive: false,
      }
  }
}

function findLastItem(
  items: TimelineItem[],
  predicate: (item: TimelineItem) => boolean,
): TimelineItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item && predicate(item)) {
      return item
    }
  }

  return null
}

function tokenDetail(snapshot: LiveSessionSnapshot): string | null {
  const tokenUsage = snapshot.events
    .filter((event) => event.type === 'session.tokenUsageChanged')
    .at(-1)?.tokenUsage

  if (!tokenUsage) {
    return null
  }

  return `${tokenUsage.outputTokens.toLocaleString()} output tokens`
}
