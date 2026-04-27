import { createRequire } from 'node:module'

import type {
  FoundationBootstrap,
  LiveSessionEventRecord,
  LiveSessionMessage,
  LiveSessionSnapshot,
  SessionRecord,
  SessionSearchIndexingProgress,
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

export interface SearchDocument {
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

export interface SessionSearchStore {
  listHydratedDocumentIds: () => string[]
  replaceMetadataDocuments: (documents: SearchDocument[]) => void
  upsertDocument: (document: SearchDocument) => void
  searchDocuments: (parsed: ParsedSessionSearchQuery) => SearchDocument[]
  dispose?: () => void
}

export interface CreateSessionSearchServiceOptions {
  bootstrap: FoundationBootstrap
  loadSessionTranscript: (
    sessionId: string,
    transcriptSourcePath: string,
  ) => Promise<SessionTranscript>
  backgroundHydrationDelayMs?: number
  backgroundHydrationLimit?: number
  createSearchStore?: () => SessionSearchStore
  hydrationYieldMs?: number
  liveUpdateDebounceMs?: number
  maxIndexedContentChars?: number
  maxIndexedToolChars?: number
  searchDatabasePath?: string
}

export interface SessionSearchService {
  searchSessions: (request: SessionSearchRequest) => SessionSearchResponse
  getIndexingProgress: () => SessionSearchIndexingProgress
  replaceFoundation: (bootstrap: FoundationBootstrap) => void
  scheduleLiveSnapshotUpdate: (snapshot: LiveSessionSnapshot) => void
  waitForHydration: () => Promise<void>
  dispose: () => void
}

const DEFAULT_LIMIT = 100
const DEFAULT_BACKGROUND_HYDRATION_DELAY_MS = 2_000
const DEFAULT_HYDRATION_YIELD_MS = 25
const DEFAULT_LIVE_UPDATE_DEBOUNCE_MS = 100
const DEFAULT_MAX_INDEXED_CONTENT_CHARS = 80_000
const DEFAULT_MAX_INDEXED_TOOL_CHARS = 40_000
const require = createRequire(import.meta.url)

export function createSessionSearchService({
  backgroundHydrationDelayMs = DEFAULT_BACKGROUND_HYDRATION_DELAY_MS,
  backgroundHydrationLimit,
  bootstrap,
  createSearchStore,
  hydrationYieldMs = DEFAULT_HYDRATION_YIELD_MS,
  loadSessionTranscript,
  liveUpdateDebounceMs = DEFAULT_LIVE_UPDATE_DEBOUNCE_MS,
  maxIndexedContentChars = DEFAULT_MAX_INDEXED_CONTENT_CHARS,
  maxIndexedToolChars = DEFAULT_MAX_INDEXED_TOOL_CHARS,
  searchDatabasePath = ':memory:',
}: CreateSessionSearchServiceOptions): SessionSearchService {
  let documents = new Map<string, SearchDocument>()
  const searchStore = createSearchStore?.() ?? createSqliteSessionSearchStore(searchDatabasePath)
  let hydratedDocumentIds = new Set(searchStore.listHydratedDocumentIds())
  let disposed = false
  let hydrationInFlight = false
  let hydrationPromise: Promise<void> = Promise.resolve()
  let hydrationRerunRequested = false
  let indexingProgress = createIndexingProgress(0, 0, false)
  const pendingLiveSnapshots = new Map<string, LiveSessionSnapshot>()
  const liveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const upsertIndexedDocument = (document: SearchDocument) => {
    documents.set(document.id, stripHydratedFields(document))
    hydratedDocumentIds.add(document.id)
    searchStore.upsertDocument(document)
  }

  const getHydrationPlan = () => {
    const hydratableSessions = [...documents.values()]
      .filter((document) => document.transcriptSourcePath)
      .sort((left, right) => right.lastActivityAt - left.lastActivityAt)
      .slice(
        0,
        typeof backgroundHydrationLimit === 'number'
          ? Math.max(0, backgroundHydrationLimit)
          : undefined,
      )
    const totalSessions = hydratableSessions.length
    const indexedSessions = hydratableSessions.filter((document) =>
      hydratedDocumentIds.has(document.id),
    ).length
    const sessionsToHydrate = hydratableSessions.filter(
      (document) => !hydratedDocumentIds.has(document.id),
    )

    return {
      indexedSessions,
      sessionsToHydrate,
      totalSessions,
    }
  }

  const updateIndexingProgressFromPlan = () => {
    const { indexedSessions, sessionsToHydrate, totalSessions } = getHydrationPlan()
    indexingProgress = createIndexingProgress(
      indexedSessions,
      totalSessions,
      sessionsToHydrate.length > 0,
    )

    return sessionsToHydrate
  }

  const runHydrationWorker = async () => {
    hydrationInFlight = true

    try {
      do {
        hydrationRerunRequested = false
        const sessionsToHydrate = updateIndexingProgressFromPlan()

        if (sessionsToHydrate.length === 0) {
          continue
        }

        await delay(backgroundHydrationDelayMs)

        for (const document of sessionsToHydrate) {
          if (disposed) {
            return
          }

          const currentDocument = documents.get(document.id)

          if (!currentDocument?.transcriptSourcePath || hydratedDocumentIds.has(document.id)) {
            continue
          }

          try {
            const transcript = await loadSessionTranscript(
              currentDocument.id,
              currentDocument.transcriptSourcePath,
            )

            if (disposed || !documents.has(currentDocument.id)) {
              return
            }

            const nextDocument = {
              ...currentDocument,
              ...extractTranscriptSearchFields(
                transcript.entries,
                maxIndexedContentChars,
                maxIndexedToolChars,
              ),
            }
            upsertIndexedDocument(nextDocument)
          } catch {
            // Search should remain available even if a transcript artifact is missing
            // or malformed. Metadata matches are still useful and are indexed synchronously.
          } finally {
            if (!disposed) {
              updateIndexingProgressFromPlan()
            }
          }

          await delay(hydrationYieldMs)
        }
      } while (hydrationRerunRequested && !disposed)
    } finally {
      hydrationInFlight = false

      if (!disposed) {
        updateIndexingProgressFromPlan()
      }
    }
  }

  const scheduleHydration = () => {
    if (hydrationInFlight) {
      hydrationRerunRequested = true
      updateIndexingProgressFromPlan()
      return
    }

    hydrationPromise = runHydrationWorker()
  }

  const replaceFoundation = (nextBootstrap: FoundationBootstrap) => {
    const metadataBySessionId = new Map(
      nextBootstrap.syncMetadata.map((metadata) => [metadata.sessionId, metadata.sourcePath]),
    )
    documents = new Map(
      nextBootstrap.sessions.map((session) => [
        session.id,
        createDocumentFromSession(session, metadataBySessionId.get(session.id) ?? null),
      ]),
    )
    searchStore.replaceMetadataDocuments([...documents.values()])
    hydratedDocumentIds = new Set(searchStore.listHydratedDocumentIds())
    const currentDocumentIds = new Set(documents.keys())
    hydratedDocumentIds = new Set(
      [...hydratedDocumentIds].filter((documentId) => currentDocumentIds.has(documentId)),
    )
    scheduleHydration()
  }

  const searchSessions = (request: SessionSearchRequest): SessionSearchResponse => {
    const parsed = parseSessionSearchQuery(request.query)
    const limit = request.limit ?? DEFAULT_LIMIT

    if (!parsed.freeText && Object.keys(parsed.modifiers).length === 0) {
      return { query: request.query, matches: [] }
    }

    const matches = searchStore
      .searchDocuments(parsed)
      .filter((document) => documentMatchesQuery(document, parsed))
      .map((document) => ({
        sessionId: document.id,
        score: rankDocument(document, parsed),
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
        const liveDocument = createDocumentFromLiveSnapshot(
          latestSnapshot,
          existing,
          maxIndexedContentChars,
          maxIndexedToolChars,
        )
        upsertIndexedDocument(liveDocument)
      }, liveUpdateDebounceMs),
    )
  }

  replaceFoundation(bootstrap)

  return {
    searchSessions,
    getIndexingProgress: () => indexingProgress,
    replaceFoundation,
    scheduleLiveSnapshotUpdate,
    waitForHydration: () => hydrationPromise,
    dispose: () => {
      disposed = true
      for (const timer of liveTimers.values()) {
        clearTimeout(timer)
      }
      liveTimers.clear()
      pendingLiveSnapshots.clear()
      searchStore.dispose?.()
    },
  }
}

type SqliteStatement<TResult = unknown> = {
  all: (...params: unknown[]) => TResult[]
  run: (...params: unknown[]) => unknown
}

type SqliteDatabase = {
  close: () => void
  exec: (sql: string) => void
  prepare: <TResult = unknown>(sql: string) => SqliteStatement<TResult>
  pragma: (statement: string) => unknown
  transaction: <T extends (...args: never[]) => unknown>(callback: T) => T
}

type SearchDocumentRow = {
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

export function createSqliteSessionSearchStore(databasePath: string): SessionSearchStore {
  const database = createSqliteDatabase(databasePath)

  database.pragma('journal_mode = WAL')
  database.pragma('busy_timeout = 5000')
  database.exec(`
    CREATE TABLE IF NOT EXISTS session_search_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project TEXT NOT NULL,
      path TEXT NOT NULL,
      status TEXT NOT NULL,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tool TEXT NOT NULL DEFAULT '',
      last_activity_at INTEGER NOT NULL DEFAULT 0,
      transcript_source_path TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_session_search_last_activity_at
      ON session_search_documents(last_activity_at);
  `)

  const upsertMetadataStatement = database.prepare(`
    INSERT INTO session_search_documents (
      id,
      title,
      project,
      path,
      status,
      session_id,
      content,
      tool,
      last_activity_at,
      transcript_source_path
    )
    VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      project = excluded.project,
      path = excluded.path,
      status = excluded.status,
      session_id = excluded.session_id,
      last_activity_at = excluded.last_activity_at,
      transcript_source_path = excluded.transcript_source_path
  `)
  const upsertDocumentStatement = database.prepare(`
    INSERT INTO session_search_documents (
      id,
      title,
      project,
      path,
      status,
      session_id,
      content,
      tool,
      last_activity_at,
      transcript_source_path
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      project = excluded.project,
      path = excluded.path,
      status = excluded.status,
      session_id = excluded.session_id,
      content = excluded.content,
      tool = excluded.tool,
      last_activity_at = excluded.last_activity_at,
      transcript_source_path = excluded.transcript_source_path
  `)
  const allIdsStatement = database.prepare<{ id: string }>(
    'SELECT id FROM session_search_documents',
  )
  const hydratedIdsStatement = database.prepare<{ id: string }>(`
    SELECT id
    FROM session_search_documents
    WHERE length(content) > 0 OR length(tool) > 0
  `)
  const deleteDocumentStatement = database.prepare(
    'DELETE FROM session_search_documents WHERE id = ?',
  )

  const upsertMetadata = (document: SearchDocument) => {
    upsertMetadataStatement.run(
      document.id,
      document.title,
      document.project,
      document.path,
      document.status,
      document.sessionId,
      document.lastActivityAt,
      document.transcriptSourcePath,
    )
  }
  const upsertDocument = (document: SearchDocument) => {
    upsertDocumentStatement.run(
      document.id,
      document.title,
      document.project,
      document.path,
      document.status,
      document.sessionId,
      document.content,
      document.tool,
      document.lastActivityAt,
      document.transcriptSourcePath,
    )
  }
  const replaceMetadataTransaction = database.transaction((nextDocuments: SearchDocument[]) => {
    const nextIds = new Set(nextDocuments.map((document) => document.id))

    for (const row of allIdsStatement.all()) {
      if (!nextIds.has(row.id)) {
        deleteDocumentStatement.run(row.id)
      }
    }

    for (const document of nextDocuments) {
      upsertMetadata(document)
    }
  })

  return {
    listHydratedDocumentIds: () => hydratedIdsStatement.all().map((row) => row.id),
    replaceMetadataDocuments: (nextDocuments) => {
      replaceMetadataTransaction(nextDocuments)
    },
    upsertDocument,
    searchDocuments: (parsed) => {
      const { parameters, whereClause } = buildSearchWhereClause(parsed)

      if (!whereClause) {
        return []
      }

      return database
        .prepare<SearchDocumentRow>(`
          SELECT
            id,
            title,
            project,
            path,
            status,
            session_id AS sessionId,
            content,
            tool,
            last_activity_at AS lastActivityAt,
            transcript_source_path AS transcriptSourcePath
          FROM session_search_documents
          WHERE ${whereClause}
          ORDER BY last_activity_at DESC, id ASC
        `)
        .all(...parameters)
        .map(rowToSearchDocument)
    },
    dispose: () => {
      database.close()
    },
  }
}

function createSqliteDatabase(databasePath: string): SqliteDatabase {
  try {
    const BetterSqlite3 = require('better-sqlite3')
    return new BetterSqlite3(databasePath) as SqliteDatabase
  } catch {
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (
        path: string,
      ) => {
        close: () => void
        exec: (sql: string) => void
        prepare: (sql: string) => {
          all: (...params: unknown[]) => unknown[]
          run: (...params: unknown[]) => unknown
        }
      }
    }
    const database = new DatabaseSync(databasePath)

    return {
      close: () => {
        database.close()
      },
      exec: (sql) => {
        database.exec(sql)
      },
      prepare: (sql) => database.prepare(sql) as SqliteStatement,
      pragma: (statement) => {
        database.exec(`PRAGMA ${statement}`)
        return undefined
      },
      transaction: <T extends (...args: never[]) => unknown>(callback: T): T =>
        ((...args: Parameters<T>) => {
          database.exec('BEGIN')

          try {
            const result = callback(...args)
            database.exec('COMMIT')
            return result
          } catch (transactionError) {
            database.exec('ROLLBACK')
            throw transactionError
          }
        }) as T,
    }
  }
}

function buildSearchWhereClause(parsed: ParsedSessionSearchQuery): {
  parameters: string[]
  whereClause: string
} {
  const clauses: string[] = []
  const parameters: string[] = []

  for (const term of parsed.terms) {
    clauses.push(
      [
        'instr(title, ?) > 0',
        'instr(content, ?) > 0',
        'instr(project, ?) > 0',
        'instr(path, ?) > 0',
        'instr(tool, ?) > 0',
        'instr(status, ?) > 0',
        'instr(session_id, ?) > 0',
      ].join(' OR '),
    )
    parameters.push(term, term, term, term, term, term, term)
  }

  for (const [field, values] of Object.entries(parsed.modifiers)) {
    for (const value of values ?? []) {
      clauses.push(`instr(${sqlColumnForSearchField(field as SessionSearchModifier)}, ?) > 0`)
      parameters.push(value)
    }
  }

  return {
    parameters,
    whereClause: clauses.map((clause) => `(${clause})`).join(' AND '),
  }
}

function sqlColumnForSearchField(field: SessionSearchModifier): string {
  switch (field) {
    case 'title':
      return 'title'
    case 'content':
      return 'content'
    case 'project':
      return 'project'
    case 'path':
      return 'path'
    case 'status':
      return 'status'
    case 'id':
      return 'session_id'
    case 'tool':
      return 'tool'
  }
}

function rowToSearchDocument(row: SearchDocumentRow): SearchDocument {
  return {
    id: row.id,
    title: row.title,
    project: row.project,
    path: row.path,
    status: row.status,
    sessionId: row.sessionId,
    content: row.content,
    tool: row.tool,
    lastActivityAt: row.lastActivityAt,
    transcriptSourcePath: row.transcriptSourcePath,
  }
}

function createDocumentFromSession(
  session: SessionRecord,
  transcriptSourcePath: string | null,
): SearchDocument {
  return {
    id: session.id,
    title: normalizeSearchText(session.title),
    project: normalizeSearchText(session.projectDisplayName ?? deriveProjectName(session)),
    path: normalizeSearchText(session.projectWorkspacePath ?? ''),
    status: normalizeSearchText(session.status),
    sessionId: normalizeSearchText(session.id),
    content: '',
    tool: '',
    lastActivityAt: toTimestamp(session.lastActivityAt ?? session.updatedAt ?? session.createdAt),
    transcriptSourcePath,
  }
}

function stripHydratedFields(document: SearchDocument): SearchDocument {
  return {
    ...document,
    content: '',
    tool: '',
  }
}

function createDocumentFromLiveSnapshot(
  snapshot: LiveSessionSnapshot,
  existing?: SearchDocument,
  maxIndexedContentChars = DEFAULT_MAX_INDEXED_CONTENT_CHARS,
  maxIndexedToolChars = DEFAULT_MAX_INDEXED_TOOL_CHARS,
): SearchDocument {
  const extracted = extractLiveSnapshotSearchFields(
    snapshot,
    maxIndexedContentChars,
    maxIndexedToolChars,
  )

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

function extractTranscriptSearchFields(
  entries: TranscriptEntry[],
  maxIndexedContentChars = DEFAULT_MAX_INDEXED_CONTENT_CHARS,
  maxIndexedToolChars = DEFAULT_MAX_INDEXED_TOOL_CHARS,
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
    content: capSearchField(normalizeSearchText(content.join('\n')), maxIndexedContentChars),
    tool: capSearchField(normalizeSearchText(tool.join('\n')), maxIndexedToolChars),
  }
}

function extractLiveSnapshotSearchFields(
  snapshot: LiveSessionSnapshot,
  maxIndexedContentChars = DEFAULT_MAX_INDEXED_CONTENT_CHARS,
  maxIndexedToolChars = DEFAULT_MAX_INDEXED_TOOL_CHARS,
): Pick<SearchDocument, 'content' | 'tool'> {
  const content = snapshot.messages.map((message) => serializeLiveMessage(message)).join('\n')
  const tool = snapshot.events.map((event) => serializeLiveEventToolContent(event)).join('\n')

  return {
    content: capSearchField(normalizeSearchText(content), maxIndexedContentChars),
    tool: capSearchField(normalizeSearchText(tool), maxIndexedToolChars),
  }
}

function capSearchField(value: string, maxChars: number): string {
  if (maxChars <= 0) {
    return ''
  }

  if (value.length <= maxChars) {
    return value
  }

  return value.slice(0, maxChars)
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

function createIndexingProgress(
  indexedSessions: number,
  totalSessions: number,
  isIndexing: boolean,
): SessionSearchIndexingProgress {
  return {
    indexedSessions,
    totalSessions,
    isIndexing,
    updatedAt: new Date().toISOString(),
  }
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => setTimeout(resolve, ms))
}
