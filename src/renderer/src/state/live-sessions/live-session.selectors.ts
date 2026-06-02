import type {
  LiveSessionEventRecord,
  LiveSessionMessage,
  LiveSessionSnapshot,
} from '../../../../shared/ipc/contracts'

export function sumDeltaChars(events: LiveSessionEventRecord[]): number {
  return events.reduce((total, event) => {
    if (event.type !== 'message.delta') {
      return total
    }

    return total + event.delta.length
  }, 0)
}

export function applyEventsToSnapshot(
  previousSnapshot: LiveSessionSnapshot,
  events: LiveSessionEventRecord[],
): LiveSessionSnapshot {
  let nextSnapshot: LiveSessionSnapshot = {
    ...previousSnapshot,
    events: [...previousSnapshot.events, ...events],
  }

  for (const event of events) {
    nextSnapshot = applyEventToSnapshot(nextSnapshot, event)
  }

  return nextSnapshot
}

export function snapshotChanged(
  previousSnapshot: LiveSessionSnapshot | undefined,
  nextSnapshot: LiveSessionSnapshot,
): boolean {
  if (!previousSnapshot) {
    return true
  }

  return (
    previousSnapshot.status !== nextSnapshot.status ||
    previousSnapshot.title !== nextSnapshot.title ||
    previousSnapshot.events.length !== nextSnapshot.events.length ||
    lastEventSignature(previousSnapshot) !== lastEventSignature(nextSnapshot) ||
    previousSnapshot.messages.length !== nextSnapshot.messages.length ||
    lastMessageSignature(previousSnapshot) !== lastMessageSignature(nextSnapshot) ||
    (previousSnapshot.transcriptRevision ?? 0) !== (nextSnapshot.transcriptRevision ?? 0) ||
    previousSnapshot.settings.modelId !== nextSnapshot.settings.modelId ||
    previousSnapshot.settings.interactionMode !== nextSnapshot.settings.interactionMode ||
    previousSnapshot.settings.reasoningEffort !== nextSnapshot.settings.reasoningEffort ||
    previousSnapshot.settings.autonomyLevel !== nextSnapshot.settings.autonomyLevel ||
    previousSnapshot.settings.autonomyMode !== nextSnapshot.settings.autonomyMode ||
    previousSnapshot.settings.specModeModelId !== nextSnapshot.settings.specModeModelId ||
    previousSnapshot.settings.specModeReasoningEffort !==
      nextSnapshot.settings.specModeReasoningEffort ||
    JSON.stringify(previousSnapshot.settings.enabledToolIds ?? []) !==
      JSON.stringify(nextSnapshot.settings.enabledToolIds ?? []) ||
    JSON.stringify(previousSnapshot.settings.disabledToolIds ?? []) !==
      JSON.stringify(nextSnapshot.settings.disabledToolIds ?? []) ||
    previousSnapshot.viewerCount !== nextSnapshot.viewerCount ||
    availableModelsSignature(previousSnapshot.availableModels) !==
      availableModelsSignature(nextSnapshot.availableModels)
  )
}

function applyEventToSnapshot(
  snapshot: LiveSessionSnapshot,
  event: LiveSessionEventRecord,
): LiveSessionSnapshot {
  switch (event.type) {
    case 'message.completed':
      return {
        ...snapshot,
        messages: upsertMessage(snapshot.messages, {
          id: event.messageId,
          role: event.role,
          content: event.content,
          rewindBoundaryMessageId: event.rewindBoundaryMessageId,
          contentBlocks: event.contentBlocks,
        }),
      }
    case 'session.statusChanged':
      return {
        ...snapshot,
        status: event.status,
      }
    case 'session.titleChanged':
      return {
        ...snapshot,
        title: event.title,
      }
    case 'session.settingsChanged':
      return {
        ...snapshot,
        settings: {
          ...snapshot.settings,
          ...event.settings,
        },
      }
    case 'stream.completed':
      return {
        ...snapshot,
        status: event.reason === 'turn_complete' ? 'idle' : 'completed',
        processId: event.reason === 'turn_complete' ? snapshot.processId : null,
      }
    case 'stream.error':
      return {
        ...snapshot,
        status: event.recoverable ? 'reconnecting' : 'error',
        processId: null,
      }
    case 'session.result':
      return {
        ...snapshot,
        status: event.success ? 'idle' : 'error',
      }
    default:
      return snapshot
  }
}

function upsertMessage(
  messages: LiveSessionMessage[],
  nextMessage: LiveSessionMessage,
): LiveSessionMessage[] {
  const existingIndex = messages.findIndex((message) => message.id === nextMessage.id)

  if (existingIndex < 0) {
    return [...messages, nextMessage]
  }

  return messages.map((message, index) => (index === existingIndex ? nextMessage : message))
}

function availableModelsSignature(snapshotModels: LiveSessionSnapshot['availableModels']): string {
  return snapshotModels
    .map(
      (model) =>
        `${model.id}:${model.name}:${(model.supportedReasoningEfforts ?? []).join(',')}:${model.defaultReasoningEffort ?? ''}`,
    )
    .join('|')
}

function lastMessageSignature(snapshot: LiveSessionSnapshot): string {
  const lastMessage = snapshot.messages.at(-1)

  return lastMessage
    ? `${lastMessage.id}:${lastMessage.role ?? ''}:${lastMessage.content}:${JSON.stringify(lastMessage.contentBlocks ?? [])}`
    : ''
}

function lastEventSignature(snapshot: LiveSessionSnapshot): string {
  const lastEvent = snapshot.events.at(-1)

  return lastEvent ? JSON.stringify(lastEvent) : ''
}
