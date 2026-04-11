import type {
  LiveSessionAskUserAnswerRecord,
  LiveSessionAskUserQuestionRecord,
  LiveSessionEventRecord,
  LiveSessionMessage,
  LiveSessionSnapshot,
  TranscriptMessageContentBlock,
} from '../../../../shared/ipc/contracts'
import type {
  AskUserTimelineItem,
  EventTone,
  MessageRole,
  MessageStatus,
  PermissionTimelineItem,
  RiskLevel,
  SystemEventTimelineItem,
  TimelineItem,
  ToolStatus,
} from './timelineTypes'

export function buildLiveTimeline(snapshot: LiveSessionSnapshot): TimelineItem[] {
  const orderedKeys: string[] = []
  const itemsByKey = new Map<string, TimelineItem>()
  const activeThinkingKeys = new Set<string>()
  const latestMessageSegmentById = new Map<string, string>()
  const messageSegmentKeysById = new Map<string, string[]>()
  const nextMessageSegmentIndexById = new Map<string, number>()
  const sealedMessageIds = new Set<string>()
  const eventBackedMessageIds = new Set(
    snapshot.events.flatMap((event) =>
      event.type === 'message.delta' || event.type === 'message.completed'
        ? [toOptionalString(event.messageId)].filter((value): value is string => Boolean(value))
        : [],
    ),
  )

  const setItem = (key: string, item: TimelineItem) => {
    if (!itemsByKey.has(key)) {
      orderedKeys.push(key)
    }
    itemsByKey.set(key, item)
  }

  const completeThinking = () => {
    for (const thinkingKey of Array.from(activeThinkingKeys)) {
      const existing = itemsByKey.get(thinkingKey)
      if (existing?.kind !== 'thinking') {
        continue
      }

      setItem(thinkingKey, {
        ...existing,
        status: 'completed',
      })
      activeThinkingKeys.delete(thinkingKey)
    }
  }

  const createMessageSegmentKey = (messageId: string) => {
    const nextIndex = nextMessageSegmentIndexById.get(messageId) ?? 0
    const key = messageKey(messageId, nextIndex)
    nextMessageSegmentIndexById.set(messageId, nextIndex + 1)
    latestMessageSegmentById.set(messageId, key)
    messageSegmentKeysById.set(messageId, [...(messageSegmentKeysById.get(messageId) ?? []), key])
    sealedMessageIds.delete(messageId)
    return key
  }

  const getMessageSegmentItems = (messageId: string) =>
    (messageSegmentKeysById.get(messageId) ?? [])
      .map((key) => itemsByKey.get(key))
      .filter(
        (item): item is Extract<TimelineItem, { kind: 'message' }> => item?.kind === 'message',
      )

  const adjustCompletedMessageContent = (messageId: string, content: string | null) => {
    if (content === null) {
      return content
    }

    const segmentItems = getMessageSegmentItems(messageId)

    if (segmentItems.length < 2) {
      return content
    }

    const prefix = segmentItems
      .slice(0, -1)
      .map((item) => item.content)
      .join('')

    if (prefix.length === 0 || !content.startsWith(prefix)) {
      return content
    }

    const remainingContent = content.slice(prefix.length)
    return remainingContent.length > 0
      ? remainingContent
      : (segmentItems.at(-1)?.content ?? content)
  }

  const getMessageSegmentKey = (messageId: string) => {
    const latestKey = latestMessageSegmentById.get(messageId)
    const latestItem = latestKey ? itemsByKey.get(latestKey) : null

    if (
      latestKey &&
      !sealedMessageIds.has(messageId) &&
      !(latestItem?.kind === 'message' && latestItem.status === 'completed')
    ) {
      return latestKey
    }

    return createMessageSegmentKey(messageId)
  }

  const getCompletedMessageSegmentKey = (
    messageId: string,
    content: string | null,
    role: unknown,
  ) => {
    const latestKey = latestMessageSegmentById.get(messageId)
    const latestItem = latestKey ? itemsByKey.get(latestKey) : null

    if (
      latestKey &&
      latestItem?.kind === 'message' &&
      latestItem.role === normalizeRole(role) &&
      content !== null &&
      latestItem.content === content
    ) {
      sealedMessageIds.delete(messageId)
      return latestKey
    }

    return getMessageSegmentKey(messageId)
  }

  const sealMessageSegments = () => {
    completeThinking()
    for (const messageId of latestMessageSegmentById.keys()) {
      sealedMessageIds.add(messageId)
    }
  }

  const completeMessageSegments = (messageId: string) => {
    for (const item of getMessageSegmentItems(messageId)) {
      if (item.status === 'completed') {
        continue
      }

      setItem(item.id, {
        ...item,
        status: 'completed',
      })
    }
  }

  for (const message of snapshot.messages) {
    if (eventBackedMessageIds.has(message.id)) {
      continue
    }

    const key = createMessageSegmentKey(message.id)
    setItem(key, completedMessageFromSnapshot(message, key))
  }

  for (const event of snapshot.events) {
    switch (event.type) {
      case 'message.delta': {
        const messageId = toOptionalString(event.messageId)
        const delta = toOptionalString(event.delta)

        if (!messageId || !delta) {
          setItem(
            fallbackEventKey(event, orderedKeys.length),
            fallbackEventItem(event, 'Live message delta', 'Malformed message delta event.'),
          )
          break
        }

        if (event.channel === 'thinking') {
          const key = thinkingKey(messageId)
          const existing = itemsByKey.get(key)
          const content =
            existing?.kind === 'thinking' ? `${existing.content}${delta}` : String(delta)

          setItem(key, {
            kind: 'thinking',
            id: key,
            messageId,
            content,
            status: 'streaming',
          })
          activeThinkingKeys.add(key)
          break
        }

        completeThinking()

        const key = getMessageSegmentKey(messageId)
        const existing = itemsByKey.get(key)

        if (existing?.kind === 'message' && existing.status === 'completed') {
          break
        }

        setItem(key, {
          kind: 'message',
          id: key,
          messageId,
          role: normalizeRole(event.channel),
          content:
            existing?.kind === 'message' && existing.status === 'streaming'
              ? `${existing.content}${delta}`
              : String(delta),
          status: 'streaming',
          occurredAt: toOptionalString(event.occurredAt),
          contentBlocks: undefined,
        })
        break
      }

      case 'message.completed': {
        const messageId = toOptionalString(event.messageId)
        const content = toOptionalString(event.content)
        const contentBlocks = toContentBlocks(event.contentBlocks)

        if (!messageId || (content === null && contentBlocks.length === 0)) {
          setItem(
            fallbackEventKey(event, orderedKeys.length),
            fallbackEventItem(event, 'Live message completed', 'Malformed message event.'),
          )
          break
        }

        completeThinking()
        completeMessageSegments(messageId)
        const adjustedContent =
          contentBlocks.length > 0 ? content : adjustCompletedMessageContent(messageId, content)
        const key = getCompletedMessageSegmentKey(messageId, adjustedContent, event.role)
        setItem(key, {
          kind: 'message',
          id: key,
          messageId,
          role: normalizeRole(event.role),
          content: adjustedContent ?? '',
          status: 'completed',
          occurredAt: toOptionalString(event.occurredAt),
          contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
        })
        break
      }

      case 'tool.progress': {
        sealMessageSegments()
        const toolUseId = toOptionalString(event.toolUseId) ?? `tool-${orderedKeys.length}`
        const key = toolKey(toolUseId)
        const existing = itemsByKey.get(key)
        const detail = toOptionalString(event.detail)
        const prevTool = existing?.kind === 'tool' ? existing : null
        const nextInputMarkdown =
          prevTool?.inputMarkdown ?? (isToolInputMarkdown(detail) ? detail : null)
        const historyDetail = detail && detail !== nextInputMarkdown ? detail : null
        const nextHistory = historyDetail
          ? dedupeHistory([...(prevTool?.progressHistory ?? []), historyDetail])
          : (prevTool?.progressHistory ?? [])

        setItem(key, {
          kind: 'tool',
          id: key,
          toolUseId,
          toolName: resolveToolName(event.toolName, prevTool?.toolName),
          status: normalizeToolStatus(event.status),
          occurredAt: toOptionalString(event.occurredAt),
          inputMarkdown: nextInputMarkdown,
          resultMarkdown: prevTool?.resultMarkdown ?? null,
          resultIsError: prevTool?.resultIsError ?? false,
          progressHistory: nextHistory,
          progressSummary:
            historyDetail ??
            prevTool?.progressSummary ??
            readableToolStatus(normalizeToolStatus(event.status)),
        })
        break
      }

      case 'tool.result': {
        sealMessageSegments()
        const toolUseId = toOptionalString(event.toolUseId) ?? `tool-${orderedKeys.length}`
        const key = toolKey(toolUseId)
        const existing = itemsByKey.get(key)
        const prevTool = existing?.kind === 'tool' ? existing : null
        const resultMarkdown = formatUnknownValue(event.content)
        const isError = Boolean(event.isError)

        setItem(key, {
          kind: 'tool',
          id: key,
          toolUseId,
          toolName: resolveToolName(event.toolName, prevTool?.toolName),
          status: isError ? 'failed' : 'completed',
          occurredAt: toOptionalString(event.occurredAt),
          inputMarkdown: prevTool?.inputMarkdown ?? null,
          resultMarkdown,
          resultIsError: isError,
          progressHistory: prevTool?.progressHistory ?? [],
          progressSummary: isError ? 'Tool run failed' : 'Tool run completed',
        })
        break
      }

      case 'permission.requested':
        sealMessageSegments()
        setItem(
          permissionKey(toOptionalString(event.requestId) ?? orderedKeys.length),
          buildPermissionItem(
            event,
            itemsByKey.get(permissionKey(toOptionalString(event.requestId) ?? orderedKeys.length)),
          ),
        )
        break

      case 'permission.resolved':
        sealMessageSegments()
        setItem(
          permissionKey(toOptionalString(event.requestId) ?? orderedKeys.length),
          resolvePermissionItem(
            toOptionalString(event.requestId) ?? String(orderedKeys.length),
            itemsByKey.get(permissionKey(toOptionalString(event.requestId) ?? orderedKeys.length)),
            event,
          ),
        )
        break

      case 'askUser.requested':
        sealMessageSegments()
        setItem(
          askUserKey(toOptionalString(event.requestId) ?? orderedKeys.length),
          buildAskUserItem(
            event,
            itemsByKey.get(askUserKey(toOptionalString(event.requestId) ?? orderedKeys.length)),
          ),
        )
        break

      case 'askUser.resolved':
        sealMessageSegments()
        setItem(
          askUserKey(toOptionalString(event.requestId) ?? orderedKeys.length),
          resolveAskUserItem(
            toOptionalString(event.requestId) ?? String(orderedKeys.length),
            itemsByKey.get(askUserKey(toOptionalString(event.requestId) ?? orderedKeys.length)),
            event,
          ),
        )
        break

      case 'session.statusChanged':
      case 'session.titleChanged':
      case 'session.settingsChanged':
      case 'session.tokenUsageChanged':
        sealMessageSegments()
        break

      case 'stream.warning':
        sealMessageSegments()
        setItem(
          eventKey(event.type, orderedKeys.length),
          systemEventItem({
            event,
            title: 'Stream warning',
            body: toOptionalString(event.warning) ?? 'The stream reported a warning.',
            details: [optionalDetail('Kind', event.kind)],
            tone: 'warning',
          }),
        )
        break

      case 'stream.error':
        sealMessageSegments()
        setItem(
          eventKey(event.type, orderedKeys.length),
          systemEventItem({
            event,
            title: event.recoverable ? 'Connection lost' : 'Stream error',
            body: event.recoverable
              ? 'Attempting to reconnect while preserving the partial response.'
              : (extractErrorMessage(event.error) ?? 'The live stream reported an unknown error.'),
            details: [
              extractErrorMessage(event.error),
              typeof event.recoverable === 'boolean'
                ? `Recoverable: ${event.recoverable ? 'yes' : 'no'}`
                : null,
            ],
            tone: 'danger',
          }),
        )
        break

      case 'stream.completed':
        sealMessageSegments()
        setItem(
          eventKey(event.type, orderedKeys.length),
          systemEventItem({
            event,
            title: 'Stream completed',
            body: `Reason: ${toOptionalString(event.reason) ?? 'completed'}`,
            tone: 'success',
          }),
        )
        break

      default:
        sealMessageSegments()
        setItem(
          fallbackEventKey(event, orderedKeys.length),
          fallbackEventItem(
            event,
            'Live event received',
            'The live session emitted an event that does not yet have a tailored renderer.',
          ),
        )
    }
  }

  return orderedKeys
    .map((key) => itemsByKey.get(key))
    .filter((item): item is TimelineItem => Boolean(item))
}

function completedMessageFromSnapshot(message: LiveSessionMessage, key: string): TimelineItem {
  return {
    kind: 'message',
    id: key,
    messageId: message.id,
    role: normalizeRole(message.role),
    content: message.content,
    status: 'completed' as MessageStatus,
    occurredAt: null,
    contentBlocks: message.contentBlocks,
  }
}

function buildPermissionItem(
  event: LiveSessionEventRecord,
  existingItem: TimelineItem | undefined,
): PermissionTimelineItem {
  const requestId = toOptionalString(event.requestId) ?? 'permission-request'
  const prev = existingItem?.kind === 'permission' ? existingItem : null

  return {
    kind: 'permission',
    id: permissionKey(requestId),
    requestId,
    description:
      toOptionalString(event.reason) ??
      prev?.description ??
      'The session is requesting approval to continue.',
    riskLevel:
      prev && prev.riskLevel !== 'unknown' ? prev.riskLevel : normalizeRiskLevel(event.riskLevel),
    options: prev && prev.options.length > 0 ? prev.options : toStringArray(event.options),
    toolUseIds:
      prev && prev.toolUseIds.length > 0 ? prev.toolUseIds : toStringArray(event.toolUseIds),
    selectedOption: prev?.selectedOption ?? null,
  }
}

function resolvePermissionItem(
  requestId: string,
  existingItem: TimelineItem | undefined,
  event: LiveSessionEventRecord,
): PermissionTimelineItem {
  const prev = existingItem?.kind === 'permission' ? existingItem : null

  return {
    kind: 'permission',
    id: permissionKey(requestId),
    requestId,
    description: prev?.description ?? 'The session requested permission to continue.',
    riskLevel: prev?.riskLevel ?? normalizeRiskLevel(event.riskLevel),
    options: prev?.options ?? [],
    toolUseIds: prev?.toolUseIds ?? toStringArray(event.toolUseIds),
    selectedOption: toOptionalString(event.selectedOption),
  }
}

function buildAskUserItem(
  event: LiveSessionEventRecord,
  existingItem: TimelineItem | undefined,
): AskUserTimelineItem {
  const requestId = toOptionalString(event.requestId) ?? 'ask-user-request'
  const prev = existingItem?.kind === 'askUser' ? existingItem : null
  const questions =
    toAskUserQuestions(event.questions) ??
    (prev && prev.questions.length > 0
      ? prev.questions
      : [
          {
            index: 0,
            topic: 'Question',
            question:
              toOptionalString(event.prompt) ??
              prev?.prompt ??
              'The agent is waiting for user input.',
            options: prev && prev.options.length > 0 ? prev.options : toStringArray(event.options),
          },
        ])

  return {
    kind: 'askUser',
    id: askUserKey(requestId),
    requestId,
    prompt: questions[0]?.question ?? 'The agent is waiting for user input.',
    options: questions[0]?.options ?? [],
    questions,
    submittedAnswers: prev?.submittedAnswers ?? null,
  }
}

function resolveAskUserItem(
  requestId: string,
  existingItem: TimelineItem | undefined,
  event: LiveSessionEventRecord,
): AskUserTimelineItem {
  const prev = existingItem?.kind === 'askUser' ? existingItem : null
  const submittedAnswers =
    toAskUserAnswers(event.answers) ??
    (toOptionalString(event.selectedOption)
      ? [
          {
            index: 0,
            question: prev?.questions[0]?.question ?? prev?.prompt ?? 'Answer',
            answer: toOptionalString(event.selectedOption) ?? '',
          },
        ]
      : null)

  return {
    kind: 'askUser',
    id: askUserKey(requestId),
    requestId,
    prompt: prev?.prompt ?? 'The agent is waiting for user input.',
    options: prev?.options ?? [],
    questions: prev?.questions ?? [],
    submittedAnswers,
  }
}

function systemEventItem({
  event,
  title,
  body,
  details = [],
  tone = 'default',
}: {
  event: LiveSessionEventRecord
  title: string
  body: string
  details?: Array<string | null>
  tone?: EventTone
}): SystemEventTimelineItem {
  return {
    kind: 'event',
    id: eventKey(event.type, toOptionalString(event.occurredAt) ?? body),
    title,
    body,
    typeLabel: event.type,
    tone,
    details: details.filter((d): d is string => Boolean(d)),
  }
}

function fallbackEventItem(
  event: LiveSessionEventRecord,
  title: string,
  body: string,
): SystemEventTimelineItem {
  return {
    kind: 'event',
    id: fallbackEventKey(event, body),
    title,
    body,
    typeLabel: event.type,
    tone: 'warning',
    details: [formatUnknownValue(event)],
  }
}

function normalizeRole(role: unknown): MessageRole {
  if (role === 'system') return 'system'
  if (role === 'user') return 'user'
  return 'assistant'
}

function normalizeToolStatus(status: unknown): ToolStatus {
  const value = String(status ?? 'running').toLowerCase()
  if (value.includes('fail') || value.includes('error')) return 'failed'
  if (value.includes('complete') || value.includes('success') || value.includes('done')) {
    return 'completed'
  }
  return 'running'
}

function readableToolStatus(status: ToolStatus): string {
  switch (status) {
    case 'completed':
      return 'Tool run completed'
    case 'failed':
      return 'Tool run failed'
    default:
      return 'Tool is running'
  }
}

export function formatUnknownValue(value: unknown): string {
  if (value === null || typeof value === 'undefined') return 'No additional details.'
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  try {
    return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
  } catch {
    return String(value)
  }
}

function extractErrorMessage(value: unknown): string | null {
  if (value instanceof Error) return value.message
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

function optionalDetail(label: string, value: unknown): string | null {
  const v = toOptionalString(value)
  return v ? `${label}: ${v}` : null
}

function normalizeRiskLevel(value: unknown): RiskLevel {
  const v = toOptionalString(value)?.toLowerCase()
  if (v === 'low' || v === 'medium' || v === 'high') return v
  return 'unknown'
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []
}

function toContentBlocks(value: unknown): TranscriptMessageContentBlock[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is TranscriptMessageContentBlock =>
          isRecord(entry) &&
          ((entry.type === 'text' && typeof entry.text === 'string') ||
            (entry.type === 'image' &&
              typeof entry.mediaType === 'string' &&
              typeof entry.data === 'string')),
      )
    : []
}

function toAskUserQuestions(value: unknown): LiveSessionAskUserQuestionRecord[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const questions = value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.index !== 'number' ||
      typeof entry.question !== 'string' ||
      typeof entry.topic !== 'string'
    ) {
      return []
    }

    return [
      {
        index: entry.index,
        topic: entry.topic,
        question: entry.question,
        options: toStringArray(entry.options),
      },
    ]
  })

  return questions.length > 0 ? questions : null
}

function toAskUserAnswers(value: unknown): LiveSessionAskUserAnswerRecord[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const answers = value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.index !== 'number' ||
      typeof entry.question !== 'string' ||
      typeof entry.answer !== 'string'
    ) {
      return []
    }

    return [
      {
        index: entry.index,
        question: entry.question,
        answer: entry.answer,
      },
    ]
  })

  return answers.length > 0 ? answers : null
}

function dedupeHistory(entries: string[]): string[] {
  return entries.filter((entry, index) => entries.indexOf(entry) === index)
}

function resolveToolName(value: unknown, previousToolName?: string | null): string {
  const nextToolName = toOptionalString(value)

  if (nextToolName && nextToolName !== 'Unknown tool') {
    return nextToolName
  }

  if (previousToolName && previousToolName.length > 0) {
    return previousToolName
  }

  return 'Unknown tool'
}

function isToolInputMarkdown(value: string | null): value is string {
  if (!value) return false
  return value.startsWith('```') || value.includes('*** Begin Patch')
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function messageKey(messageId: string, segmentIndex = 0): string {
  return `message:${messageId}:${segmentIndex}`
}

function thinkingKey(messageId: string): string {
  return `thinking:${messageId}`
}

function toolKey(toolUseId: string): string {
  return `tool:${toolUseId}`
}

function permissionKey(requestId: string | number): string {
  return `permission:${requestId}`
}

function askUserKey(requestId: string | number): string {
  return `ask-user:${requestId}`
}

function eventKey(type: string, suffix: string | number): string {
  return `${type}:${suffix}`
}

function fallbackEventKey(event: LiveSessionEventRecord, suffix: string | number): string {
  return eventKey(event.type, suffix)
}
