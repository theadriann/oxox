import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import type {
  SessionTranscript,
  TranscriptEntry,
  TranscriptMessageContentBlock,
  TranscriptMessageEntry,
  TranscriptMessageRole,
  TranscriptToolCallEntry,
} from '../../../shared/ipc/contracts'
import { parseTranscriptFileFromPath, type TranscriptRecord } from '../artifacts/jsonlParser'
import type {
  SessionFileSnapshotSearchSource,
  SessionSettingsSearchSource,
} from '../search/sessionFragmentIndex'

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
  rewindBoundaryMessageIdsByMessageId?: ReadonlyMap<string, string>,
): Promise<SessionTranscript> {
  const parsed = await parseTranscriptFileFromPath(sourcePath)
  const sidecars = readTranscriptSidecars(sourcePath)
  return {
    ...buildSessionTranscript(
      sessionId,
      sourcePath,
      parsed.records,
      rewindBoundaryMessageIdsByMessageId,
    ),
    ...sidecars,
    sourceRecords: parsed.records,
  }
}

export function parseSessionTranscript(
  sessionId: string,
  sourcePath: string,
  transcriptText: string,
  rewindBoundaryMessageIdsByMessageId?: ReadonlyMap<string, string>,
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

  return buildSessionTranscript(sessionId, sourcePath, records, rewindBoundaryMessageIdsByMessageId)
}

function buildSessionTranscript(
  sessionId: string,
  sourcePath: string,
  records: TranscriptRecord[],
  rewindBoundaryMessageIdsByMessageId?: ReadonlyMap<string, string>,
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
      rewindBoundaryMessageId:
        typeof record.payload.id === 'string'
          ? rewindBoundaryMessageIdsByMessageId?.get(record.payload.id)
          : undefined,
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

function readTranscriptSidecars(sourcePath: string): {
  settings?: SessionSettingsSearchSource
  snapshots?: SessionFileSnapshotSearchSource[]
} {
  const sessionArtifactBasePath = join(dirname(sourcePath), basename(sourcePath, '.jsonl'))
  const settings = readSettingsSidecar(`${sessionArtifactBasePath}.settings.json`)
  const snapshots = readSnapshotsSidecar(`${sessionArtifactBasePath}.snapshots.json`)

  return {
    ...(settings ? { settings } : {}),
    ...(snapshots.length > 0 ? { snapshots } : {}),
  }
}

function readSettingsSidecar(filePath: string): SessionSettingsSearchSource | null {
  const parsed = readJsonSidecar(filePath)

  if (!isRecord(parsed)) {
    return null
  }

  const nestedSettings = isRecord(parsed.settings) ? parsed.settings : {}
  const safeNestedSettings = pickDefined({
    autonomyMode: toOptionalString(nestedSettings.autonomyMode),
    compactionTokenLimit: toOptionalNumber(nestedSettings.compactionTokenLimit),
    modelId: toOptionalString(nestedSettings.modelId ?? nestedSettings.model),
    reasoningEffort: toOptionalString(nestedSettings.reasoningEffort),
  })

  return pickDefined({
    activeTimeMs: toOptionalNumber(parsed.activeTimeMs),
    autonomyMode: toOptionalString(parsed.autonomyMode),
    compactionTokenLimit: toOptionalNumber(parsed.compactionTokenLimit),
    disabledToolIds: toOptionalStringArray(parsed.disabledToolIds),
    enabledToolIds: toOptionalStringArray(parsed.enabledToolIds),
    modelId: toOptionalString(parsed.modelId ?? parsed.model),
    providerLock: toOptionalString(parsed.providerLock),
    reasoningEffort: toOptionalString(parsed.reasoningEffort),
    ...(Object.keys(safeNestedSettings).length > 0 ? { settings: safeNestedSettings } : {}),
  })
}

function readSnapshotsSidecar(filePath: string): SessionFileSnapshotSearchSource[] {
  const parsed = readJsonSidecar(filePath)
  const snapshots = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.snapshots)
      ? parsed.snapshots
      : []

  return snapshots.flatMap((snapshot): SessionFileSnapshotSearchSource[] => {
    if (!isRecord(snapshot)) {
      return []
    }

    const filePath = toOptionalString(snapshot.filePath ?? snapshot.file_path ?? snapshot.path)

    if (!filePath) {
      return []
    }

    return [
      {
        capturedAt: toOptionalNumber(snapshot.capturedAt ?? snapshot.captured_at) ?? null,
        changeKind: toOptionalString(snapshot.changeKind ?? snapshot.change_kind),
        contentHash: toOptionalString(snapshot.contentHash ?? snapshot.content_hash),
        extension: toOptionalString(snapshot.extension),
        fileName: toOptionalString(snapshot.fileName ?? snapshot.file_name),
        filePath,
        messageId: toOptionalString(snapshot.messageId ?? snapshot.message_id),
        messageIndex: toOptionalNumber(snapshot.messageIndex ?? snapshot.message_index) ?? null,
        sizeBytes: toOptionalNumber(snapshot.sizeBytes ?? snapshot.size_bytes) ?? null,
        timestamp: toOptionalNumber(snapshot.timestamp) ?? toOptionalString(snapshot.timestamp),
        toolCallId: toOptionalString(snapshot.toolCallId ?? snapshot.tool_call_id),
      },
    ]
  })
}

function readJsonSidecar(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return null
    }

    if (error instanceof SyntaxError) {
      return null
    }

    throw error
  }
}

interface AppendMessageEntriesOptions {
  entries: TranscriptEntry[]
  message: TranscriptEnvelope['message']
  messageId: string
  occurredAt: string | null
  rewindBoundaryMessageId?: string
  toolCalls: Map<string, TranscriptToolCallEntry>
}

function appendMessageEntries({
  entries,
  message,
  messageId,
  occurredAt,
  rewindBoundaryMessageId,
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
      rewindBoundaryMessageId,
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

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toOptionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? [...value]
    : undefined
}

function pickDefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => typeof entryValue !== 'undefined'),
  ) as Partial<T>
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
