import type { TranscriptMessageContentBlock } from '../../../shared/ipc/contracts'
import type {
  LiveSessionMessage,
  LiveSessionModel,
  LiveSessionSettings,
  LiveSessionSnapshot,
  ManagedSession,
  StreamJsonRpcModel,
} from './types'

export function toVisibleStatus(session: ManagedSession): string {
  if (
    session.workingStatus === 'completed' ||
    session.workingStatus === 'reconnecting' ||
    session.workingStatus === 'error'
  ) {
    return session.workingStatus
  }

  if (session.viewerIds.size === 0) {
    return 'disconnected'
  }

  return session.workingStatus
}

export function toSnapshot(session: ManagedSession): LiveSessionSnapshot {
  return {
    sessionId: session.sessionId,
    title: session.title,
    status: toVisibleStatus(session),
    transport: 'stream-jsonrpc',
    processId: session.processId,
    viewerCount: session.viewerIds.size,
    projectWorkspacePath: session.cwd,
    parentSessionId: session.parentSessionId,
    availableModels: cloneAvailableModels(session.availableModels),
    settings: cloneSessionSettings(session.settings),
    transcriptRevision: session.transcriptRevision,
    messages: cloneMessages(session.messages),
    events: [...session.events],
  }
}

export function cloneMessages(messages: LiveSessionMessage[]): LiveSessionMessage[] {
  return messages.map((message) => ({
    ...message,
    contentBlocks: cloneContentBlocks(message.contentBlocks),
  }))
}

export function mergeMessages(
  existingMessages: LiveSessionMessage[],
  nextMessages: LiveSessionMessage[],
): LiveSessionMessage[] {
  if (existingMessages.length === 0) {
    return cloneMessages(nextMessages)
  }

  if (nextMessages.length === 0) {
    return cloneMessages(existingMessages)
  }

  const messagesById = new Map<string, LiveSessionMessage>()
  const orderedIds: string[] = []

  for (const message of [...existingMessages, ...nextMessages]) {
    if (!messagesById.has(message.id)) {
      orderedIds.push(message.id)
    }

    messagesById.set(message.id, {
      ...message,
      contentBlocks: cloneContentBlocks(message.contentBlocks),
    })
  }

  return orderedIds
    .map((messageId) => messagesById.get(messageId))
    .filter((message): message is LiveSessionMessage => Boolean(message))
}

export function normalizeSessionSettings(
  settings: Partial<LiveSessionSettings> | undefined,
  availableModels?: Array<LiveSessionModel | StreamJsonRpcModel>,
): LiveSessionSettings {
  const normalizedSettings = filterDefinedSettings(settings ?? {})
  const fallbackModelId =
    normalizedSettings.modelId ?? availableModels?.find((model) => model.id)?.id

  return {
    ...normalizedSettings,
    ...(fallbackModelId ? { modelId: fallbackModelId } : {}),
    interactionMode: normalizedSettings.interactionMode ?? 'auto',
  }
}

export function filterDefinedSettings(settings: Partial<LiveSessionSettings>): LiveSessionSettings {
  return Object.fromEntries(
    Object.entries(settings).filter((entry) => typeof entry[1] === 'string' && entry[1].length > 0),
  ) as LiveSessionSettings
}

export function cloneSessionSettings(settings: LiveSessionSettings): LiveSessionSettings {
  return { ...settings }
}

export function normalizeAvailableModels(
  models: Array<LiveSessionModel | StreamJsonRpcModel> | undefined,
  settings?: Partial<LiveSessionSettings>,
): LiveSessionModel[] {
  const normalizedModels = (models ?? [])
    .map((model) => {
      if (typeof model.id !== 'string' || model.id.length === 0) {
        return null
      }

      return {
        id: model.id,
        name: typeof model.name === 'string' && model.name.length > 0 ? model.name : model.id,
        ...(typeof model.provider === 'string' ? { provider: model.provider } : {}),
        ...(typeof model.maxContextLimit === 'number'
          ? { maxContextLimit: model.maxContextLimit }
          : {}),
      } satisfies LiveSessionModel
    })
    .filter((model): model is LiveSessionModel => model !== null)

  if (normalizedModels.length > 0) {
    return normalizedModels
  }

  if (settings?.modelId) {
    return [
      {
        id: settings.modelId,
        name: settings.modelId,
      },
    ]
  }

  return []
}

export function cloneAvailableModels(models: LiveSessionModel[]): LiveSessionModel[] {
  return models.map((model) => ({ ...model }))
}

function cloneContentBlocks(
  contentBlocks: readonly TranscriptMessageContentBlock[] | undefined,
): TranscriptMessageContentBlock[] | undefined {
  return contentBlocks?.map((block) => ({ ...block }))
}
