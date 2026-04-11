import type { TranscriptMessageContentBlock } from '../../../shared/ipc/contracts'
import type { SessionEvent, SessionEventRole } from '../protocol/sessionEvents'
import type { LiveSessionMessage, StreamJsonRpcMessage, StreamJsonRpcSession } from './types'

const TOOL_ERROR_PREFIX = /^error\b|^failed\b/i

export function normalizeMessages(messages: StreamJsonRpcMessage[]): LiveSessionMessage[] {
  return messages.flatMap((message, index) => {
    const role = normalizeMessageRole(message.role)
    const contentBlocks = extractMessageContentBlocks(message.content)
    const content =
      contentBlocks.length > 0
        ? contentBlocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
        : extractMessageText(message.content)

    if (role === 'tool' || (content.trim().length === 0 && contentBlocks.length === 0)) {
      return []
    }

    return [
      {
        id: message.id ?? `message-${index + 1}`,
        role,
        content,
        contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      },
    ]
  })
}

export function extractHistoryEvents(messages: StreamJsonRpcMessage[]): SessionEvent[] {
  const events: SessionEvent[] = []
  const toolNames = new Map<string, string>()

  for (const [messageIndex, message] of messages.entries()) {
    const messageId = message.id ?? `message-${messageIndex + 1}`
    const role = normalizeMessageRole(message.role)
    const occurredAt = readMessageTimestamp(message)
    const contentBlocks = Array.isArray(message.content)
      ? message.content.filter((value): value is Record<string, unknown> => isRecord(value))
      : null

    if (!contentBlocks) {
      appendCompletedHistoryMessageEvent(events, {
        messageId,
        role,
        occurredAt,
        content: message.content,
      })
      continue
    }

    const pendingBlocks: TranscriptMessageContentBlock[] = []
    const flushPendingBlocks = () => {
      appendCompletedHistoryMessageEvent(events, {
        messageId,
        role,
        occurredAt,
        contentBlocks: pendingBlocks,
      })
      pendingBlocks.length = 0
    }

    for (const [blockIndex, block] of contentBlocks.entries()) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
        pendingBlocks.push({
          type: 'text',
          text: block.text,
        })
        continue
      }

      if (block.type === 'image') {
        const imageBlock = toImageContentBlock(block)

        if (imageBlock) {
          pendingBlocks.push(imageBlock)
        }
        continue
      }

      if (block.type === 'tool_use') {
        flushPendingBlocks()
        const toolUseId = toToolUseId(block.id, messageId, blockIndex)
        const toolName = toOptionalString(block.name) ?? 'Unknown tool'

        toolNames.set(toolUseId, toolName)
        events.push({
          type: 'tool.progress',
          occurredAt: occurredAt ?? undefined,
          toolUseId,
          toolName,
          status: 'running',
          detail: serializeUnknownAsMarkdown(block.input) ?? undefined,
        })
        continue
      }

      if (block.type === 'tool_result') {
        flushPendingBlocks()
        const toolUseId =
          toOptionalString(block.tool_use_id) ??
          toOptionalString(block.toolUseId) ??
          `${messageId}:tool-result:${blockIndex}`
        const resultMarkdown = serializeUnknownAsMarkdown(block.content)

        events.push({
          type: 'tool.result',
          occurredAt: occurredAt ?? undefined,
          toolUseId,
          toolName: toolNames.get(toolUseId) ?? 'Unknown tool',
          content: block.content,
          isError: isHistoryToolResultError(block, resultMarkdown),
        })
        continue
      }

      const fallbackText = serializeUnknownAsMarkdown(block)

      if (fallbackText) {
        pendingBlocks.push({
          type: 'text',
          text: fallbackText,
        })
      }
    }

    flushPendingBlocks()
  }

  return events
}

export function inferTitle(messages: LiveSessionMessage[]): string {
  const firstNonEmptyMessage = messages.find((message) => message.content.trim().length > 0)
  return firstNonEmptyMessage?.content.slice(0, 80) || 'Untitled session'
}

export function resolveSessionTitle(
  session: StreamJsonRpcSession,
  messages: LiveSessionMessage[],
  fallbackTitle?: string,
): string {
  return (
    firstDefinedString(session.sessionTitle, session.title, session.name, fallbackTitle) ??
    inferTitle(messages)
  )
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content.map((entry) => extractMessageText(entry)).join('')
  }

  if (content && typeof content === 'object') {
    const objectValue = content as Record<string, unknown>

    if (objectValue.type === 'text' && typeof objectValue.text === 'string') {
      return objectValue.text
    }

    if (!('type' in objectValue) && 'content' in objectValue) {
      return extractMessageText(objectValue.content)
    }

    if (typeof objectValue.text === 'string') {
      return objectValue.text
    }
  }

  return ''
}

function extractMessageContentBlocks(content: unknown): TranscriptMessageContentBlock[] {
  if (!Array.isArray(content)) {
    return []
  }

  const blocks: TranscriptMessageContentBlock[] = []

  for (const entry of content) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const candidate = entry as Record<string, unknown>

    if (candidate.type === 'text' && typeof candidate.text === 'string') {
      blocks.push({
        type: 'text',
        text: candidate.text,
      })
      continue
    }

    if (candidate.type !== 'image' || !candidate.source || typeof candidate.source !== 'object') {
      continue
    }

    const source = candidate.source as Record<string, unknown>
    const data = typeof source.data === 'string' ? source.data : null
    const mediaType =
      typeof source.mediaType === 'string'
        ? source.mediaType
        : typeof source.media_type === 'string'
          ? source.media_type
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

function appendCompletedHistoryMessageEvent(
  events: SessionEvent[],
  {
    messageId,
    role,
    occurredAt,
    content,
    contentBlocks,
  }: {
    messageId: string
    role: SessionEventRole | 'tool' | undefined
    occurredAt: string | null
    content?: unknown
    contentBlocks?: TranscriptMessageContentBlock[]
  },
): void {
  if (role === 'tool') {
    return
  }

  const normalizedBlocks = contentBlocks ? [...contentBlocks] : extractMessageContentBlocks(content)
  const textContent =
    normalizedBlocks.length > 0
      ? extractTextFromContentBlocks(normalizedBlocks)
      : extractMessageText(content)

  if (textContent.trim().length === 0 && normalizedBlocks.length === 0) {
    return
  }

  events.push({
    type: 'message.completed',
    occurredAt: occurredAt ?? undefined,
    messageId,
    content: textContent,
    contentBlocks: normalizedBlocks.length > 0 ? normalizedBlocks : undefined,
    role,
  })
}

function extractTextFromContentBlocks(
  contentBlocks: readonly TranscriptMessageContentBlock[],
): string {
  return contentBlocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}

function toImageContentBlock(value: Record<string, unknown>): TranscriptMessageContentBlock | null {
  const source = isRecord(value.source) ? value.source : null
  const data = source && typeof source.data === 'string' ? source.data : null
  const mediaType =
    source && typeof source.media_type === 'string'
      ? source.media_type
      : source && typeof source.mediaType === 'string'
        ? source.mediaType
        : null

  if (!data || !mediaType) {
    return null
  }

  return {
    type: 'image',
    mediaType,
    data,
  }
}

function toToolUseId(value: unknown, messageId: string, blockIndex: number): string {
  return toOptionalString(value) ?? `${messageId}:tool:${blockIndex}`
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function readMessageTimestamp(message: StreamJsonRpcMessage): string | null {
  if (!isRecord(message)) {
    return null
  }

  return toOptionalString(message.timestamp) ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function firstDefinedString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    const candidate = toOptionalString(value)

    if (candidate) {
      return candidate
    }
  }

  return undefined
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

function isHistoryToolResultError(
  block: Record<string, unknown>,
  resultMarkdown: string | null,
): boolean {
  return (
    block.is_error === true ||
    block.isError === true ||
    (isRecord(block.content) &&
      (block.content.is_error === true ||
        block.content.isError === true ||
        typeof block.content.error === 'string')) ||
    Boolean(resultMarkdown && TOOL_ERROR_PREFIX.test(resultMarkdown.trim()))
  )
}

function normalizeMessageRole(role: unknown): SessionEventRole | 'tool' | undefined {
  if (role === 'assistant' || role === 'system' || role === 'user' || role === 'tool') {
    return role
  }

  return undefined
}
