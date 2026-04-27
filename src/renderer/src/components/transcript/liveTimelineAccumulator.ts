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
  ThinkingTimelineItem,
  TimelineItem,
  ToolStatus,
} from './timelineTypes'

export interface LiveTimelineAccumulator {
  snapshot: LiveSessionSnapshot | null
  timelineItems: TimelineItem[]
  keyIndexByKey: Map<string, number>
  itemsByKey: Map<string, TimelineItem>
  activeThinkingKeys: Set<string>
  latestMessageSegmentById: Map<string, string>
  messageSegmentKeysById: Map<string, string[]>
  nextMessageSegmentIndexById: Map<string, number>
  sealedMessageIds: Set<string>
  eventBackedMessageIds: Set<string>
}

export interface LiveTimelineSyncResult {
  didChange: boolean
  items: TimelineItem[]
}

export function createLiveTimelineAccumulator(
  snapshot?: LiveSessionSnapshot,
): LiveTimelineAccumulator {
  const accumulator = createEmptyAccumulator()

  if (snapshot) {
    rebuildLiveTimelineAccumulator(accumulator, snapshot)
  }

  return accumulator
}

export function syncLiveTimelineAccumulator(
  accumulator: LiveTimelineAccumulator,
  snapshot: LiveSessionSnapshot,
): LiveTimelineSyncResult {
  const previousSnapshot = accumulator.snapshot

  if (!previousSnapshot) {
    rebuildLiveTimelineAccumulator(accumulator, snapshot)
    return {
      didChange: true,
      items: accumulator.timelineItems,
    }
  }

  if (!canApplyIncrementally(previousSnapshot, snapshot)) {
    rebuildLiveTimelineAccumulator(accumulator, snapshot)
    return {
      didChange: true,
      items: accumulator.timelineItems,
    }
  }

  const nextEventStartIndex = previousSnapshot.events.length
  const nextMessageStartIndex = previousSnapshot.messages.length
  const appendedEvents = snapshot.events.slice(nextEventStartIndex)
  const appendedMessages = snapshot.messages.slice(nextMessageStartIndex)

  if (appendedEvents.length === 0 && appendedMessages.length === 0) {
    accumulator.snapshot = snapshot
    return {
      didChange: false,
      items: accumulator.timelineItems,
    }
  }

  indexEventBackedMessageIds(accumulator.eventBackedMessageIds, appendedEvents)

  for (const message of appendedMessages) {
    if (accumulator.eventBackedMessageIds.has(message.id)) {
      continue
    }

    const key = createMessageSegmentKey(accumulator, message.id)
    setItem(accumulator, key, completedMessageFromSnapshot(message, key))
  }

  for (const event of appendedEvents) {
    applyEvent(accumulator, event)
  }

  accumulator.snapshot = snapshot
  return {
    didChange: true,
    items: accumulator.timelineItems,
  }
}

function createEmptyAccumulator(): LiveTimelineAccumulator {
  return {
    snapshot: null,
    timelineItems: [],
    keyIndexByKey: new Map(),
    itemsByKey: new Map(),
    activeThinkingKeys: new Set(),
    latestMessageSegmentById: new Map(),
    messageSegmentKeysById: new Map(),
    nextMessageSegmentIndexById: new Map(),
    sealedMessageIds: new Set(),
    eventBackedMessageIds: new Set(),
  }
}

function rebuildLiveTimelineAccumulator(
  accumulator: LiveTimelineAccumulator,
  snapshot: LiveSessionSnapshot,
): void {
  accumulator.snapshot = snapshot
  accumulator.timelineItems = []
  accumulator.keyIndexByKey.clear()
  accumulator.itemsByKey.clear()
  accumulator.activeThinkingKeys.clear()
  accumulator.latestMessageSegmentById.clear()
  accumulator.messageSegmentKeysById.clear()
  accumulator.nextMessageSegmentIndexById.clear()
  accumulator.sealedMessageIds.clear()
  accumulator.eventBackedMessageIds.clear()

  indexEventBackedMessageIds(accumulator.eventBackedMessageIds, snapshot.events)

  for (const message of snapshot.messages) {
    if (accumulator.eventBackedMessageIds.has(message.id)) {
      continue
    }

    const key = createMessageSegmentKey(accumulator, message.id)
    setItem(accumulator, key, completedMessageFromSnapshot(message, key))
  }

  for (const event of snapshot.events) {
    applyEvent(accumulator, event)
  }
}

function canApplyIncrementally(
  previousSnapshot: LiveSessionSnapshot,
  nextSnapshot: LiveSessionSnapshot,
): boolean {
  if (previousSnapshot.sessionId !== nextSnapshot.sessionId) {
    return false
  }

  if ((previousSnapshot.transcriptRevision ?? 0) !== (nextSnapshot.transcriptRevision ?? 0)) {
    return false
  }

  if (
    nextSnapshot.events.length < previousSnapshot.events.length ||
    nextSnapshot.messages.length < previousSnapshot.messages.length
  ) {
    return false
  }

  if (!samePrefixTail(previousSnapshot.events, nextSnapshot.events, sameEvent)) {
    return false
  }

  if (!samePrefixTail(previousSnapshot.messages, nextSnapshot.messages, sameMessage)) {
    return false
  }

  return true
}

function samePrefixTail<TItem>(
  previousItems: TItem[],
  nextItems: TItem[],
  compare: (left: TItem, right: TItem) => boolean,
): boolean {
  if (previousItems.length === 0) {
    return true
  }

  const nextItemAtBoundary = nextItems[previousItems.length - 1]

  if (!nextItemAtBoundary) {
    return false
  }

  return compare(previousItems[previousItems.length - 1], nextItemAtBoundary)
}

function sameEvent(left: LiveSessionEventRecord, right: LiveSessionEventRecord): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameMessage(left: LiveSessionMessage, right: LiveSessionMessage): boolean {
  return (
    left.id === right.id &&
    left.role === right.role &&
    left.content === right.content &&
    JSON.stringify(left.contentBlocks ?? []) === JSON.stringify(right.contentBlocks ?? [])
  )
}

function indexEventBackedMessageIds(target: Set<string>, events: LiveSessionEventRecord[]): void {
  for (const event of events) {
    if (event.type !== 'message.delta' && event.type !== 'message.completed') {
      continue
    }

    const messageId = toOptionalString(event.messageId)

    if (messageId) {
      target.add(messageId)
    }
  }
}

function setItem(accumulator: LiveTimelineAccumulator, key: string, item: TimelineItem): void {
  const existingIndex = accumulator.keyIndexByKey.get(key)

  if (typeof existingIndex === 'number') {
    accumulator.timelineItems[existingIndex] = item
    accumulator.itemsByKey.set(key, item)
    return
  }

  accumulator.keyIndexByKey.set(key, accumulator.timelineItems.length)
  accumulator.timelineItems.push(item)
  accumulator.itemsByKey.set(key, item)
}

function applyEvent(accumulator: LiveTimelineAccumulator, event: LiveSessionEventRecord): void {
  switch (event.type) {
    case 'message.delta': {
      const messageId = toOptionalString(event.messageId)
      const delta = toOptionalString(event.delta)

      if (!messageId || !delta) {
        setItem(
          accumulator,
          fallbackEventKey(event, accumulator.timelineItems.length),
          fallbackEventItem(event, 'Live message delta', 'Malformed message delta event.'),
        )
        break
      }

      if (event.channel === 'thinking') {
        const key = thinkingKey(messageId)
        const existing = accumulator.itemsByKey.get(key)
        const content =
          existing?.kind === 'thinking' ? `${existing.content}${delta}` : String(delta)

        setItem(accumulator, key, {
          kind: 'thinking',
          id: key,
          messageId,
          content,
          status: 'streaming',
        } satisfies ThinkingTimelineItem)
        accumulator.activeThinkingKeys.add(key)
        break
      }

      completeThinking(accumulator)

      const key = getMessageSegmentKey(accumulator, messageId)
      const existing = accumulator.itemsByKey.get(key)

      if (existing?.kind === 'message' && existing.status === 'completed') {
        break
      }

      setItem(accumulator, key, {
        kind: 'message',
        id: key,
        messageId,
        rewindBoundaryMessageId:
          existing?.kind === 'message' ? existing.rewindBoundaryMessageId : undefined,
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
          accumulator,
          fallbackEventKey(event, accumulator.timelineItems.length),
          fallbackEventItem(event, 'Live message completed', 'Malformed message event.'),
        )
        break
      }

      completeThinking(accumulator)
      completeMessageSegments(accumulator, messageId)
      const adjustedContent =
        contentBlocks.length > 0
          ? content
          : adjustCompletedMessageContent(accumulator, messageId, content)
      const key = getCompletedMessageSegmentKey(accumulator, messageId, adjustedContent, event.role)
      setItem(accumulator, key, {
        kind: 'message',
        id: key,
        messageId,
        rewindBoundaryMessageId: toOptionalString(event.rewindBoundaryMessageId),
        role: normalizeRole(event.role),
        content: adjustedContent ?? '',
        status: 'completed',
        occurredAt: toOptionalString(event.occurredAt),
        contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
      })
      break
    }

    case 'tool.progress': {
      sealMessageSegments(accumulator)
      const toolUseId =
        toOptionalString(event.toolUseId) ?? `tool-${accumulator.timelineItems.length}`
      const key = toolKey(toolUseId)
      const existing = accumulator.itemsByKey.get(key)
      const detail = toOptionalString(event.detail)
      const prevTool = existing?.kind === 'tool' ? existing : null
      const nextInputMarkdown =
        prevTool?.inputMarkdown ?? (isToolInputMarkdown(detail) ? detail : null)
      const historyDetail = detail && detail !== nextInputMarkdown ? detail : null
      const nextHistory = historyDetail
        ? dedupeHistory([...(prevTool?.progressHistory ?? []), historyDetail])
        : (prevTool?.progressHistory ?? [])

      setItem(accumulator, key, {
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
      sealMessageSegments(accumulator)
      const toolUseId =
        toOptionalString(event.toolUseId) ?? `tool-${accumulator.timelineItems.length}`
      const key = toolKey(toolUseId)
      const existing = accumulator.itemsByKey.get(key)
      const prevTool = existing?.kind === 'tool' ? existing : null
      const resultMarkdown = formatUnknownValue(event.content)
      const isError = Boolean(event.isError)

      setItem(accumulator, key, {
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
      sealMessageSegments(accumulator)
      setItem(
        accumulator,
        permissionKey(toOptionalString(event.requestId) ?? accumulator.timelineItems.length),
        buildPermissionItem(
          event,
          accumulator.itemsByKey.get(
            permissionKey(toOptionalString(event.requestId) ?? accumulator.timelineItems.length),
          ),
        ),
      )
      break

    case 'permission.resolved':
      sealMessageSegments(accumulator)
      setItem(
        accumulator,
        permissionKey(toOptionalString(event.requestId) ?? accumulator.timelineItems.length),
        resolvePermissionItem(
          toOptionalString(event.requestId) ?? String(accumulator.timelineItems.length),
          accumulator.itemsByKey.get(
            permissionKey(toOptionalString(event.requestId) ?? accumulator.timelineItems.length),
          ),
          event,
        ),
      )
      break

    case 'askUser.requested':
      sealMessageSegments(accumulator)
      setItem(
        accumulator,
        askUserKey(toOptionalString(event.requestId) ?? accumulator.timelineItems.length),
        buildAskUserItem(
          event,
          accumulator.itemsByKey.get(
            askUserKey(toOptionalString(event.requestId) ?? accumulator.timelineItems.length),
          ),
        ),
      )
      break

    case 'askUser.resolved':
      sealMessageSegments(accumulator)
      setItem(
        accumulator,
        askUserKey(toOptionalString(event.requestId) ?? accumulator.timelineItems.length),
        resolveAskUserItem(
          toOptionalString(event.requestId) ?? String(accumulator.timelineItems.length),
          accumulator.itemsByKey.get(
            askUserKey(toOptionalString(event.requestId) ?? accumulator.timelineItems.length),
          ),
          event,
        ),
      )
      break

    case 'session.statusChanged':
    case 'session.titleChanged':
    case 'session.settingsChanged':
    case 'session.tokenUsageChanged':
      sealMessageSegments(accumulator)
      break

    case 'stream.warning':
      sealMessageSegments(accumulator)
      setItem(
        accumulator,
        eventKey(event.type, accumulator.timelineItems.length),
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
      sealMessageSegments(accumulator)
      setItem(
        accumulator,
        eventKey(event.type, accumulator.timelineItems.length),
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
      sealMessageSegments(accumulator)
      setItem(
        accumulator,
        eventKey(event.type, accumulator.timelineItems.length),
        systemEventItem({
          event,
          title: 'Stream completed',
          body: `Reason: ${toOptionalString(event.reason) ?? 'completed'}`,
          tone: 'success',
        }),
      )
      break

    default:
      sealMessageSegments(accumulator)
      setItem(
        accumulator,
        fallbackEventKey(event, accumulator.timelineItems.length),
        fallbackEventItem(
          event,
          'Live event received',
          'The live session emitted an event that does not yet have a tailored renderer.',
        ),
      )
  }
}

function completeThinking(accumulator: LiveTimelineAccumulator): void {
  for (const thinkingKey of Array.from(accumulator.activeThinkingKeys)) {
    const existing = accumulator.itemsByKey.get(thinkingKey)

    if (existing?.kind !== 'thinking') {
      continue
    }

    setItem(accumulator, thinkingKey, {
      ...existing,
      status: 'completed',
    })
    accumulator.activeThinkingKeys.delete(thinkingKey)
  }
}

function createMessageSegmentKey(accumulator: LiveTimelineAccumulator, messageId: string): string {
  const nextIndex = accumulator.nextMessageSegmentIndexById.get(messageId) ?? 0
  const key = messageKey(messageId, nextIndex)

  accumulator.nextMessageSegmentIndexById.set(messageId, nextIndex + 1)
  accumulator.latestMessageSegmentById.set(messageId, key)
  accumulator.messageSegmentKeysById.set(messageId, [
    ...(accumulator.messageSegmentKeysById.get(messageId) ?? []),
    key,
  ])
  accumulator.sealedMessageIds.delete(messageId)

  return key
}

function getMessageSegmentItems(accumulator: LiveTimelineAccumulator, messageId: string) {
  return (accumulator.messageSegmentKeysById.get(messageId) ?? [])
    .map((key) => accumulator.itemsByKey.get(key))
    .filter((item): item is Extract<TimelineItem, { kind: 'message' }> => item?.kind === 'message')
}

function adjustCompletedMessageContent(
  accumulator: LiveTimelineAccumulator,
  messageId: string,
  content: string | null,
): string | null {
  if (content === null) {
    return content
  }

  const segmentItems = getMessageSegmentItems(accumulator, messageId)

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

  return remainingContent.length > 0 ? remainingContent : (segmentItems.at(-1)?.content ?? content)
}

function getMessageSegmentKey(accumulator: LiveTimelineAccumulator, messageId: string): string {
  const latestKey = accumulator.latestMessageSegmentById.get(messageId)
  const latestItem = latestKey ? accumulator.itemsByKey.get(latestKey) : null

  if (
    latestKey &&
    !accumulator.sealedMessageIds.has(messageId) &&
    !(latestItem?.kind === 'message' && latestItem.status === 'completed')
  ) {
    return latestKey
  }

  return createMessageSegmentKey(accumulator, messageId)
}

function getCompletedMessageSegmentKey(
  accumulator: LiveTimelineAccumulator,
  messageId: string,
  content: string | null,
  role: unknown,
): string {
  const latestKey = accumulator.latestMessageSegmentById.get(messageId)
  const latestItem = latestKey ? accumulator.itemsByKey.get(latestKey) : null

  if (
    latestKey &&
    latestItem?.kind === 'message' &&
    latestItem.role === normalizeRole(role) &&
    content !== null &&
    latestItem.content === content
  ) {
    accumulator.sealedMessageIds.delete(messageId)
    return latestKey
  }

  return getMessageSegmentKey(accumulator, messageId)
}

function sealMessageSegments(accumulator: LiveTimelineAccumulator): void {
  completeThinking(accumulator)

  for (const messageId of accumulator.latestMessageSegmentById.keys()) {
    accumulator.sealedMessageIds.add(messageId)
  }
}

function completeMessageSegments(accumulator: LiveTimelineAccumulator, messageId: string): void {
  for (const item of getMessageSegmentItems(accumulator, messageId)) {
    if (item.status === 'completed') {
      continue
    }

    setItem(accumulator, item.id, {
      ...item,
      status: 'completed',
    })
  }
}

function completedMessageFromSnapshot(message: LiveSessionMessage, key: string): TimelineItem {
  return {
    kind: 'message',
    id: key,
    messageId: message.id,
    rewindBoundaryMessageId: message.rewindBoundaryMessageId,
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
    details: details.filter((detail): detail is string => Boolean(detail)),
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

function formatUnknownValue(value: unknown): string {
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
  const resolvedValue = toOptionalString(value)
  return resolvedValue ? `${label}: ${resolvedValue}` : null
}

function normalizeRiskLevel(value: unknown): RiskLevel {
  const resolvedValue = toOptionalString(value)?.toLowerCase()

  if (resolvedValue === 'low' || resolvedValue === 'medium' || resolvedValue === 'high') {
    return resolvedValue
  }

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
  const seen = new Set<string>()
  const dedupedEntries: string[] = []

  for (const entry of entries) {
    if (seen.has(entry)) {
      continue
    }

    seen.add(entry)
    dedupedEntries.push(entry)
  }

  return dedupedEntries
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
