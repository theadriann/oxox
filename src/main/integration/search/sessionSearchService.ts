import MiniSearch from 'minisearch'

import type {
  FoundationBootstrap,
  LiveSessionEventRecord,
  LiveSessionMessage,
  LiveSessionSnapshot,
  SessionRecord,
  SessionSearchMatch,
  SessionSearchRequest,
  SessionSearchResponse,
  SessionTranscript,
  TranscriptEntry,
} from '../../../shared/ipc/contracts'
import {
  normalizeSearchText,
  type ParsedSessionSearchQuery,
  parseSessionSearchQuery,
  type SessionSearchModifier,
  tokenizeSearchText,
} from '../../../shared/search/sessionSearchQuery'

interface SearchDocument {
  id: string
  title: string
  project: string
  path: string
  status: string
  sessionId: string
  content: string
  tool: string
  lastActivityAt: number
  transcriptSourcePath: string | null
}

export interface CreateSessionSearchServiceOptions {
  bootstrap: FoundationBootstrap
  loadSessionTranscript: (sessionId: string) => Promise<SessionTranscript>
  liveUpdateDebounceMs?: number
}

export interface SessionSearchService {
  searchSessions: (request: SessionSearchRequest) => SessionSearchResponse
  replaceFoundation: (bootstrap: FoundationBootstrap) => void
  scheduleLiveSnapshotUpdate: (snapshot: LiveSessionSnapshot) => void
  waitForHydration: () => Promise<void>
  dispose: () => void
}

const SEARCH_FIELDS = ['title', 'content', 'project', 'path', 'status', 'sessionId', 'tool']
const STORE_FIELDS = [
  'id',
  'title',
  'project',
  'path',
  'status',
  'sessionId',
  'content',
  'tool',
  'lastActivityAt',
  'transcriptSourcePath',
]
const DEFAULT_LIMIT = 100
const DEFAULT_LIVE_UPDATE_DEBOUNCE_MS = 100

export function createSessionSearchService({
  bootstrap,
  loadSessionTranscript,
  liveUpdateDebounceMs = DEFAULT_LIVE_UPDATE_DEBOUNCE_MS,
}: CreateSessionSearchServiceOptions): SessionSearchService {
  let documents = new Map<string, SearchDocument>()
  let miniSearch = createMiniSearch()
  let hydrationGeneration = 0
  let hydrationPromise: Promise<void> = Promise.resolve()
  const pendingLiveSnapshots = new Map<string, LiveSessionSnapshot>()
  const liveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const rebuildIndex = () => {
    miniSearch = createMiniSearch()
    miniSearch.addAll([...documents.values()])
  }

  const scheduleHydration = () => {
    const generation = hydrationGeneration
    const sessionsToHydrate = [...documents.values()]
      .filter((document) => document.transcriptSourcePath)
      .sort((left, right) => right.lastActivityAt - left.lastActivityAt)

    hydrationPromise = (async () => {
      for (const document of sessionsToHydrate) {
        if (generation !== hydrationGeneration) {
          return
        }

        try {
          const transcript = await loadSessionTranscript(document.id)

          if (generation !== hydrationGeneration) {
            return
          }

          const nextDocument = {
            ...document,
            ...extractTranscriptSearchFields(transcript.entries),
          }
          documents.set(nextDocument.id, nextDocument)
          rebuildIndex()
        } catch {
          // Search should remain available even if a transcript artifact is missing
          // or malformed. Metadata matches are still useful and are indexed synchronously.
        }
      }
    })()
  }

  const replaceFoundation = (nextBootstrap: FoundationBootstrap) => {
    hydrationGeneration += 1
    const metadataBySessionId = new Map(
      nextBootstrap.syncMetadata.map((metadata) => [metadata.sessionId, metadata.sourcePath]),
    )
    documents = new Map(
      nextBootstrap.sessions.map((session) => {
        const existing = documents.get(session.id)
        return [
          session.id,
          createDocumentFromSession(
            session,
            metadataBySessionId.get(session.id) ?? null,
            existing ? pickHydratedFields(existing) : undefined,
          ),
        ]
      }),
    )
    rebuildIndex()
    scheduleHydration()
  }

  const searchSessions = (request: SessionSearchRequest): SessionSearchResponse => {
    const parsed = parseSessionSearchQuery(request.query)
    const limit = request.limit ?? DEFAULT_LIMIT

    if (!parsed.freeText && Object.keys(parsed.modifiers).length === 0) {
      return { query: request.query, matches: [] }
    }

    const scoreById = getMiniSearchScores(parsed)
    const matches = [...documents.values()]
      .filter((document) => documentMatchesQuery(document, parsed))
      .map((document) => ({
        sessionId: document.id,
        score: rankDocument(document, parsed) + (scoreById.get(document.id) ?? 0),
        reasons: buildReasons(document, parsed),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          (documents.get(right.sessionId)?.lastActivityAt ?? 0) -
            (documents.get(left.sessionId)?.lastActivityAt ?? 0) ||
          left.sessionId.localeCompare(right.sessionId),
      )
      .slice(0, limit)

    return { query: request.query, matches }
  }

  const getMiniSearchScores = (parsed: ParsedSessionSearchQuery): Map<string, number> => {
    const terms = [
      ...parsed.terms,
      ...Object.values(parsed.modifiers)
        .flat()
        .flatMap((value) => tokenizeSearchText(value)),
    ]
    const query = terms.join(' ')

    if (!query) {
      return new Map()
    }

    return new Map(
      miniSearch.search(query).map((result) => [String(result.id), Number(result.score) || 0]),
    )
  }

  const scheduleLiveSnapshotUpdate = (snapshot: LiveSessionSnapshot) => {
    pendingLiveSnapshots.set(snapshot.sessionId, snapshot)

    const existingTimer = liveTimers.get(snapshot.sessionId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    liveTimers.set(
      snapshot.sessionId,
      setTimeout(() => {
        liveTimers.delete(snapshot.sessionId)
        const latestSnapshot = pendingLiveSnapshots.get(snapshot.sessionId)
        pendingLiveSnapshots.delete(snapshot.sessionId)

        if (!latestSnapshot) {
          return
        }

        const existing = documents.get(latestSnapshot.sessionId)
        const liveDocument = createDocumentFromLiveSnapshot(latestSnapshot, existing)
        documents.set(liveDocument.id, liveDocument)
        rebuildIndex()
      }, liveUpdateDebounceMs),
    )
  }

  replaceFoundation(bootstrap)

  return {
    searchSessions,
    replaceFoundation,
    scheduleLiveSnapshotUpdate,
    waitForHydration: () => hydrationPromise,
    dispose: () => {
      hydrationGeneration += 1
      for (const timer of liveTimers.values()) {
        clearTimeout(timer)
      }
      liveTimers.clear()
      pendingLiveSnapshots.clear()
    },
  }
}

function createMiniSearch(): MiniSearch<SearchDocument> {
  return new MiniSearch<SearchDocument>({
    fields: SEARCH_FIELDS,
    idField: 'id',
    storeFields: STORE_FIELDS,
    searchOptions: {
      boost: {
        title: 8,
        content: 5,
        project: 3,
        path: 2.5,
        tool: 1.5,
        sessionId: 1,
        status: 1,
      },
      prefix: true,
      combineWith: 'AND',
    },
  })
}

function createDocumentFromSession(
  session: SessionRecord,
  transcriptSourcePath: string | null,
  hydratedFields: Pick<SearchDocument, 'content' | 'tool'> = { content: '', tool: '' },
): SearchDocument {
  return {
    id: session.id,
    title: normalizeSearchText(session.title),
    project: normalizeSearchText(session.projectDisplayName ?? deriveProjectName(session)),
    path: normalizeSearchText(session.projectWorkspacePath ?? ''),
    status: normalizeSearchText(session.status),
    sessionId: normalizeSearchText(session.id),
    content: hydratedFields.content,
    tool: hydratedFields.tool,
    lastActivityAt: toTimestamp(session.lastActivityAt ?? session.updatedAt ?? session.createdAt),
    transcriptSourcePath,
  }
}

function createDocumentFromLiveSnapshot(
  snapshot: LiveSessionSnapshot,
  existing?: SearchDocument,
): SearchDocument {
  const extracted = extractLiveSnapshotSearchFields(snapshot)

  return {
    id: snapshot.sessionId,
    title: normalizeSearchText(snapshot.title),
    project: existing?.project ?? '',
    path: normalizeSearchText(snapshot.projectWorkspacePath ?? existing?.path ?? ''),
    status: normalizeSearchText(snapshot.status),
    sessionId: normalizeSearchText(snapshot.sessionId),
    content: extracted.content || existing?.content || '',
    tool: extracted.tool || existing?.tool || '',
    lastActivityAt: Date.now(),
    transcriptSourcePath: existing?.transcriptSourcePath ?? null,
  }
}

function deriveProjectName(session: SessionRecord): string {
  if (session.projectWorkspacePath) {
    return (
      session.projectWorkspacePath.split('/').filter(Boolean).at(-1) ?? session.projectWorkspacePath
    )
  }

  return session.projectId ?? ''
}

function pickHydratedFields(document: SearchDocument): Pick<SearchDocument, 'content' | 'tool'> {
  return {
    content: document.content,
    tool: document.tool,
  }
}

function extractTranscriptSearchFields(
  entries: TranscriptEntry[],
): Pick<SearchDocument, 'content' | 'tool'> {
  const content: string[] = []
  const tool: string[] = []

  for (const entry of entries) {
    if (entry.kind === 'message') {
      content.push(entry.markdown)
      continue
    }

    tool.push(entry.toolName, entry.inputMarkdown, entry.resultMarkdown ?? '')
  }

  return {
    content: normalizeSearchText(content.join('\n')),
    tool: normalizeSearchText(tool.join('\n')),
  }
}

function extractLiveSnapshotSearchFields(
  snapshot: LiveSessionSnapshot,
): Pick<SearchDocument, 'content' | 'tool'> {
  const content = snapshot.messages.map((message) => serializeLiveMessage(message)).join('\n')
  const tool = snapshot.events.map((event) => serializeLiveEventToolContent(event)).join('\n')

  return {
    content: normalizeSearchText(content),
    tool: normalizeSearchText(tool),
  }
}

function serializeLiveMessage(message: LiveSessionMessage): string {
  return [
    message.content,
    ...(message.contentBlocks ?? []).flatMap((block) =>
      block.type === 'text' ? [block.text] : [],
    ),
  ].join('\n')
}

function serializeLiveEventToolContent(event: LiveSessionEventRecord): string {
  switch (event.type) {
    case 'tool.progress':
      return [event.toolName, event.status, event.detail ?? ''].join('\n')
    case 'tool.result':
      return [event.toolName, serializeUnknown(event.content)].join('\n')
    default:
      return ''
  }
}

function documentMatchesQuery(document: SearchDocument, parsed: ParsedSessionSearchQuery): boolean {
  return (
    parsed.terms.every((term) => termMatchesAnySearchableField(document, term)) &&
    modifierMatches(document, parsed.modifiers)
  )
}

function modifierMatches(
  document: SearchDocument,
  modifiers: ParsedSessionSearchQuery['modifiers'],
): boolean {
  return Object.entries(modifiers).every(([field, values]) =>
    (values ?? []).every((value) =>
      getFieldValue(document, field as SessionSearchModifier).includes(value),
    ),
  )
}

function termMatchesAnySearchableField(document: SearchDocument, term: string): boolean {
  return (
    document.title.includes(term) ||
    document.content.includes(term) ||
    document.project.includes(term) ||
    document.path.includes(term) ||
    document.tool.includes(term) ||
    document.status.includes(term) ||
    document.sessionId.includes(term)
  )
}

function rankDocument(document: SearchDocument, parsed: ParsedSessionSearchQuery): number {
  const freeTextScore = parsed.terms.reduce(
    (total, term) => total + rankTermAcrossFields(document, term),
    0,
  )
  const modifierScore = Object.entries(parsed.modifiers).reduce((total, [field, values]) => {
    const fieldValue = getFieldValue(document, field as SessionSearchModifier)
    return (
      total +
      (values ?? []).reduce(
        (fieldTotal, value) =>
          fieldTotal +
          rankFieldMatch(fieldValue, value, fieldWeight(field as SessionSearchModifier)),
        0,
      )
    )
  }, 0)

  return freeTextScore + modifierScore
}

function rankTermAcrossFields(document: SearchDocument, term: string): number {
  return Math.max(
    rankFieldMatch(document.title, term, 10_000),
    rankFieldMatch(document.content, term, 6_000),
    rankFieldMatch(document.project, term, 3_500),
    rankFieldMatch(document.path, term, 3_000),
    rankFieldMatch(document.tool, term, 2_000),
    rankFieldMatch(document.status, term, 800),
    rankFieldMatch(document.sessionId, term, 700),
  )
}

function rankFieldMatch(value: string, term: string, weight: number): number {
  const index = value.indexOf(term)

  if (index < 0) {
    return 0
  }

  const exactTokenBonus = tokenizeSearchText(value).includes(term) ? 500 : 0

  return Math.max(1, weight + exactTokenBonus - index)
}

function fieldWeight(field: SessionSearchModifier): number {
  switch (field) {
    case 'title':
      return 10_000
    case 'content':
      return 6_000
    case 'project':
      return 3_500
    case 'path':
      return 3_000
    case 'tool':
      return 2_000
    case 'status':
      return 800
    case 'id':
      return 700
  }
}

function getFieldValue(document: SearchDocument, field: SessionSearchModifier): string {
  switch (field) {
    case 'title':
      return document.title
    case 'content':
      return document.content
    case 'project':
      return document.project
    case 'path':
      return document.path
    case 'status':
      return document.status
    case 'id':
      return document.sessionId
    case 'tool':
      return document.tool
  }
}

function buildReasons(
  document: SearchDocument,
  parsed: ParsedSessionSearchQuery,
): SessionSearchMatch['reasons'] {
  const reasons: SessionSearchMatch['reasons'] = []
  const fields: SessionSearchModifier[] = [
    'title',
    'content',
    'project',
    'path',
    'tool',
    'status',
    'id',
  ]
  const terms = [...parsed.terms, ...Object.values(parsed.modifiers).flat()]

  for (const term of terms) {
    const matchingField = fields.find((field) => getFieldValue(document, field).includes(term))

    if (!matchingField) {
      continue
    }

    reasons.push({
      field: matchingField,
      snippet: createSnippet(getFieldValue(document, matchingField), term),
    })

    if (reasons.length >= 3) {
      break
    }
  }

  return reasons
}

function createSnippet(value: string, term: string): string {
  const index = value.indexOf(term)

  if (index < 0) {
    return value.slice(0, 120)
  }

  const start = Math.max(0, index - 40)
  const end = Math.min(value.length, index + term.length + 80)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < value.length ? '…' : ''

  return `${prefix}${value.slice(start, end)}${suffix}`
}

function toTimestamp(value: string | null): number {
  if (!value) {
    return 0
  }

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function serializeUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value === null || typeof value === 'undefined') {
    return ''
  }

  return JSON.stringify(value)
}
