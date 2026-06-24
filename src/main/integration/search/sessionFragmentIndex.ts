import type { TranscriptEntry } from '../../../shared/ipc/contracts'
import { normalizeSearchText } from '../../../shared/search/sessionSearchQuery'
import type { TranscriptRecord } from '../artifacts/jsonlParser'

export type SearchFragmentSourceKind =
  | 'block'
  | 'tool_call'
  | 'tool_result'
  | 'file_snapshot'
  | 'compaction'
  | 'settings'
  | 'todo'

export interface SearchFragmentDocument {
  id: string
  sessionId: string
  projectId: string | null
  sourceKind: SearchFragmentSourceKind
  sourceId: string
  ftsSnippet?: string | null
  title: string
  subtitle: string
  body: string
  preview: string
  role: string | null
  toolName: string | null
  filePath: string | null
  timestamp: string | null
  status: string | null
  rankBoost: number
  messageId: string | null
  toolCallId: string | null
}

interface ExtractTranscriptSearchFragmentsOptions {
  entries: TranscriptEntry[]
  sessionId: string
  projectId?: string | null
  settings?: SessionSettingsSearchSource | null
  snapshots?: SessionFileSnapshotSearchSource[]
  sourceRecords?: TranscriptRecord[]
}

export type SessionSettingsSearchSource = Record<string, unknown>

const MAX_FRAGMENT_INPUT_CHARS = 4_000
const MAX_FRAGMENT_MESSAGE_CHARS = 4_000
const MAX_FRAGMENT_RESULT_CHARS = 8_000
const FILE_WITH_EXTENSION_PATTERN = /[\w./@-]+\.[A-Za-z0-9]{1,12}/gu
const PATH_LIKE_PATTERN = /\/(?:[\w@.-]+\/)+[\w@.-]+/gu

export interface SessionFileSnapshotSearchSource {
  capturedAt?: number | string | null
  changeKind?: string | null
  contentHash?: string | null
  extension?: string | null
  fileName?: string | null
  filePath: string
  messageId?: string | null
  messageIndex?: number | null
  sizeBytes?: number | null
  timestamp?: number | string | null
  toolCallId?: string | null
}

export function extractTranscriptSearchFragments({
  entries,
  projectId = null,
  sessionId,
  settings,
  snapshots = [],
  sourceRecords = [],
}: ExtractTranscriptSearchFragmentsOptions): SearchFragmentDocument[] {
  return [
    ...extractSettingsFragments({ projectId, sessionId, settings }),
    ...sourceRecords.flatMap((record) =>
      extractSourceRecordFragments({ projectId, record, sessionId }),
    ),
    ...snapshots.flatMap((snapshot, index) =>
      extractSnapshotFragment({ index, projectId, sessionId, snapshot }),
    ),
    ...entries.flatMap((entry) => {
      if (entry.kind === 'message') {
        const markdown = capRawSearchText(entry.markdown, MAX_FRAGMENT_MESSAGE_CHARS)
        const body = normalizeSearchText(markdown)

        if (!body) {
          return []
        }

        return [
          {
            id: `${sessionId}:message:${entry.id}`,
            sessionId,
            projectId,
            sourceKind: 'block',
            sourceId: entry.id,
            title: `${capitalize(entry.role)} message`,
            subtitle: entry.sourceMessageId ?? entry.id,
            body,
            preview: createPreview(markdown),
            role: entry.role,
            toolName: null,
            filePath: extractFilePath(markdown),
            timestamp: entry.occurredAt,
            status: null,
            rankBoost: entry.role === 'user' ? 1.35 : 1,
            messageId: entry.sourceMessageId ?? entry.id,
            toolCallId: null,
          },
        ]
      }

      const input = capRawSearchText(entry.inputMarkdown.trim(), MAX_FRAGMENT_INPUT_CHARS)
      const result = capRawSearchText(entry.resultMarkdown?.trim() ?? '', MAX_FRAGMENT_RESULT_CHARS)
      const body = normalizeSearchText(buildToolSearchBody(entry.toolName, input, result))

      if (!body) {
        return []
      }

      const isError = entry.resultIsError || entry.status === 'failed'
      const resultBody = normalizeSearchText(result)
      const fragments: SearchFragmentDocument[] = [
        {
          id: `${sessionId}:tool:${entry.toolUseId}`,
          sessionId,
          projectId,
          sourceKind: 'tool_call',
          sourceId: entry.toolUseId,
          title: entry.toolName,
          subtitle: isError ? 'Tool error' : 'Tool call',
          body,
          preview: createPreview(extractImportantToolText(entry.toolName, result) || input),
          role: null,
          toolName: normalizeSearchText(entry.toolName),
          filePath: extractFilePath([input, result].join('\n')),
          timestamp: entry.occurredAt,
          status: isError ? 'error' : entry.status,
          rankBoost: isError ? 1.25 : 0.8,
          messageId: null,
          toolCallId: entry.toolUseId,
        },
      ]

      if (resultBody) {
        fragments.push({
          id: `${sessionId}:tool-result:${entry.toolUseId}`,
          sessionId,
          projectId,
          sourceKind: 'tool_result',
          sourceId: entry.toolUseId,
          title: entry.toolName,
          subtitle: isError ? 'Tool error' : 'Tool result',
          body: resultBody,
          preview: createPreview(extractImportantToolText(entry.toolName, result) || result),
          role: null,
          toolName: normalizeSearchText(entry.toolName),
          filePath: extractFilePath(result),
          timestamp: entry.occurredAt,
          status: isError ? 'error' : entry.status,
          rankBoost: isError ? 1.1 : 0.65,
          messageId: null,
          toolCallId: entry.toolUseId,
        })
      }

      return fragments
    }),
  ]
}

function extractSettingsFragments({
  projectId,
  sessionId,
  settings,
}: {
  projectId: string | null
  sessionId: string
  settings?: SessionSettingsSearchSource | null
}): SearchFragmentDocument[] {
  const body = normalizeSearchText(serializeSafeSettings(settings))

  if (!body) {
    return []
  }

  return [
    {
      id: `${sessionId}:settings`,
      sessionId,
      projectId,
      sourceKind: 'settings',
      sourceId: `${sessionId}:settings`,
      title: 'Session settings',
      subtitle: 'Settings',
      body,
      preview: createPreview(body),
      role: null,
      toolName: null,
      filePath: null,
      timestamp: null,
      status: null,
      rankBoost: 0.7,
      messageId: null,
      toolCallId: null,
    },
  ]
}

function extractSourceRecordFragments({
  projectId,
  record,
  sessionId,
}: {
  projectId: string | null
  record: TranscriptRecord
  sessionId: string
}): SearchFragmentDocument[] {
  switch (record.type) {
    case 'todo_state':
      return extractTodoFragments({ projectId, record, sessionId })
    case 'compaction_state':
      return extractCompactionFragments({ projectId, record, sessionId })
    case 'file_snapshot':
      return extractFileSnapshotRecordFragments({ projectId, record, sessionId })
    default:
      return []
  }
}

function extractTodoFragments({
  projectId,
  record,
  sessionId,
}: {
  projectId: string | null
  record: TranscriptRecord
  sessionId: string
}): SearchFragmentDocument[] {
  const body = normalizeSearchText(extractTodoText(record.payload))

  if (!body) {
    return []
  }

  const sourceId = record.recordId ?? `todo:${record.lineNo}`

  return [
    {
      id: `${sessionId}:todo:${sourceId}`,
      sessionId,
      projectId,
      sourceKind: 'todo',
      sourceId,
      title: 'Todo state',
      subtitle: record.timestamp ?? `Line ${record.lineNo}`,
      body,
      preview: createPreview(body),
      role: null,
      toolName: null,
      filePath: extractFilePath(body),
      timestamp: record.timestamp,
      status: null,
      rankBoost: 1.15,
      messageId: null,
      toolCallId: null,
    },
  ]
}

function extractCompactionFragments({
  projectId,
  record,
  sessionId,
}: {
  projectId: string | null
  record: TranscriptRecord
  sessionId: string
}): SearchFragmentDocument[] {
  const summary = isRecord(record.payload.summary) ? record.payload.summary : record.payload
  const text = firstString(summary.text, summary.summary, record.payload.summaryText)
  const body = normalizeSearchText(
    [
      text,
      firstString(summary.kind, record.payload.summaryKind),
      optionalNumberText('tokens', firstNumber(summary.tokenCount, record.payload.summaryTokens)),
      optionalNumberText('removed', firstNumber(record.payload.removedCount)),
    ]
      .filter(Boolean)
      .join('\n'),
  )

  if (!body) {
    return []
  }

  const sourceId =
    record.compactionSummaryId ??
    firstString(summary.id, record.payload.summaryId) ??
    `compaction:${record.lineNo}`

  return [
    {
      id: `${sessionId}:compaction:${sourceId}`,
      sessionId,
      projectId,
      sourceKind: 'compaction',
      sourceId,
      title: 'Compaction summary',
      subtitle: record.timestamp ?? `Line ${record.lineNo}`,
      body,
      preview: createPreview(text ?? body),
      role: null,
      toolName: null,
      filePath: extractFilePath(body),
      timestamp: record.timestamp,
      status: null,
      rankBoost: 0.9,
      messageId: null,
      toolCallId: null,
    },
  ]
}

function extractFileSnapshotRecordFragments({
  projectId,
  record,
  sessionId,
}: {
  projectId: string | null
  record: TranscriptRecord
  sessionId: string
}): SearchFragmentDocument[] {
  const filePath = firstString(
    record.payload.filePath,
    record.payload.file_path,
    record.payload.path,
  )

  if (!filePath) {
    return []
  }

  return [
    createSnapshotFragment({
      index: record.lineNo,
      projectId,
      sessionId,
      snapshot: {
        capturedAt: record.timestamp,
        changeKind: firstString(record.payload.changeKind, record.payload.change_kind),
        contentHash: firstString(record.payload.contentHash, record.payload.content_hash),
        filePath,
        messageId: firstString(record.payload.messageId, record.payload.message_id),
        sizeBytes: firstNumber(record.payload.sizeBytes, record.payload.size_bytes) ?? null,
        toolCallId: firstString(record.payload.toolCallId, record.payload.tool_call_id),
      },
    }),
  ]
}

function extractSnapshotFragment({
  index,
  projectId,
  sessionId,
  snapshot,
}: {
  index: number
  projectId: string | null
  sessionId: string
  snapshot: SessionFileSnapshotSearchSource
}): SearchFragmentDocument[] {
  const fragment = createSnapshotFragment({ index, projectId, sessionId, snapshot })
  return fragment ? [fragment] : []
}

function createSnapshotFragment({
  index,
  projectId,
  sessionId,
  snapshot,
}: {
  index: number
  projectId: string | null
  sessionId: string
  snapshot: SessionFileSnapshotSearchSource
}): SearchFragmentDocument | null {
  const filePath = normalizeSearchText(snapshot.filePath)

  if (!filePath) {
    return null
  }

  const sourceId = `${snapshot.messageId ?? 'snapshot'}:${snapshot.toolCallId ?? index}:${filePath}`
  const body = normalizeSearchText(
    [
      snapshot.filePath,
      snapshot.fileName,
      snapshot.extension,
      snapshot.contentHash,
      optionalNumberText('size', snapshot.sizeBytes ?? undefined),
      snapshot.changeKind,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return {
    id: `${sessionId}:file:${sourceId}`,
    sessionId,
    projectId,
    sourceKind: 'file_snapshot',
    sourceId,
    title: snapshot.fileName ?? filePath.split('/').at(-1) ?? 'File snapshot',
    subtitle: 'File snapshot',
    body,
    preview: createPreview(snapshot.filePath),
    role: null,
    toolName: null,
    filePath: snapshot.filePath,
    timestamp: typeof snapshot.timestamp === 'string' ? snapshot.timestamp : null,
    status: snapshot.changeKind ?? null,
    rankBoost: 1.4,
    messageId: snapshot.messageId ?? null,
    toolCallId: snapshot.toolCallId ?? null,
  }
}

function createPreview(value: string): string {
  const normalizedWhitespace = capRawSearchText(value, MAX_FRAGMENT_RESULT_CHARS)
    .replace(/\s+/gu, ' ')
    .trim()

  return normalizedWhitespace.length > 240
    ? `${normalizedWhitespace.slice(0, 237).trimEnd()}...`
    : normalizedWhitespace
}

function capRawSearchText(value: string, maxChars: number): string {
  if (maxChars <= 0 || value.length <= maxChars) {
    return value
  }

  return value.slice(0, maxChars)
}

function buildToolSearchBody(toolName: string, input: string, result: string): string {
  const normalizedToolName = toolName.toLowerCase()
  const importantResult = extractImportantToolText(toolName, result)

  if (normalizedToolName === 'execute') {
    return [toolName, extractCommand(input), importantResult].filter(Boolean).join('\n')
  }

  if (['applypatch', 'edit', 'read', 'grep', 'glob', 'ls'].includes(normalizedToolName)) {
    return [toolName, extractFileMentions(input), extractCommand(input), importantResult]
      .filter(Boolean)
      .join('\n')
  }

  if (normalizedToolName === 'todowrite') {
    return [toolName, extractTodoTextFromRaw(input), importantResult].filter(Boolean).join('\n')
  }

  if (normalizedToolName.startsWith('linear') || normalizedToolName === 'task') {
    return [toolName, extractEntityLines(input), extractEntityLines(result)]
      .filter(Boolean)
      .join('\n')
  }

  return [toolName, input, importantResult || result].filter(Boolean).join('\n')
}

function extractImportantToolText(toolName: string, result: string): string {
  if (!result) {
    return ''
  }

  const normalizedToolName = toolName.toLowerCase()
  const lines = result
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return ''
  }

  const importantLines = lines.filter(
    (line) =>
      /\b(error|failed|fail|exception|resizeobserver|exit code|enoent|eacces)\b|[A-Z]+-\d+/iu.test(
        line,
      ) || hasPathLikeText(line),
  )

  if (importantLines.length > 0) {
    return importantLines.join('\n')
  }

  if (normalizedToolName === 'execute') {
    return lines.slice(-8).join('\n')
  }

  return lines.slice(0, 12).join('\n')
}

function extractCommand(value: string): string {
  const parsed = parseJsonLike(value)
  const command = isRecord(parsed) ? firstString(parsed.command, parsed.cmd) : null

  return command ?? stripMarkdownFences(value)
}

function extractFileMentions(value: string): string {
  const mentions = new Set<string>()
  const parsed = parseJsonLike(value)

  if (isRecord(parsed)) {
    collectFileMentions(parsed, mentions)
  }

  for (const match of extractPathLikeMatches(value)) {
    mentions.add(match)
  }

  return [...mentions].join('\n')
}

function collectFileMentions(value: unknown, mentions: Set<string>): void {
  if (typeof value === 'string') {
    for (const match of extractPathLikeMatches(value)) {
      mentions.add(match)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFileMentions(item, mentions)
    }
    return
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      collectFileMentions(item, mentions)
    }
  }
}

function extractEntityLines(value: string): string {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) => /[A-Z]+-\d+|https?:\/\/\S+|[a-f0-9]{7,40}/u.test(line) || hasPathLikeText(line),
    )
    .slice(0, 16)
    .join('\n')
}

function extractTodoText(payload: Record<string, unknown>): string {
  const todos = payload.todos ?? payload.items ?? payload.todoItems

  if (typeof todos === 'string') {
    return todos
  }

  if (Array.isArray(todos)) {
    return todos
      .flatMap((todo) => {
        if (!isRecord(todo)) {
          return []
        }

        const text = firstString(todo.content, todo.text, todo.title)
        const status = firstString(todo.status, todo.state)

        return text ? [`${status ? `${status}: ` : ''}${text}`] : []
      })
      .join('\n')
  }

  return firstString(payload.content, payload.text, payload.summary) ?? ''
}

function extractTodoTextFromRaw(value: string): string {
  const parsed = parseJsonLike(value)
  if (isRecord(parsed)) {
    return extractTodoText(parsed)
  }

  return stripMarkdownFences(value)
}

function serializeSafeSettings(settings?: SessionSettingsSearchSource | null): string {
  if (!settings) {
    return ''
  }

  const nestedSettings = isRecord(settings.settings) ? settings.settings : {}
  const safeEntries = [
    [
      'model',
      firstString(settings.modelId, settings.model, nestedSettings.modelId, nestedSettings.model),
    ],
    ['reasoning effort', firstString(settings.reasoningEffort, nestedSettings.reasoningEffort)],
    [
      'autonomy',
      firstString(settings.autonomyMode, settings.autonomyLevel, nestedSettings.autonomyMode),
    ],
    ['provider', firstString(settings.provider, settings.providerLock, nestedSettings.provider)],
    [
      'compaction token limit',
      firstNumber(settings.compactionTokenLimit, nestedSettings.compactionTokenLimit)?.toString(),
    ],
    [
      'enabled tools',
      stringArray(settings.enabledToolIds, nestedSettings.enabledToolIds).join(' '),
    ],
    [
      'disabled tools',
      stringArray(settings.disabledToolIds, nestedSettings.disabledToolIds).join(' '),
    ],
    ['active time', firstNumber(settings.activeTimeMs, settings.activeTimeSeconds)?.toString()],
  ]

  return safeEntries.flatMap(([label, value]) => (value ? [`${label}: ${value}`] : [])).join('\n')
}

function stripMarkdownFences(value: string): string {
  const trimmed = value.trim()
  const fenceMatch = /^```(?:\w+)?\n([\s\S]*?)```\s*$/u.exec(trimmed)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

function parseJsonLike(value: string): unknown {
  const stripped = stripMarkdownFences(value)

  try {
    return JSON.parse(stripped)
  } catch {
    return null
  }
}

function extractFilePath(value: string): string | null {
  const match = extractPathLikeMatches(value)[0]

  return match ? normalizeSearchText(match) : null
}

function hasPathLikeText(value: string): boolean {
  return extractPathLikeMatches(value).length > 0
}

function extractPathLikeMatches(value: string): string[] {
  return [...value.matchAll(FILE_WITH_EXTENSION_PATTERN), ...value.matchAll(PATH_LIKE_PATTERN)]
    .map((match) => match[0].replace(/[),:;]+$/u, ''))
    .filter((match) => match.length > 1)
}

function capitalize(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return null
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function optionalNumberText(label: string, value: number | null | undefined): string | null {
  return typeof value === 'number' ? `${label}: ${value}` : null
}

function stringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return value
    }
  }

  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
