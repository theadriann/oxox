import type {
  SessionTranscript,
  TranscriptEntry,
  TranscriptMessageContentBlock,
  TranscriptMessageEntry,
  TranscriptMessageRole,
  TranscriptToolCallEntry,
} from '../../../shared/ipc/contracts'
import { parseTranscriptFileFromPath, type TranscriptRecord } from '../artifacts/jsonlParser'

type TranscriptEnvelope = {
  id?: unknown
  message?: {
    content?: unknown
    role?: unknown
  }
  timestamp?: unknown
  type?: unknown
}

type TranscriptContentBlock = Record<string, unknown> & {
  type?: unknown
}

const TOOL_ERROR_PREFIX = /^error\b|^failed\b/i

export async function loadSessionTranscriptFromFile(
  sessionId: string,
  sourcePath: string,
): Promise<SessionTranscript> {
  const parsed = await parseTranscriptFileFromPath(sourcePath)
  return buildSessionTranscript(sessionId, sourcePath, parsed.records)
}

export function parseSessionTranscript(
  sessionId: string,
  sourcePath: string,
  transcriptText: string,
): SessionTranscript {
  const records = transcriptText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as TranscriptEnvelope)
    .filter(
      (
        record,
      ): record is TranscriptEnvelope & {
        type: 'message'
        message: NonNullable<TranscriptEnvelope['message']>
      } => record.type === 'message' && Boolean(record.message),
    )
    .map((record, lineIndex) => ({
      type: record.type,
      timestamp: typeof record.timestamp === 'string' ? record.timestamp : null,
      payload: {
        id: record.id,
        message: record.message,
        lineIndex,
      },
    }))

  return buildSessionTranscript(sessionId, sourcePath, records)
}

function buildSessionTranscript(
  sessionId: string,
  sourcePath: string,
  records: TranscriptRecord[],
): SessionTranscript {
  const entries: TranscriptEntry[] = []
  const toolCalls = new Map<string, TranscriptToolCallEntry>()

  for (const [lineIndex, record] of records.entries()) {
    const message = isRecord(record.payload.message)
      ? (record.payload.message as TranscriptEnvelope['message'])
      : null

    if (record.type !== 'message' || !message) {
      continue
    }

    appendMessageEntries({
      entries,
      message,
      messageId: typeof record.payload.id === 'string' ? record.payload.id : `message-${lineIndex}`,
      occurredAt: record.timestamp,
      toolCalls,
    })
  }

  return {
    sessionId,
    sourcePath,
    loadedAt: new Date().toISOString(),
    entries,
  }
}

interface AppendMessageEntriesOptions {
  entries: TranscriptEntry[]
  message: TranscriptEnvelope['message']
  messageId: string
  occurredAt: string | null
  toolCalls: Map<string, TranscriptToolCallEntry>
}

function appendMessageEntries({
  entries,
  message,
  messageId,
  occurredAt,
  toolCalls,
}: AppendMessageEntriesOptions): void {
  const role = toMessageRole(message?.role)
  const content =
    message && Array.isArray(message.content)
      ? message.content.filter((value): value is TranscriptContentBlock => isRecord(value))
      : []
  const textParts: string[] = []
  const contentBlocks: TranscriptMessageContentBlock[] = []
  let pendingTextStartIndex = 0

  const flushText = () => {
    const markdown = textParts.join('\n\n').trim()

    if (!markdown && contentBlocks.length === 0) {
      textParts.length = 0
      return
    }

    const entry: TranscriptMessageEntry = {
      kind: 'message',
      id: `${messageId}:${pendingTextStartIndex}`,
      sourceMessageId: messageId,
      occurredAt,
      role,
      markdown,
      contentBlocks: contentBlocks.length > 0 ? [...contentBlocks] : undefined,
    }

    textParts.length = 0
    contentBlocks.length = 0
    entries.push(entry)
  }

  if (content.length === 0) {
    flushText()
    return
  }

  for (const [blockIndex, block] of content.entries()) {
    switch (block.type) {
      case 'text': {
        if (typeof block.text === 'string' && block.text.trim().length > 0) {
          if (textParts.length === 0 && contentBlocks.length === 0) {
            pendingTextStartIndex = blockIndex
          }
          textParts.push(block.text)
          contentBlocks.push({
            type: 'text',
            text: block.text,
          })
        }
        break
      }
      case 'image': {
        const imageBlock = toImageContentBlock(block)
        if (imageBlock) {
          if (textParts.length === 0 && contentBlocks.length === 0) {
            pendingTextStartIndex = blockIndex
          }
          contentBlocks.push(imageBlock)
        }
        break
      }
      case 'tool_use': {
        flushText()
        const toolUseId =
          typeof block.id === 'string' && block.id.trim().length > 0
            ? block.id
            : `${messageId}:tool:${blockIndex}`
        const entry: TranscriptToolCallEntry = {
          kind: 'tool_call',
          id: toolUseId,
          toolUseId,
          occurredAt,
          toolName: typeof block.name === 'string' ? block.name : 'Tool',
          status: 'running',
          inputMarkdown: serializeUnknownAsMarkdown(block.input),
          resultMarkdown: null,
          resultIsError: false,
        }

        toolCalls.set(toolUseId, entry)
        entries.push(entry)
        break
      }
      case 'tool_result': {
        flushText()
        const toolUseId =
          typeof block.tool_use_id === 'string' && block.tool_use_id.trim().length > 0
            ? block.tool_use_id
            : `${messageId}:tool-result:${blockIndex}`
        const resultMarkdown = serializeUnknownAsMarkdown(block.content)
        const isError = isToolResultError(block, resultMarkdown)
        const matchingEntry = toolCalls.get(toolUseId)

        if (matchingEntry) {
          matchingEntry.status = isError ? 'failed' : 'completed'
          matchingEntry.resultMarkdown = resultMarkdown
          matchingEntry.resultIsError = isError
          continue
        }

        entries.push({
          kind: 'tool_call',
          id: toolUseId,
          toolUseId,
          occurredAt,
          toolName: 'Tool result',
          status: isError ? 'failed' : 'completed',
          inputMarkdown: '',
          resultMarkdown,
          resultIsError: isError,
        })
        break
      }
      default: {
        const markdown = serializeUnknownAsMarkdown(block)
        if (markdown) {
          textParts.push(markdown)
        }
      }
    }
  }

  flushText()
}

function toMessageRole(value: unknown): TranscriptMessageRole {
  if (value === 'assistant' || value === 'system' || value === 'user') {
    return value
  }

  return 'system'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function toImageContentBlock(block: TranscriptContentBlock): TranscriptMessageContentBlock | null {
  const source = isRecord(block.source) ? block.source : null
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

function serializeUnknownAsMarkdown(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const textValues = value
      .flatMap((item) =>
        isRecord(item) && typeof item.text === 'string'
          ? [item.text]
          : typeof item === 'string'
            ? [item]
            : [],
      )
      .filter((item) => item.trim().length > 0)

    if (textValues.length > 0) {
      return textValues.join('\n\n')
    }
  }

  if (value === null || typeof value === 'undefined') {
    return ''
  }

  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

function isToolResultError(block: TranscriptContentBlock, resultMarkdown: string): boolean {
  return (
    block.is_error === true ||
    block.isError === true ||
    (isRecord(block.content) &&
      (block.content.is_error === true ||
        block.content.isError === true ||
        typeof block.content.error === 'string')) ||
    TOOL_ERROR_PREFIX.test(resultMarkdown.trim())
  )
}
