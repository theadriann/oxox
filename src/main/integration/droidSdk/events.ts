import type {
  AskUserRequestParams,
  DroidMessage,
  RequestPermissionRequestParams,
} from '@factory/droid-sdk'
import type { TranscriptMessageContentBlock } from '../../../shared/ipc/contracts'

import type { SessionEvent, SessionSettingsPatch } from '../protocol/sessionEvents'

export function mapDroidNotificationPayloadToSessionEvents(
  notification: Record<string, unknown>,
  sessionId?: string,
): SessionEvent[] | null {
  switch (notification.type) {
    case 'tool_call':
      return [
        {
          type: 'tool.progress',
          sessionId,
          toolUseId: toStringValue(
            notification.toolUseId ?? notification.tool_use_id ?? notification.id,
            'tool-use',
          ),
          toolName: toStringValue(notification.toolName ?? notification.name, 'Unknown tool'),
          status: 'running',
          detail:
            toOptionalString(notification.details) ??
            toOptionalString(notification.text) ??
            serializeUnknownAsMarkdown(notification.parameters) ??
            undefined,
        },
      ]

    case 'tool_progress_update': {
      const update = isRecord(notification.update) ? notification.update : {}

      return [
        {
          type: 'tool.progress',
          sessionId,
          toolUseId: toStringValue(
            notification.toolUseId ?? notification.tool_use_id ?? notification.id,
            'tool-use',
          ),
          toolName: toStringValue(notification.toolName ?? notification.name, 'Unknown tool'),
          status: toStringValue(update.status ?? update.type, 'running'),
          detail:
            toOptionalString(update.details) ??
            toOptionalString(update.text) ??
            toOptionalString(update.error) ??
            serializeUnknownAsMarkdown(update.parameters) ??
            undefined,
        },
      ]
    }

    case 'tool_result':
      return [
        {
          type: 'tool.result',
          sessionId,
          toolUseId: toStringValue(
            notification.toolUseId ?? notification.tool_use_id ?? notification.id,
            'tool-use',
          ),
          toolName: toStringValue(notification.toolName ?? notification.name, 'Unknown tool'),
          content: notification.content,
          isError: Boolean(notification.isError ?? notification.is_error),
        },
      ]

    default:
      return null
  }
}

export function mapDroidMessageToSessionEvent(
  message: DroidMessage,
  sessionId?: string,
): SessionEvent | null {
  switch (message.type) {
    case 'assistant_text_delta':
      return {
        type: 'message.delta',
        sessionId,
        messageId: message.messageId,
        delta: message.text,
        channel: 'assistant',
        blockIndex: message.blockIndex,
      }

    case 'thinking_text_delta':
      return {
        type: 'message.delta',
        sessionId,
        messageId: message.messageId,
        delta: message.text,
        channel: 'thinking',
        blockIndex: message.blockIndex,
      }

    case 'tool_progress':
      return {
        type: 'tool.progress',
        sessionId,
        toolUseId: message.toolUseId,
        toolName: message.toolName,
        status: message.update.status ?? 'running',
        detail: message.content || undefined,
      }

    case 'tool_use':
      return {
        type: 'tool.progress',
        sessionId,
        toolUseId: message.toolUseId,
        toolName: message.toolName,
        status: 'running',
        detail: serializeUnknownAsMarkdown(message.toolInput) ?? undefined,
      }

    case 'tool_result':
      return {
        type: 'tool.result',
        sessionId,
        toolUseId: message.toolUseId,
        toolName:
          'toolName' in message && typeof message.toolName === 'string'
            ? message.toolName
            : 'Unknown tool',
        content: message.content,
        isError: message.isError,
      }

    case 'working_state_changed':
      return {
        type: 'session.statusChanged',
        sessionId,
        status: message.state,
      }

    case 'token_usage_update':
      return {
        type: 'session.tokenUsageChanged',
        sessionId,
        tokenUsage: {
          inputTokens: message.inputTokens,
          outputTokens: message.outputTokens,
          cacheCreationTokens: message.cacheWriteTokens,
          cacheReadTokens: message.cacheReadTokens,
          thinkingTokens: message.thinkingTokens,
        },
      }

    case 'create_message': {
      const contentBlocks = extractDroidMessageContentBlocks(message.content)
      const textContent = extractTextFromBlocks(contentBlocks)

      if (message.role === 'tool' || (textContent.length === 0 && contentBlocks.length === 0)) {
        return null
      }

      return {
        type: 'message.completed',
        sessionId,
        messageId: message.messageId,
        content: textContent,
        contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
        role: message.role,
      }
    }

    case 'permission_resolved':
      return {
        type: 'permission.resolved',
        sessionId,
        requestId: message.requestId,
        toolUseIds: message.toolUseIds,
        selectedOption: message.selectedOption,
      }

    case 'settings_updated':
      return {
        type: 'session.settingsChanged',
        sessionId,
        settings: pickOxoxSessionSettings(message.settings),
      }

    case 'session_title_updated':
      return {
        type: 'session.titleChanged',
        sessionId,
        title: message.title,
      }

    case 'error':
      return {
        type: 'stream.error',
        sessionId,
        error: new Error(message.message),
        recoverable: true,
      }

    default:
      return null
  }
}

export function createPermissionRequestedEvent(
  requestId: string,
  params: RequestPermissionRequestParams,
  sessionId?: string,
): SessionEvent {
  return {
    type: 'permission.requested',
    sessionId,
    requestId,
    options: params.options.map((option) => option.value),
    toolUseIds: params.toolUses.map((toolUse) => toolUse.toolUse.id),
    reason: describePermissionRequest(params),
    riskLevel: extractPermissionRiskLevel(params),
  }
}

export function createAskUserRequestedEvent(
  requestId: string,
  params: AskUserRequestParams,
  sessionId?: string,
): SessionEvent {
  const firstQuestion = params.questions[0]

  return {
    type: 'askUser.requested',
    sessionId,
    requestId,
    toolCallId: params.toolCallId,
    prompt: firstQuestion?.question ?? 'The agent is waiting for user input.',
    options: firstQuestion?.options ?? [],
    questions: params.questions.map((question) => ({
      index: question.index,
      topic: question.topic,
      question: question.question,
      options: question.options,
    })),
  }
}

export function extractEmbeddedSessionEventsFromDroidMessage(
  message: DroidMessage,
  sessionId?: string,
): SessionEvent[] {
  if (message.type !== 'create_message' || !Array.isArray(message.content)) {
    return []
  }

  const toolNames = new Map<string, string>()
  const events: SessionEvent[] = []

  for (const [blockIndex, block] of message.content.entries()) {
    if (!isRecord(block)) {
      continue
    }

    if (block.type === 'tool_use') {
      const toolUseId =
        toOptionalString(block.id) ?? `${message.messageId}:tool-use:${blockIndex.toString()}`
      const toolName = toOptionalString(block.name) ?? 'Unknown tool'

      toolNames.set(toolUseId, toolName)
      continue
    }

    if (block.type !== 'tool_result') {
      continue
    }

    const toolUseId =
      toOptionalString(block.tool_use_id) ??
      toOptionalString(block.toolUseId) ??
      `${message.messageId}:tool-result:${blockIndex.toString()}`

    events.push({
      type: 'tool.result',
      sessionId,
      toolUseId,
      toolName: toolNames.get(toolUseId) ?? 'Unknown tool',
      content: block.content,
      isError: Boolean(block.is_error ?? block.isError),
    })
  }

  return events
}

function pickOxoxSessionSettings(settings: Record<string, unknown>): SessionSettingsPatch {
  return {
    ...(typeof settings.modelId === 'string' ? { modelId: settings.modelId } : {}),
    ...(typeof settings.interactionMode === 'string'
      ? { interactionMode: settings.interactionMode }
      : {}),
    ...(typeof settings.reasoningEffort === 'string'
      ? { reasoningEffort: settings.reasoningEffort }
      : {}),
    ...(typeof settings.autonomyLevel === 'string'
      ? { autonomyLevel: settings.autonomyLevel }
      : {}),
  }
}

function extractDroidMessageContentBlocks(content: unknown): TranscriptMessageContentBlock[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }

  if (!Array.isArray(content)) {
    return []
  }

  const blocks: TranscriptMessageContentBlock[] = []

  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue
    }

    const candidate = block as Record<string, unknown>

    if (candidate.type === 'text' && typeof candidate.text === 'string') {
      blocks.push({
        type: 'text',
        text: candidate.text,
      })
      continue
    }

    if (candidate.type !== 'image' || !isRecord(candidate.source)) {
      continue
    }

    const data = typeof candidate.source.data === 'string' ? candidate.source.data : null
    const mediaType =
      typeof candidate.source.mediaType === 'string'
        ? candidate.source.mediaType
        : typeof candidate.source.media_type === 'string'
          ? candidate.source.media_type
          : null

    if (!data || !mediaType) {
      continue
    }

    blocks.push({
      type: 'image',
      mediaType,
      data,
    })
  }

  return blocks
}

function extractTextFromBlocks(contentBlocks: TranscriptMessageContentBlock[]): string {
  return contentBlocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}

function describePermissionRequest(params: RequestPermissionRequestParams): string | undefined {
  const details = params.toolUses[0]?.details

  if (!details || typeof details !== 'object') {
    return params.toolUses[0]?.toolUse.name
  }

  if (details.type === 'exec') {
    return typeof details.fullCommand === 'string'
      ? details.fullCommand
      : params.toolUses[0]?.toolUse.name
  }

  if (details.type === 'edit' || details.type === 'create' || details.type === 'apply_patch') {
    return typeof details.filePath === 'string'
      ? details.filePath
      : typeof details.fileName === 'string'
        ? details.fileName
        : params.toolUses[0]?.toolUse.name
  }

  if (details.type === 'mcp_tool') {
    return typeof details.toolName === 'string'
      ? details.toolName
      : params.toolUses[0]?.toolUse.name
  }

  return params.toolUses[0]?.toolUse.name
}

function extractPermissionRiskLevel(params: RequestPermissionRequestParams): string | undefined {
  const details = params.toolUses[0]?.details

  if (details && typeof details === 'object' && typeof details.impactLevel === 'string') {
    return details.impactLevel
  }

  const optionValues = params.options.map((option) => option.value)

  if (optionValues.some((value) => value.includes('high'))) {
    return 'high'
  }

  if (optionValues.some((value) => value.includes('medium'))) {
    return 'medium'
  }

  if (optionValues.some((value) => value.includes('low'))) {
    return 'low'
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function toStringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function serializeUnknownAsMarkdown(value: unknown): string | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  try {
    return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
  } catch {
    return String(value)
  }
}
