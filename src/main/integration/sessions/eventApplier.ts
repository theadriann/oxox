import type { TranscriptMessageContentBlock } from '../../../shared/ipc/contracts'
import type {
  MessageCompletedEvent,
  MessageDeltaEvent,
  SessionSettingsChangedEvent,
  SessionStatusChangedEvent,
  SessionTitleChangedEvent,
  StreamCompletedEvent,
  StreamErrorEvent,
} from '../protocol/sessionEvents'
import { inferTitle } from './messageNormalizer'
import { filterDefinedSettings, normalizeAvailableModels } from './snapshotConverter'
import type { ManagedSession, ManagedSessionStatus } from './types'

export function applyEventToSession(
  session: ManagedSession,
  event: import('../protocol/sessionEvents').SessionEvent,
  timestamp: string,
): void {
  session.events = [...session.events, event]
  session.updatedAt = timestamp
  session.lastEventAt = event.occurredAt ?? timestamp

  switch (event.type) {
    case 'message.completed':
      upsertMessage(session, event)
      if (session.title === 'Untitled session') {
        session.title = inferTitle(session.messages)
      }
      return

    case 'session.statusChanged':
      session.workingStatus = normalizeWorkingStatus(event)
      return

    case 'session.settingsChanged':
      session.settings = {
        ...session.settings,
        ...filterDefinedSettings(event.settings),
      }
      session.availableModels = normalizeAvailableModels(session.availableModels, session.settings)
      return

    case 'session.titleChanged':
      session.title = event.title
      return

    case 'stream.completed':
      session.transport = null
      session.processId = null
      if (event.reason !== 'disposed') {
        session.workingStatus = 'completed'
      }
      return

    case 'stream.error':
      session.transport = null
      session.processId = null
      session.workingStatus =
        event.recoverable && session.viewerIds.size > 0 ? 'reconnecting' : 'error'
      return

    default:
      return
  }
}

export function upsertMessage(session: ManagedSession, event: MessageCompletedEvent): void {
  const nextMessage = {
    id: event.messageId,
    role: event.role,
    content: event.content,
    contentBlocks: cloneContentBlocks(event.contentBlocks),
  }
  const existingIndex = session.messages.findIndex((message) => message.id === event.messageId)

  if (existingIndex >= 0) {
    session.messages.splice(existingIndex, 1, nextMessage)
    return
  }

  session.messages = [...session.messages, nextMessage]
}

export function normalizeWorkingStatus(
  event:
    | SessionStatusChangedEvent
    | SessionSettingsChangedEvent
    | StreamCompletedEvent
    | StreamErrorEvent
    | SessionTitleChangedEvent
    | MessageDeltaEvent,
): ManagedSessionStatus {
  if (event.type !== 'session.statusChanged') {
    return 'active'
  }

  if (event.status === 'idle' || event.status === 'completed' || event.status === 'waiting') {
    return event.status as ManagedSessionStatus
  }

  return 'active'
}

function cloneContentBlocks(
  contentBlocks: readonly TranscriptMessageContentBlock[] | undefined,
): TranscriptMessageContentBlock[] | undefined {
  return contentBlocks?.map((block) => ({ ...block }))
}
