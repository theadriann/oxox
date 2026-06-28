import { existsSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'

import type {
  FoundationBootstrap,
  LiveSessionEventRecord,
  LiveSessionMessage,
  LiveSessionSnapshot,
  SessionRecord,
  SessionSearchHit,
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
import type { TranscriptRecord } from '../artifacts/jsonlParser'
import {
  extractTranscriptSearchFragments,
  type SearchFragmentDocument,
  type SessionFileSnapshotSearchSource,
  type SessionSettingsSearchSource,
} from './sessionFragmentIndex'

const SEARCH_SOURCE_SCHEMA_VERSION = 3
const SEARCH_DATABASE_SCHEMA_VERSION = 2

type SearchSessionTranscript = SessionTranscript & {
  settings?: SessionSettingsSearchSource | null
  snapshots?: SessionFileSnapshotSearchSource[]
  sourceRecords?: TranscriptRecord[]
}

export interface LoadSessionTranscriptSearchOptions {
  startLineNo?: number
  startOffset?: number
}

type TranscriptHydrationMode = 'append' | 'replace'

interface TranscriptHydrationState {
  checksum: string | null
  lastIndexedByteOffset: number
  lastIndexedLineNo: number
  lastMtimeMs: number
  parseStatus: string
  recordCount: number
  schemaVersion: number
  sessionId: string
  sourcePath: string
}

export interface SearchDocument {
  id: string
  title: string
  project: string
  path: string
  status: string
  sessionId: string
  transport: string
  modelId: string
  favorite: string
  content: string
  tool: string
  lastActivityAt: number
  transcriptSourcePath: string | null
  sourceChecksum: string | null
  sourceLastByteOffset: number
  sourceLastMtimeMs: number
}

export interface SessionSearchStore {
  listHydratedDocumentIds: () => string[]
  getTranscriptHydrationState?: (
    sessionId: string,
    sourcePath: string,
  ) => TranscriptHydrationState | null
  deleteSession: (sessionId: string) => void
  replaceMetadataDocuments: (documents: SearchDocument[]) => void
  upsertDocument: (
    document: SearchDocument,
    fragments?: SearchFragmentDocument[],
    sourceRecords?: TranscriptRecord[],
    options?: { mode?: TranscriptHydrationMode; previousState?: TranscriptHydrationState | null },
  ) => void
  searchDocuments: (parsed: ParsedSessionSearchQuery) => SearchDocument[]
  searchFragments?: (parsed: ParsedSessionSearchQuery, limit?: number) => SearchFragmentDocument[]
  dispose?: () => void
}

interface CreateSessionSearchServiceOptions {
  bootstrap: FoundationBootstrap
  loadSessionTranscript: (
    sessionId: string,
    transcriptSourcePath: string,
    options?: LoadSessionTranscriptSearchOptions,
  ) => Promise<SearchSessionTranscript>
  backgroundHydrationBatchDelayMs?: number
  backgroundHydrationBatchSize?: number
  backgroundHydrationDelayMs?: number
  backgroundHydrationLimit?: number
  createSearchStore?: () => SessionSearchStore
  hydrationYieldMs?: number
  liveUpdateDebounceMs?: number
  maxIndexedContentChars?: number
  maxIndexedFragmentsPerSession?: number
  maxIndexedSourceRecordsPerSession?: number
  maxIndexedToolChars?: number
  persistFoundationMetadata?: boolean
  searchDatabasePath?: string
}

interface SessionSearchService {
  searchSessions: (request: SessionSearchRequest) => SessionSearchResponse
  getIndexingProgress: () => SessionSearchIndexingProgress
  deleteSession: (sessionId: string) => void
  replaceFoundation: (bootstrap: FoundationBootstrap, options?: ReplaceFoundationOptions) => void
  scheduleLiveSnapshotUpdate: (snapshot: LiveSessionSnapshot) => void
  waitForHydration: () => Promise<void>
  dispose: () => void
}

interface ReplaceFoundationOptions {
  persistMetadata?: boolean
  scheduleHydration?: boolean
}

const DEFAULT_LIMIT = 100
const DEFAULT_BACKGROUND_HYDRATION_DELAY_MS = 2_000
const DEFAULT_HYDRATION_YIELD_MS = 25
const DEFAULT_LIVE_UPDATE_DEBOUNCE_MS = 100
const DEFAULT_MAX_INDEXED_CONTENT_CHARS = 80_000
const DEFAULT_MAX_INDEXED_TOOL_CHARS = 40_000
const MAX_SEARCH_CANDIDATES = 2_500
const MIN_SEARCH_CANDIDATES = 250
const SEARCH_CANDIDATE_MULTIPLIER = 4
const MAX_ENTITY_SCAN_CHARS = 20_000
const MAX_ENTITIES_PER_FRAGMENT = 64
const FILE_WITH_EXTENSION_ENTITY_PATTERN = /[\w@./-]+\.[A-Za-z0-9]{1,12}/gu
const ABSOLUTE_PATH_ENTITY_PATTERN = /\/(?:[\w@.-]+\/)+[\w@.-]+/gu
const require = createRequire(import.meta.url)

export function createSessionSearchService({
  backgroundHydrationBatchDelayMs = 0,
  backgroundHydrationBatchSize,
  backgroundHydrationDelayMs = DEFAULT_BACKGROUND_HYDRATION_DELAY_MS,
  backgroundHydrationLimit,
  bootstrap,
  createSearchStore,
  hydrationYieldMs = DEFAULT_HYDRATION_YIELD_MS,
  loadSessionTranscript,
  liveUpdateDebounceMs = DEFAULT_LIVE_UPDATE_DEBOUNCE_MS,
  maxIndexedContentChars = DEFAULT_MAX_INDEXED_CONTENT_CHARS,
  maxIndexedFragmentsPerSession,
  maxIndexedSourceRecordsPerSession,
  maxIndexedToolChars = DEFAULT_MAX_INDEXED_TOOL_CHARS,
  persistFoundationMetadata = true,
  searchDatabasePath = ':memory:',
}: CreateSessionSearchServiceOptions): SessionSearchService {
  let documents = new Map<string, SearchDocument>()
  const searchStore = createSearchStore?.() ?? createSqliteSessionSearchStore(searchDatabasePath)
  let hydratedDocumentIds = new Set(searchStore.listHydratedDocumentIds())
  let failedHydrationDocumentIds = new Set<string>()
  let disposed = false
  let hydrationInFlight = false
  let hydrationPromise: Promise<void> = Promise.resolve()
  let hydrationRerunRequested = false
  let indexingProgress = createIndexingProgress(0, 0, false)
  const pendingLiveSnapshots = new Map<string, LiveSessionSnapshot>()
  const liveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const upsertIndexedDocument = (
    document: SearchDocument,
    fragments?: SearchFragmentDocument[],
    sourceRecords?: TranscriptRecord[],
    options?: { mode?: TranscriptHydrationMode; previousState?: TranscriptHydrationState | null },
  ) => {
    documents.set(document.id, stripHydratedFields(document))
    hydratedDocumentIds.add(document.id)
    searchStore.upsertDocument(document, fragments, sourceRecords, options)
  }

  const resolveTranscriptHydration = (document: SearchDocument) => {
    const previousState = document.transcriptSourcePath
      ? (searchStore.getTranscriptHydrationState?.(document.id, document.transcriptSourcePath) ??
        null)
      : null
    const canAppend =
      Boolean(previousState) &&
      previousState?.parseStatus === 'ok' &&
      previousState.schemaVersion === SEARCH_SOURCE_SCHEMA_VERSION &&
      previousState.sessionId === document.id &&
      previousState.sourcePath === document.transcriptSourcePath &&
      previousState.lastIndexedByteOffset > 0 &&
      previousState.lastIndexedByteOffset < document.sourceLastByteOffset

    if (canAppend) {
      return {
        mode: 'append' as const,
        previousState,
        startLineNo: previousState.lastIndexedLineNo + 1,
        startOffset: previousState.lastIndexedByteOffset,
      }
    }

    return {
      mode: 'replace' as const,
      previousState,
      startLineNo: 1,
      startOffset: 0,
    }
  }

  const getHydrationPlan = () => {
    const hydratableSessions = [...documents.values()]
      .filter((document) => document.transcriptSourcePath)
      .sort((left, right) => right.lastActivityAt - left.lastActivityAt)
    const processedDocumentIds = new Set([...hydratedDocumentIds, ...failedHydrationDocumentIds])
    const totalSessions = hydratableSessions.length
    const indexedSessions = hydratableSessions.filter((document) =>
      processedDocumentIds.has(document.id),
    ).length
    const pendingSessions = hydratableSessions.filter(
      (document) => !processedDocumentIds.has(document.id),
    )
    const sessionsToHydrate = pendingSessions.slice(
      0,
      typeof backgroundHydrationLimit === 'number'
        ? Math.max(0, backgroundHydrationLimit)
        : undefined,
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
    const batchSize =
      typeof backgroundHydrationBatchSize === 'number'
        ? Math.max(1, Math.floor(backgroundHydrationBatchSize))
        : Number.POSITIVE_INFINITY

    try {
      let didApplyInitialDelay = false

      do {
        hydrationRerunRequested = false
        const sessionsToHydrate = updateIndexingProgressFromPlan()

        if (sessionsToHydrate.length === 0) {
          continue
        }

        if (!didApplyInitialDelay) {
          didApplyInitialDelay = true
          await delay(backgroundHydrationDelayMs)
        }

        for (const [index, document] of sessionsToHydrate.entries()) {
          if (disposed) {
            return
          }

          const currentDocument = documents.get(document.id)

          if (!currentDocument?.transcriptSourcePath || hydratedDocumentIds.has(document.id)) {
            continue
          }

          try {
            const hydration = resolveTranscriptHydration(currentDocument)
            const transcript = await loadSessionTranscript(
              currentDocument.id,
              currentDocument.transcriptSourcePath,
              { startLineNo: hydration.startLineNo, startOffset: hydration.startOffset },
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
            const indexedSourceRecords = limitIndexedRows(
              transcript.sourceRecords ?? [],
              maxIndexedSourceRecordsPerSession,
            )
            const indexedFragments = limitIndexedRows(
              extractTranscriptSearchFragments({
                entries: transcript.entries,
                projectId: nextDocument.project || null,
                sessionId: currentDocument.id,
                settings: hydration.mode === 'append' ? null : transcript.settings,
                snapshots: hydration.mode === 'append' ? [] : transcript.snapshots,
                sourceRecords: indexedSourceRecords,
              }),
              maxIndexedFragmentsPerSession,
            )
            upsertIndexedDocument(nextDocument, indexedFragments, indexedSourceRecords, {
              mode: hydration.mode,
              previousState: hydration.previousState,
            })
          } catch {
            // Search should remain available even if a transcript artifact is missing
            // or malformed. Metadata matches are still useful and are indexed synchronously.
            failedHydrationDocumentIds.add(currentDocument.id)
          } finally {
            if (!disposed) {
              updateIndexingProgressFromPlan()
            }
          }

          const isLastDocument = index === sessionsToHydrate.length - 1
          const shouldPauseForBatch =
            !isLastDocument && backgroundHydrationBatchDelayMs > 0 && (index + 1) % batchSize === 0

          await delay(shouldPauseForBatch ? backgroundHydrationBatchDelayMs : hydrationYieldMs)
        }
      } while (
        !disposed &&
        (hydrationRerunRequested || updateIndexingProgressFromPlan().length > 0)
      )
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

  const replaceFoundation = (
    nextBootstrap: FoundationBootstrap,
    {
      persistMetadata = true,
      scheduleHydration: shouldScheduleHydration = true,
    }: ReplaceFoundationOptions = {},
  ) => {
    const metadataBySessionId = new Map(
      nextBootstrap.syncMetadata.map((metadata) => [metadata.sessionId, metadata]),
    )
    documents = new Map(
      nextBootstrap.sessions.map((session) => [
        session.id,
        createDocumentFromSession(session, metadataBySessionId.get(session.id) ?? null),
      ]),
    )
    if (persistMetadata && persistFoundationMetadata) {
      searchStore.replaceMetadataDocuments([...documents.values()])
      hydratedDocumentIds = new Set(searchStore.listHydratedDocumentIds())
    }
    const currentDocumentIds = new Set(documents.keys())
    hydratedDocumentIds = new Set(
      [...hydratedDocumentIds].filter((documentId) => currentDocumentIds.has(documentId)),
    )
    failedHydrationDocumentIds = new Set(
      [...failedHydrationDocumentIds].filter((documentId) => currentDocumentIds.has(documentId)),
    )
    if (shouldScheduleHydration) {
      scheduleHydration()
    } else {
      updateIndexingProgressFromPlan()
    }
  }

  const searchSessions = (request: SessionSearchRequest): SessionSearchResponse => {
    const parsed = parseSessionSearchQuery(request.query)
    const limit = request.limit ?? DEFAULT_LIMIT

    if (!parsed.freeText && Object.keys(parsed.modifiers).length === 0) {
      return { query: request.query, matches: [] }
    }

    const documentMatches = searchStore
      .searchDocuments(parsed)
      .filter((document) => documentMatchesQuery(document, parsed))
      .map((document) => ({
        sessionId: document.id,
        score: rankDocument(document, parsed),
        reasons: buildReasons(document, parsed),
      }))

    const candidateLimit = calculateSearchCandidateLimit(limit)
    const searchableFragments = searchStore.searchFragments?.(parsed, candidateLimit) ?? []
    const fragmentsBySessionId = groupFragmentsBySession(searchableFragments)
    const fragmentMatches = searchableFragments
      .filter((fragment) => fragmentMatchesQuery(fragment, parsed))
      .map((fragment) => ({
        sessionId: fragment.sessionId,
        score: rankFragment(fragment, parsed),
        reasons: buildFragmentReasons(fragment, parsed),
      }))
    const sessionCoverageMatches = buildSessionCoverageMatches(parsed, fragmentsBySessionId)
    const rankedMatches = [...documentMatches, ...fragmentMatches, ...sessionCoverageMatches]
    const mergedMatches = mergeSearchMatches(rankedMatches)
      .filter((match) =>
        sessionMatchesQuery(
          match.sessionId,
          parsed,
          documents.get(match.sessionId),
          fragmentsBySessionId.get(match.sessionId) ?? [],
        ),
      )
      .sort(
        (left, right) =>
          right.score - left.score ||
          (documents.get(right.sessionId)?.lastActivityAt ?? 0) -
            (documents.get(left.sessionId)?.lastActivityAt ?? 0) ||
          left.sessionId.localeCompare(right.sessionId),
      )

    const matchingSessionIds = new Set(mergedMatches.map((match) => match.sessionId))
    const allHits = buildSearchHits(
      rankedMatches.filter((match) => matchingSessionIds.has(match.sessionId)),
    )
    const hits = allHits.slice(0, limit)
    const matches = mergedMatches.slice(0, limit)

    return {
      hasMore: allHits.length > limit || mergedMatches.length > limit,
      hits,
      query: request.query,
      matches,
    }
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

  const deleteSession = (sessionId: string): void => {
    documents.delete(sessionId)
    hydratedDocumentIds.delete(sessionId)
    failedHydrationDocumentIds.delete(sessionId)
    pendingLiveSnapshots.delete(sessionId)

    const timer = liveTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      liveTimers.delete(sessionId)
    }

    searchStore.deleteSession(sessionId)
    updateIndexingProgressFromPlan()
  }

  replaceFoundation(bootstrap)

  return {
    searchSessions,
    getIndexingProgress: () => indexingProgress,
    deleteSession,
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
  get: (...params: unknown[]) => TResult | undefined
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
  transport: string
  modelId: string
  favorite: string
  content: string
  tool: string
  lastActivityAt: number
  transcriptSourcePath: string | null
  sourceChecksum: string | null
  sourceLastByteOffset: number
  sourceLastMtimeMs: number
}

type SearchFragmentDocumentRow = {
  documentKey: string
  sessionId: string
  projectId: string | null
  sourceKind: SearchFragmentDocument['sourceKind']
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

type TranscriptHydrationStateRow = {
  checksum: string | null
  lastIndexedByteOffset: number
  lastIndexedLineNo: number
  lastMtimeMs: number
  parseStatus: string
  recordCount: number
  schemaVersion: number
  sessionId: string
  sourcePath: string
}

function shouldResetSearchDatabase(database: SqliteDatabase, databasePath: string): boolean {
  if (databasePath === ':memory:' || !hasSearchSchemaTables(database)) {
    return false
  }

  return readSearchDatabaseUserVersion(database) !== SEARCH_DATABASE_SCHEMA_VERSION
}

function hasSearchSchemaTables(database: SqliteDatabase): boolean {
  const row = database
    .prepare<{ count: number }>(
      "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'session_search_documents'",
    )
    .get()

  return Number(row?.count ?? 0) > 0
}

function readSearchDatabaseUserVersion(database: SqliteDatabase): number {
  const row = database.prepare<Record<string, unknown>>('PRAGMA user_version').get()
  const value = row ? Object.values(row)[0] : 0

  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function deleteSearchDatabaseFiles(databasePath: string): void {
  for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (existsSync(path)) {
      unlinkSync(path)
    }
  }
}

function createSqliteSessionSearchStore(databasePath: string): SessionSearchStore {
  let database = createSqliteDatabase(databasePath)

  if (shouldResetSearchDatabase(database, databasePath)) {
    database.close()
    deleteSearchDatabaseFiles(databasePath)
    database = createSqliteDatabase(databasePath)
  }

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
      transport TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      favorite TEXT NOT NULL DEFAULT 'false',
      content TEXT NOT NULL DEFAULT '',
      tool TEXT NOT NULL DEFAULT '',
      last_activity_at INTEGER NOT NULL DEFAULT 0,
      transcript_source_path TEXT,
      source_last_byte_offset INTEGER NOT NULL DEFAULT -1,
      source_last_mtime_ms INTEGER NOT NULL DEFAULT 0,
      source_checksum TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_session_search_last_activity_at
      ON session_search_documents(last_activity_at);
    CREATE TABLE IF NOT EXISTS artifact_sources (
      source_path TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      source_kind TEXT NOT NULL DEFAULT 'transcript',
      last_indexed_byte_offset INTEGER NOT NULL DEFAULT -1,
      last_indexed_line_no INTEGER NOT NULL DEFAULT 0,
      last_mtime_ms INTEGER NOT NULL DEFAULT 0,
      checksum TEXT,
      record_count INTEGER NOT NULL DEFAULT 0,
      parse_status TEXT NOT NULL DEFAULT 'ok',
      schema_version INTEGER NOT NULL DEFAULT ${SEARCH_SOURCE_SCHEMA_VERSION},
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifact_sources_session_id
      ON artifact_sources(session_id);
    CREATE TABLE IF NOT EXISTS session_records (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      byte_offset INTEGER NOT NULL,
      byte_length INTEGER NOT NULL,
      record_id TEXT,
      record_type TEXT NOT NULL,
      timestamp TEXT,
      parent_id TEXT,
      compaction_summary_id TEXT,
      raw_hash TEXT NOT NULL,
      UNIQUE(source_path, line_no)
    );
    CREATE TABLE IF NOT EXISTS session_blocks (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      message_id TEXT,
      role TEXT,
      visibility TEXT,
      block_type TEXT NOT NULL,
      timestamp TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      is_error INTEGER DEFAULT 0,
      file_path TEXT,
      title TEXT,
      body TEXT NOT NULL,
      preview TEXT,
      text_hash TEXT,
      UNIQUE(session_id, source_id, block_type)
    );
    CREATE TABLE IF NOT EXISTS session_tool_calls (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      input_text TEXT,
      result_text TEXT,
      result_preview TEXT,
      is_error INTEGER DEFAULT 0,
      file_path TEXT,
      command TEXT,
      timestamp TEXT,
      UNIQUE(session_id, tool_call_id)
    );
    CREATE TABLE IF NOT EXISTS session_compactions (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      summary_id TEXT NOT NULL,
      timestamp TEXT,
      summary_kind TEXT,
      summary_tokens INTEGER,
      removed_count INTEGER,
      summary_text TEXT,
      system_info_json TEXT
    );
    CREATE TABLE IF NOT EXISTS session_todos (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      timestamp TEXT,
      status TEXT,
      body TEXT NOT NULL,
      UNIQUE(session_id, source_id)
    );
    CREATE TABLE IF NOT EXISTS session_file_snapshots (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      message_id TEXT,
      message_index INTEGER,
      tool_call_id TEXT,
      timestamp INTEGER,
      file_path TEXT NOT NULL,
      file_name TEXT,
      extension TEXT,
      content_hash TEXT,
      size_bytes INTEGER,
      captured_at INTEGER,
      change_kind TEXT DEFAULT 'snapshot'
    );
    CREATE TABLE IF NOT EXISTS session_entities (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      entity_kind TEXT NOT NULL,
      value TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      UNIQUE(session_id, source_id, entity_kind, value)
    );
    CREATE INDEX IF NOT EXISTS idx_session_entities_value
      ON session_entities(value);
    CREATE TABLE IF NOT EXISTS search_documents (
      id INTEGER PRIMARY KEY,
      document_key TEXT NOT NULL UNIQUE,
      session_id TEXT NOT NULL,
      project_id TEXT,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT,
      subtitle TEXT,
      body TEXT NOT NULL,
      preview TEXT,
      role TEXT,
      tool_name TEXT,
      file_path TEXT,
      timestamp TEXT,
      status TEXT,
      rank_boost REAL DEFAULT 1.0,
      message_id TEXT,
      tool_call_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_search_documents_session_id
      ON search_documents(session_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
      title,
      subtitle,
      body,
      preview,
      content='search_documents',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS search_path_fts USING fts5(
      file_path,
      title,
      subtitle,
      content='search_documents',
      content_rowid='id',
      tokenize='trigram'
    );
    PRAGMA user_version = ${SEARCH_DATABASE_SCHEMA_VERSION};
  `)
  ensureTableColumn(
    database,
    'session_search_documents',
    'source_last_byte_offset',
    'INTEGER NOT NULL DEFAULT -1',
  )
  ensureTableColumn(
    database,
    'session_search_documents',
    'source_last_mtime_ms',
    'INTEGER NOT NULL DEFAULT 0',
  )
  ensureTableColumn(database, 'session_search_documents', 'source_checksum', 'TEXT')
  ensureTableColumn(database, 'session_search_documents', 'transport', "TEXT NOT NULL DEFAULT ''")
  ensureTableColumn(database, 'session_search_documents', 'model_id', "TEXT NOT NULL DEFAULT ''")
  ensureTableColumn(
    database,
    'session_search_documents',
    'favorite',
    "TEXT NOT NULL DEFAULT 'false'",
  )

  const upsertMetadataStatement = database.prepare(`
    INSERT INTO session_search_documents (
      id,
      title,
      project,
      path,
      status,
      session_id,
      transport,
      model_id,
      favorite,
      content,
      tool,
      last_activity_at,
      transcript_source_path,
      source_last_byte_offset,
      source_last_mtime_ms,
      source_checksum
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      project = excluded.project,
      path = excluded.path,
      status = excluded.status,
      session_id = excluded.session_id,
      transport = excluded.transport,
      model_id = excluded.model_id,
      favorite = excluded.favorite,
      last_activity_at = excluded.last_activity_at,
      transcript_source_path = excluded.transcript_source_path,
      source_last_byte_offset = excluded.source_last_byte_offset,
      source_last_mtime_ms = excluded.source_last_mtime_ms,
      source_checksum = excluded.source_checksum
  `)
  const upsertDocumentStatement = database.prepare(`
    INSERT INTO session_search_documents (
      id,
      title,
      project,
      path,
      status,
      session_id,
      transport,
      model_id,
      favorite,
      content,
      tool,
      last_activity_at,
      transcript_source_path,
      source_last_byte_offset,
      source_last_mtime_ms,
      source_checksum
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      project = excluded.project,
      path = excluded.path,
      status = excluded.status,
      session_id = excluded.session_id,
      transport = excluded.transport,
      model_id = excluded.model_id,
      favorite = excluded.favorite,
      content = excluded.content,
      tool = excluded.tool,
      last_activity_at = excluded.last_activity_at,
      transcript_source_path = excluded.transcript_source_path,
      source_last_byte_offset = excluded.source_last_byte_offset,
      source_last_mtime_ms = excluded.source_last_mtime_ms,
      source_checksum = excluded.source_checksum
  `)
  const allIdsStatement = database.prepare<{ id: string }>(
    'SELECT id FROM session_search_documents',
  )
  const hydratedIdsStatement = database.prepare<{ id: string }>(`
    SELECT session_search_documents.id
    FROM session_search_documents
    LEFT JOIN artifact_sources
      ON artifact_sources.source_path = session_search_documents.transcript_source_path
      AND artifact_sources.session_id = session_search_documents.session_id
    WHERE
      (
        length(session_search_documents.content) > 0
        OR length(session_search_documents.tool) > 0
        OR EXISTS (
          SELECT 1
          FROM search_documents
          WHERE search_documents.session_id = session_search_documents.id
        )
      )
      AND (
        session_search_documents.transcript_source_path IS NULL
        OR (
          artifact_sources.parse_status = 'ok'
          AND artifact_sources.schema_version = ${SEARCH_SOURCE_SCHEMA_VERSION}
          AND artifact_sources.last_indexed_byte_offset = session_search_documents.source_last_byte_offset
          AND artifact_sources.last_mtime_ms = session_search_documents.source_last_mtime_ms
          AND coalesce(artifact_sources.checksum, '') = coalesce(session_search_documents.source_checksum, '')
        )
      )
  `)
  const deleteDocumentStatement = database.prepare(
    'DELETE FROM session_search_documents WHERE id = ?',
  )
  const deleteArtifactSourceStatement = database.prepare(
    'DELETE FROM artifact_sources WHERE session_id = ?',
  )
  const selectArtifactSourceStatement = database.prepare<TranscriptHydrationStateRow>(`
    SELECT
      source_path AS sourcePath,
      session_id AS sessionId,
      last_indexed_byte_offset AS lastIndexedByteOffset,
      last_indexed_line_no AS lastIndexedLineNo,
      last_mtime_ms AS lastMtimeMs,
      checksum,
      record_count AS recordCount,
      parse_status AS parseStatus,
      schema_version AS schemaVersion
    FROM artifact_sources
    WHERE session_id = ? AND source_path = ?
  `)
  const selectSearchDocumentIdsBySessionStatement = database.prepare<{ id: number }>(
    'SELECT id FROM search_documents WHERE session_id = ?',
  )
  const deleteSearchDocumentStatement = database.prepare(
    'DELETE FROM search_documents WHERE session_id = ?',
  )
  const deleteSearchFtsStatement = database.prepare('DELETE FROM search_fts WHERE rowid = ?')
  const deleteSearchPathFtsStatement = database.prepare(
    'DELETE FROM search_path_fts WHERE rowid = ?',
  )
  const deleteSessionBlockStatement = database.prepare(
    'DELETE FROM session_blocks WHERE session_id = ?',
  )
  const deleteSessionToolCallStatement = database.prepare(
    'DELETE FROM session_tool_calls WHERE session_id = ?',
  )
  const deleteSessionCompactionStatement = database.prepare(
    'DELETE FROM session_compactions WHERE session_id = ?',
  )
  const deleteSessionTodoStatement = database.prepare(
    'DELETE FROM session_todos WHERE session_id = ?',
  )
  const deleteSessionFileSnapshotStatement = database.prepare(
    'DELETE FROM session_file_snapshots WHERE session_id = ?',
  )
  const deleteSessionEntityStatement = database.prepare(
    'DELETE FROM session_entities WHERE session_id = ?',
  )
  const insertSessionBlockStatement = database.prepare(`
    INSERT OR REPLACE INTO session_blocks (
      session_id,
      source_id,
      message_id,
      role,
      visibility,
      block_type,
      timestamp,
      tool_call_id,
      tool_name,
      is_error,
      file_path,
      title,
      body,
      preview,
      text_hash
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertSessionToolCallStatement = database.prepare(`
    INSERT OR REPLACE INTO session_tool_calls (
      session_id,
      tool_call_id,
      tool_name,
      input_text,
      result_text,
      result_preview,
      is_error,
      file_path,
      command,
      timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertSessionCompactionStatement = database.prepare(`
    INSERT INTO session_compactions (
      session_id,
      summary_id,
      timestamp,
      summary_kind,
      summary_tokens,
      removed_count,
      summary_text,
      system_info_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertSessionTodoStatement = database.prepare(`
    INSERT OR REPLACE INTO session_todos (
      session_id,
      source_id,
      timestamp,
      status,
      body
    )
    VALUES (?, ?, ?, ?, ?)
  `)
  const insertSessionFileSnapshotStatement = database.prepare(`
    INSERT INTO session_file_snapshots (
      session_id,
      message_id,
      message_index,
      tool_call_id,
      timestamp,
      file_path,
      file_name,
      extension,
      content_hash,
      size_bytes,
      captured_at,
      change_kind
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertSessionEntityStatement = database.prepare(`
    INSERT INTO session_entities (
      session_id,
      source_kind,
      source_id,
      entity_kind,
      value,
      weight
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, source_id, entity_kind, value) DO UPDATE SET
      weight = max(weight, excluded.weight)
  `)
  const deleteSessionRecordStatement = database.prepare(
    'DELETE FROM session_records WHERE session_id = ? AND source_path = ?',
  )
  const upsertArtifactSourceStatement = database.prepare(`
    INSERT INTO artifact_sources (
      source_path,
      session_id,
      source_kind,
      last_indexed_byte_offset,
      last_indexed_line_no,
      last_mtime_ms,
      checksum,
      record_count,
      parse_status,
      schema_version,
      updated_at
    )
    VALUES (?, ?, 'transcript', ?, ?, ?, ?, ?, 'ok', ?, ?)
    ON CONFLICT(source_path) DO UPDATE SET
      session_id = excluded.session_id,
      source_kind = excluded.source_kind,
      last_indexed_byte_offset = excluded.last_indexed_byte_offset,
      last_indexed_line_no = excluded.last_indexed_line_no,
      last_mtime_ms = excluded.last_mtime_ms,
      checksum = excluded.checksum,
      record_count = excluded.record_count,
      parse_status = excluded.parse_status,
      schema_version = excluded.schema_version,
      updated_at = excluded.updated_at
  `)
  const insertSessionRecordStatement = database.prepare(`
    INSERT INTO session_records (
      session_id,
      source_path,
      line_no,
      byte_offset,
      byte_length,
      record_id,
      record_type,
      timestamp,
      parent_id,
      compaction_summary_id,
      raw_hash
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertSearchDocumentStatement = database.prepare(`
    INSERT OR REPLACE INTO search_documents (
      document_key,
      session_id,
      project_id,
      source_kind,
      source_id,
      title,
      subtitle,
      body,
      preview,
      role,
      tool_name,
      file_path,
      timestamp,
      status,
      rank_boost,
      message_id,
      tool_call_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const selectSearchDocumentIdByKeyStatement = database.prepare<{ id: number }>(
    'SELECT id FROM search_documents WHERE document_key = ?',
  )
  const insertSearchFtsStatement = database.prepare(`
    INSERT INTO search_fts (rowid, title, subtitle, body, preview)
    VALUES (?, ?, ?, ?, ?)
  `)
  const insertSearchPathFtsStatement = database.prepare(`
    INSERT INTO search_path_fts (rowid, file_path, title, subtitle)
    VALUES (?, ?, ?, ?)
  `)
  const deleteSearchFtsByDocumentKeyStatement = database.prepare(`
    DELETE FROM search_fts
    WHERE rowid IN (SELECT id FROM search_documents WHERE document_key = ?)
  `)
  const deleteSearchPathFtsByDocumentKeyStatement = database.prepare(`
    DELETE FROM search_path_fts
    WHERE rowid IN (SELECT id FROM search_documents WHERE document_key = ?)
  `)

  const upsertMetadata = (document: SearchDocument) => {
    upsertMetadataStatement.run(
      document.id,
      document.title,
      document.project,
      document.path,
      document.status,
      document.sessionId,
      document.transport,
      document.modelId,
      document.favorite,
      document.lastActivityAt,
      document.transcriptSourcePath,
      document.sourceLastByteOffset,
      document.sourceLastMtimeMs,
      document.sourceChecksum,
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
      document.transport,
      document.modelId,
      document.favorite,
      document.content,
      document.tool,
      document.lastActivityAt,
      document.transcriptSourcePath,
      document.sourceLastByteOffset,
      document.sourceLastMtimeMs,
      document.sourceChecksum,
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
  const insertFragmentRows = (fragments: SearchFragmentDocument[]) => {
    for (const fragment of fragments) {
      insertSessionBlockStatement.run(
        fragment.sessionId,
        fragment.sourceId,
        fragment.messageId,
        fragment.role,
        'user_visible',
        fragment.sourceKind,
        fragment.timestamp,
        fragment.toolCallId,
        fragment.toolName,
        fragment.status === 'error' ? 1 : 0,
        fragment.filePath,
        fragment.title,
        fragment.body,
        fragment.preview,
        String(fragment.body.length),
      )

      if (fragment.sourceKind === 'tool_call' && fragment.toolCallId && fragment.toolName) {
        insertSessionToolCallStatement.run(
          fragment.sessionId,
          fragment.toolCallId,
          fragment.toolName,
          fragment.body,
          fragment.body,
          fragment.preview,
          fragment.status === 'error' ? 1 : 0,
          fragment.filePath,
          fragment.title.toLowerCase() === 'execute' ? fragment.body : null,
          fragment.timestamp,
        )
      }

      if (fragment.sourceKind === 'todo') {
        insertSessionTodoStatement.run(
          fragment.sessionId,
          fragment.sourceId,
          fragment.timestamp,
          fragment.status,
          fragment.body,
        )
      }

      if (fragment.sourceKind === 'compaction') {
        insertSessionCompactionStatement.run(
          fragment.sessionId,
          fragment.sourceId,
          fragment.timestamp,
          fragment.subtitle,
          null,
          null,
          fragment.body,
          null,
        )
      }

      if (fragment.sourceKind === 'file_snapshot' && fragment.filePath) {
        insertSessionFileSnapshotStatement.run(
          fragment.sessionId,
          fragment.messageId,
          null,
          fragment.toolCallId,
          toNullableTimestamp(fragment.timestamp),
          fragment.filePath,
          fragment.filePath.split('/').at(-1) ?? fragment.filePath,
          fragment.filePath.split('.').at(-1) ?? null,
          extractHashLike(fragment.body),
          null,
          toNullableTimestamp(fragment.timestamp),
          fragment.status ?? 'snapshot',
        )
      }

      for (const entity of extractSearchEntities(fragment)) {
        insertSessionEntityStatement.run(
          fragment.sessionId,
          fragment.sourceKind,
          fragment.sourceId,
          entity.kind,
          entity.value,
          entity.weight,
        )
      }

      deleteSearchFtsByDocumentKeyStatement.run(fragment.id)
      deleteSearchPathFtsByDocumentKeyStatement.run(fragment.id)

      insertSearchDocumentStatement.run(
        fragment.id,
        fragment.sessionId,
        fragment.projectId,
        fragment.sourceKind,
        fragment.sourceId,
        fragment.title,
        fragment.subtitle,
        fragment.body,
        fragment.preview,
        fragment.role,
        fragment.toolName,
        fragment.filePath,
        fragment.timestamp,
        fragment.status,
        fragment.rankBoost,
        fragment.messageId,
        fragment.toolCallId,
      )

      const row = selectSearchDocumentIdByKeyStatement.get(fragment.id)

      if (!row) {
        continue
      }

      insertSearchFtsStatement.run(
        row.id,
        fragment.title,
        fragment.subtitle,
        fragment.body,
        fragment.preview,
      )
      insertSearchPathFtsStatement.run(
        row.id,
        fragment.filePath ?? '',
        fragment.title,
        fragment.subtitle,
      )
    }
  }
  const replaceFragmentsTransaction = database.transaction(
    (
      document: SearchDocument,
      fragments: SearchFragmentDocument[],
      sourceRecords: TranscriptRecord[] = [],
    ) => {
      const sessionId = document.id
      for (const row of selectSearchDocumentIdsBySessionStatement.all(sessionId)) {
        deleteSearchFtsStatement.run(row.id)
        deleteSearchPathFtsStatement.run(row.id)
      }

      deleteSearchDocumentStatement.run(sessionId)
      deleteSessionBlockStatement.run(sessionId)
      deleteSessionToolCallStatement.run(sessionId)
      deleteSessionCompactionStatement.run(sessionId)
      deleteSessionTodoStatement.run(sessionId)
      deleteSessionFileSnapshotStatement.run(sessionId)
      deleteSessionEntityStatement.run(sessionId)

      if (document.transcriptSourcePath) {
        deleteSessionRecordStatement.run(sessionId, document.transcriptSourcePath)
        upsertArtifactSourceStatement.run(
          document.transcriptSourcePath,
          sessionId,
          document.sourceLastByteOffset,
          maxSourceLineNo(sourceRecords),
          document.sourceLastMtimeMs,
          document.sourceChecksum,
          sourceRecords.length,
          SEARCH_SOURCE_SCHEMA_VERSION,
          new Date().toISOString(),
        )

        for (const record of sourceRecords) {
          insertSessionRecordStatement.run(
            sessionId,
            document.transcriptSourcePath,
            record.lineNo,
            record.byteOffset,
            record.byteLength,
            record.recordId,
            record.type,
            record.timestamp,
            record.parentRecordId,
            record.compactionSummaryId,
            record.rawHash,
          )
        }
      }

      insertFragmentRows(fragments)
    },
  )
  const appendFragmentsTransaction = database.transaction(
    (
      document: SearchDocument,
      fragments: SearchFragmentDocument[],
      sourceRecords: TranscriptRecord[] = [],
      previousState: TranscriptHydrationState | null = null,
    ) => {
      const sessionId = document.id
      const transcriptSourcePath = document.transcriptSourcePath

      if (!transcriptSourcePath) {
        return
      }

      for (const record of sourceRecords) {
        insertSessionRecordStatement.run(
          sessionId,
          transcriptSourcePath,
          record.lineNo,
          record.byteOffset,
          record.byteLength,
          record.recordId,
          record.type,
          record.timestamp,
          record.parentRecordId,
          record.compactionSummaryId,
          record.rawHash,
        )
      }

      insertFragmentRows(fragments)

      upsertArtifactSourceStatement.run(
        transcriptSourcePath,
        sessionId,
        document.sourceLastByteOffset,
        Math.max(previousState?.lastIndexedLineNo ?? 0, maxSourceLineNo(sourceRecords)),
        document.sourceLastMtimeMs,
        document.sourceChecksum,
        (previousState?.recordCount ?? 0) + sourceRecords.length,
        SEARCH_SOURCE_SCHEMA_VERSION,
        new Date().toISOString(),
      )
    },
  )
  const deleteSessionTransaction = database.transaction((sessionId: string) => {
    for (const row of selectSearchDocumentIdsBySessionStatement.all(sessionId)) {
      deleteSearchFtsStatement.run(row.id)
      deleteSearchPathFtsStatement.run(row.id)
    }

    deleteSearchDocumentStatement.run(sessionId)
    deleteSessionBlockStatement.run(sessionId)
    deleteSessionToolCallStatement.run(sessionId)
    deleteSessionCompactionStatement.run(sessionId)
    deleteSessionTodoStatement.run(sessionId)
    deleteSessionFileSnapshotStatement.run(sessionId)
    deleteSessionEntityStatement.run(sessionId)
    deleteArtifactSourceStatement.run(sessionId)
    deleteDocumentStatement.run(sessionId)
  })

  return {
    listHydratedDocumentIds: () => hydratedIdsStatement.all().map((row) => row.id),
    getTranscriptHydrationState: (sessionId, sourcePath) =>
      selectArtifactSourceStatement.get(sessionId, sourcePath) ?? null,
    deleteSession: (sessionId) => {
      deleteSessionTransaction(sessionId)
    },
    replaceMetadataDocuments: (nextDocuments) => {
      replaceMetadataTransaction(nextDocuments)
    },
    upsertDocument: (document, fragments, sourceRecords, options) => {
      upsertDocument(document)

      if (fragments) {
        if (options?.mode === 'append') {
          appendFragmentsTransaction(document, fragments, sourceRecords, options.previousState)
        } else {
          replaceFragmentsTransaction(document, fragments, sourceRecords)
        }
      }
    },
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
            transport,
            model_id AS modelId,
            favorite,
            content,
            tool,
            last_activity_at AS lastActivityAt,
            transcript_source_path AS transcriptSourcePath,
            source_last_byte_offset AS sourceLastByteOffset,
            source_last_mtime_ms AS sourceLastMtimeMs,
            source_checksum AS sourceChecksum
          FROM session_search_documents
          WHERE ${whereClause}
          ORDER BY last_activity_at DESC, id ASC
        `)
        .all(...parameters)
        .map(rowToSearchDocument)
    },
    searchFragments: (parsed, limit = MIN_SEARCH_CANDIDATES) => {
      const fragments = new Map<string, SearchFragmentDocument>()
      const addFragment = (fragment: SearchFragmentDocument) => {
        if (!fragments.has(fragment.id)) {
          fragments.set(fragment.id, fragment)
        }
      }

      for (const ftsQuery of buildFtsQueries(parsed)) {
        for (const fragment of database
          .prepare<SearchFragmentDocumentRow>(`
            SELECT
              search_documents.document_key AS documentKey,
              search_documents.session_id AS sessionId,
              search_documents.project_id AS projectId,
              search_documents.source_kind AS sourceKind,
              search_documents.source_id AS sourceId,
              snippet(search_fts, 2, '', '', '…', 24) AS ftsSnippet,
              search_documents.title,
              search_documents.subtitle,
              search_documents.body,
              search_documents.preview,
              search_documents.role,
              search_documents.tool_name AS toolName,
              search_documents.file_path AS filePath,
              search_documents.timestamp,
              search_documents.status,
              search_documents.rank_boost AS rankBoost,
              search_documents.message_id AS messageId,
              search_documents.tool_call_id AS toolCallId
            FROM search_documents
            JOIN search_fts ON search_fts.rowid = search_documents.id
            WHERE search_fts MATCH ?
            ORDER BY bm25(search_fts) ASC, search_documents.timestamp DESC, search_documents.id ASC
            LIMIT ?
          `)
          .all(ftsQuery, limit)
          .map(rowToSearchFragmentDocument)) {
          addFragment(fragment)
        }
      }

      for (const query of buildPathFacetQueries(parsed)) {
        for (const fragment of database
          .prepare<SearchFragmentDocumentRow>(`
            SELECT
              search_documents.document_key AS documentKey,
              search_documents.session_id AS sessionId,
              search_documents.project_id AS projectId,
              search_documents.source_kind AS sourceKind,
              search_documents.source_id AS sourceId,
              search_documents.title,
              search_documents.subtitle,
              search_documents.body,
              search_documents.preview,
              search_documents.role,
              search_documents.tool_name AS toolName,
              search_documents.file_path AS filePath,
              search_documents.timestamp,
              search_documents.status,
              search_documents.rank_boost AS rankBoost,
              search_documents.message_id AS messageId,
              search_documents.tool_call_id AS toolCallId
            FROM search_documents
            JOIN search_path_fts ON search_path_fts.rowid = search_documents.id
            WHERE search_path_fts MATCH ?
            ORDER BY bm25(search_path_fts) ASC, search_documents.id ASC
            LIMIT ?
          `)
          .all(query, limit)
          .map(rowToSearchFragmentDocument)) {
          addFragment(fragment)
        }
      }

      for (const { kind, value } of buildEntityFacetQueries(parsed)) {
        for (const fragment of database
          .prepare<SearchFragmentDocumentRow>(`
            SELECT
              search_documents.document_key AS documentKey,
              search_documents.session_id AS sessionId,
              search_documents.project_id AS projectId,
              search_documents.source_kind AS sourceKind,
              search_documents.source_id AS sourceId,
              search_documents.title,
              search_documents.subtitle,
              search_documents.body,
              search_documents.preview,
              search_documents.role,
              search_documents.tool_name AS toolName,
              search_documents.file_path AS filePath,
              search_documents.timestamp,
              search_documents.status,
              search_documents.rank_boost AS rankBoost,
              search_documents.message_id AS messageId,
              search_documents.tool_call_id AS toolCallId
            FROM session_entities
            JOIN search_documents
              ON search_documents.session_id = session_entities.session_id
              AND search_documents.source_kind = session_entities.source_kind
              AND search_documents.source_id = session_entities.source_id
            WHERE session_entities.entity_kind = ?
              AND instr(session_entities.value, ?) > 0
            ORDER BY session_entities.weight DESC, search_documents.id ASC
            LIMIT ?
          `)
          .all(kind, value, limit)
          .map(rowToSearchFragmentDocument)) {
          addFragment(fragment)
        }
      }

      for (const { field, value } of buildDirectFragmentFacetQueries(parsed)) {
        for (const fragment of database
          .prepare<SearchFragmentDocumentRow>(`
          SELECT
            search_documents.document_key AS documentKey,
            search_documents.session_id AS sessionId,
            search_documents.project_id AS projectId,
            search_documents.source_kind AS sourceKind,
            search_documents.source_id AS sourceId,
            search_documents.title,
            search_documents.subtitle,
            search_documents.body,
            search_documents.preview,
            search_documents.role,
            search_documents.tool_name AS toolName,
            search_documents.file_path AS filePath,
            search_documents.timestamp,
            search_documents.status,
            search_documents.rank_boost AS rankBoost,
            search_documents.message_id AS messageId,
            search_documents.tool_call_id AS toolCallId
          FROM search_documents
          WHERE instr(${field}, ?) > 0
          ORDER BY search_documents.id ASC
          LIMIT ?
        `)
          .all(value, limit)
          .map(rowToSearchFragmentDocument)) {
          addFragment(fragment)
        }
      }

      return [...fragments.values()]
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
          get: (...params: unknown[]) => unknown
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

function ensureTableColumn(
  database: SqliteDatabase,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): void {
  const columns = database.prepare<{ name: string }>(`PRAGMA table_info(${tableName})`).all()

  if (columns.some((column) => column.name === columnName)) {
    return
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
}

function maxSourceLineNo(sourceRecords: TranscriptRecord[]): number {
  return sourceRecords.reduce((maxLineNo, record) => Math.max(maxLineNo, record.lineNo), 0)
}

function calculateSearchCandidateLimit(limit: number): number {
  return Math.min(
    MAX_SEARCH_CANDIDATES,
    Math.max(MIN_SEARCH_CANDIDATES, limit * SEARCH_CANDIDATE_MULTIPLIER),
  )
}

function toNullableTimestamp(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function extractHashLike(value: string): string | null {
  return value.match(/\b[a-f0-9]{7,64}\b/iu)?.[0] ?? null
}

function extractSearchEntities(fragment: SearchFragmentDocument): Array<{
  kind: string
  value: string
  weight: number
}> {
  const haystack = [fragment.title, fragment.subtitle, fragment.body, fragment.filePath ?? '']
    .join('\n')
    .slice(0, MAX_ENTITY_SCAN_CHARS)
  const entities: Array<{ kind: string; value: string; weight: number }> = []
  const addMatches = (kind: string, pattern: RegExp, weight: number) => {
    for (const match of haystack.matchAll(pattern)) {
      if (entities.length >= MAX_ENTITIES_PER_FRAGMENT) {
        return
      }

      const value = normalizeSearchText(match[0])
      if (value) {
        entities.push({ kind, value, weight })
      }
    }
  }

  addMatches('file_path', FILE_WITH_EXTENSION_ENTITY_PATTERN, 1.5)
  addMatches('file_path', ABSOLUTE_PATH_ENTITY_PATTERN, 1.5)
  addMatches('issue_key', /\b[a-z][a-z0-9]+-\d+\b/giu, 1.4)
  addMatches('url', /https?:\/\/[^\s)]+/gu, 1.2)
  addMatches('commit', /\b[a-f0-9]{7,40}\b/giu, 1)
  addMatches(
    'error_code',
    /\b(?:ENOENT|EACCES|EPERM|ETIMEDOUT|ResizeObserver|exit code \d+)\b/giu,
    1.3,
  )

  if (fragment.toolName === 'execute') {
    for (const line of fragment.body.split('\n')) {
      if (/^(pnpm|npm|yarn|bun|node|python|pytest|vitest|docker|git)\b/u.test(line)) {
        entities.push({ kind: 'command', value: line, weight: 1.6 })
      }
    }
  }

  return dedupeEntities(entities)
}

function dedupeEntities(
  entities: Array<{ kind: string; value: string; weight: number }>,
): Array<{ kind: string; value: string; weight: number }> {
  const byKey = new Map<string, { kind: string; value: string; weight: number }>()

  for (const entity of entities) {
    const key = `${entity.kind}:${entity.value}`
    const existing = byKey.get(key)

    if (!existing || existing.weight < entity.weight) {
      byKey.set(key, entity)
    }
  }

  return [...byKey.values()]
}

function buildSearchWhereClause(parsed: ParsedSessionSearchQuery): {
  parameters: string[]
  whereClause: string
} {
  const clauses: string[] = []
  const parameters: string[] = []

  for (const termGroup of searchTermGroups(parsed)) {
    const variantClauses: string[] = []

    for (const variant of termGroup) {
      const termClauses: string[] = []

      for (const term of variant) {
        termClauses.push(buildSearchTermWhereClause())
        parameters.push(term, term, term, term, term, term, term)
      }

      if (termClauses.length > 0) {
        variantClauses.push(termClauses.map((clause) => `(${clause})`).join(' AND '))
      }
    }

    if (variantClauses.length > 0) {
      clauses.push(variantClauses.map((clause) => `(${clause})`).join(' OR '))
    }
  }

  for (const [field, values] of Object.entries(parsed.modifiers)) {
    const column = sqlColumnForSearchField(field as SessionSearchModifier)

    if (!column) {
      continue
    }

    for (const value of values ?? []) {
      clauses.push(`instr(${column}, ?) > 0`)
      parameters.push(value)
    }
  }

  return {
    parameters,
    whereClause: clauses.map((clause) => `(${clause})`).join(' AND '),
  }
}

function buildSearchTermWhereClause(): string {
  return [
    'instr(title, ?) > 0',
    'instr(content, ?) > 0',
    'instr(project, ?) > 0',
    'instr(path, ?) > 0',
    'instr(tool, ?) > 0',
    'instr(status, ?) > 0',
    'instr(session_id, ?) > 0',
  ].join(' OR ')
}

function sqlColumnForSearchField(field: SessionSearchModifier): string | null {
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
    case 'transport':
      return 'transport'
    case 'model':
      return 'model_id'
    case 'favorite':
      return 'favorite'
    case 'source':
    case 'kind':
    case 'file':
    case 'command':
    case 'issue':
    case 'error':
    case 'reasoning':
    case 'extension':
      return null
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
    transport: row.transport,
    modelId: row.modelId,
    favorite: row.favorite,
    content: row.content,
    tool: row.tool,
    lastActivityAt: row.lastActivityAt,
    transcriptSourcePath: row.transcriptSourcePath,
    sourceChecksum: row.sourceChecksum,
    sourceLastByteOffset: row.sourceLastByteOffset,
    sourceLastMtimeMs: row.sourceLastMtimeMs,
  }
}

function rowToSearchFragmentDocument(row: SearchFragmentDocumentRow): SearchFragmentDocument {
  return {
    id: row.documentKey,
    sessionId: row.sessionId,
    projectId: row.projectId,
    sourceKind: row.sourceKind,
    sourceId: row.sourceId,
    ftsSnippet: row.ftsSnippet ?? null,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    preview: row.preview,
    role: row.role,
    toolName: row.toolName,
    filePath: row.filePath,
    timestamp: row.timestamp,
    status: row.status,
    rankBoost: row.rankBoost,
    messageId: row.messageId,
    toolCallId: row.toolCallId,
  }
}

function buildFtsQueries(parsed: ParsedSessionSearchQuery): string[] {
  const modifierTerms = Object.values(parsed.modifiers).flatMap((values) => values ?? [])
  const preferredTerms = preferredSearchTerms(parsed)
  const queries = [
    buildFtsQuery([...parsed.terms, ...modifierTerms]),
    buildFtsQuery([...preferredTerms, ...modifierTerms]),
    ...searchTermGroups(parsed).flatMap((group) => group.map((variant) => buildFtsQuery(variant))),
  ]

  return [...new Set(queries.filter(Boolean))]
}

function buildFtsQuery(terms: string[]): string {
  return terms
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(' ')
}

function buildPathFacetQueries(parsed: ParsedSessionSearchQuery): string[] {
  return [
    ...parsed.terms.filter(isPathLikeQuery),
    ...preferredSearchTerms(parsed).filter(isPathLikeQuery),
    ...(parsed.modifiers.path ?? []),
    ...(parsed.modifiers.file ?? []),
    ...(parsed.modifiers.extension ?? []),
  ]
    .filter((value) => value.length >= 3)
    .map((value) => `"${value.replaceAll('"', '""')}"`)
}

function buildEntityFacetQueries(parsed: ParsedSessionSearchQuery): Array<{
  kind: string
  value: string
}> {
  return [
    ...(parsed.modifiers.file ?? []).map((value) => ({ kind: 'file_path', value })),
    ...(parsed.modifiers.command ?? []).map((value) => ({ kind: 'command', value })),
    ...(parsed.modifiers.issue ?? []).map((value) => ({ kind: 'issue_key', value })),
    ...(parsed.modifiers.error ?? []).map((value) => ({ kind: 'error_code', value })),
    ...parsed.terms.filter(isIssueKeyQuery).map((value) => ({ kind: 'issue_key', value })),
    ...parsed.terms.filter(isPathLikeQuery).map((value) => ({ kind: 'file_path', value })),
  ]
}

function searchTermGroups(parsed: ParsedSessionSearchQuery): string[][][] {
  return parsed.termGroups.length > 0 ? parsed.termGroups : parsed.terms.map((term) => [[term]])
}

function preferredSearchTerms(parsed: ParsedSessionSearchQuery): string[] {
  return searchTermGroups(parsed).flatMap(preferredSearchVariant)
}

function reasonSearchTerms(parsed: ParsedSessionSearchQuery): string[] {
  return [...new Set([...parsed.terms, ...preferredSearchTerms(parsed)])]
}

function preferredSearchVariant(group: string[][]): string[] {
  return (
    group.find((variant) => variant.length > 1) ?? group.find((variant) => variant.length > 0) ?? []
  )
}

function buildDirectFragmentFacetQueries(parsed: ParsedSessionSearchQuery): Array<{
  field:
    | 'search_documents.source_kind'
    | 'search_documents.tool_name'
    | 'search_documents.status'
    | 'search_documents.body'
  value: string
}> {
  return [
    ...(parsed.modifiers.source ?? []).map((value) => ({
      field: 'search_documents.source_kind' as const,
      value,
    })),
    ...(parsed.modifiers.kind ?? []).map((value) => ({
      field: 'search_documents.source_kind' as const,
      value,
    })),
    ...(parsed.modifiers.tool ?? []).map((value) => ({
      field: 'search_documents.tool_name' as const,
      value,
    })),
    ...(parsed.modifiers.error ?? []).map(() => ({
      field: 'search_documents.status' as const,
      value: 'error',
    })),
    ...(parsed.modifiers.model ?? []).map((value) => ({
      field: 'search_documents.body' as const,
      value,
    })),
    ...(parsed.modifiers.reasoning ?? []).map((value) => ({
      field: 'search_documents.body' as const,
      value,
    })),
  ]
}

function isIssueKeyQuery(value: string): boolean {
  return /^[a-z][a-z0-9]+-\d+$/u.test(value)
}

function isPathLikeQuery(value: string): boolean {
  return value.includes('/') || /\.[a-z0-9]{1,12}$/u.test(value)
}

function createDocumentFromSession(
  session: SessionRecord,
  sourceMetadata: FoundationBootstrap['syncMetadata'][number] | null,
): SearchDocument {
  return {
    id: session.id,
    title: normalizeSearchText(session.title),
    project: normalizeSearchText(session.projectDisplayName ?? deriveProjectName(session)),
    path: normalizeSearchText(session.projectWorkspacePath ?? ''),
    status: normalizeSearchText(session.status),
    sessionId: normalizeSearchText(session.id),
    transport: normalizeSearchText(session.transport ?? ''),
    modelId: normalizeSearchText(session.modelId ?? ''),
    favorite: session.isFavorite ? 'true' : 'false',
    content: '',
    tool: '',
    lastActivityAt: toTimestamp(session.lastActivityAt ?? session.updatedAt ?? session.createdAt),
    transcriptSourcePath: sourceMetadata?.sourcePath ?? null,
    sourceChecksum: sourceMetadata?.checksum ?? null,
    sourceLastByteOffset: sourceMetadata?.lastByteOffset ?? -1,
    sourceLastMtimeMs: sourceMetadata?.lastMtimeMs ?? 0,
  }
}

function stripHydratedFields(document: SearchDocument): SearchDocument {
  return {
    ...document,
    content: '',
    tool: '',
    sourceChecksum: document.sourceChecksum,
    sourceLastByteOffset: document.sourceLastByteOffset,
    sourceLastMtimeMs: document.sourceLastMtimeMs,
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
    transport: normalizeSearchText(snapshot.transport),
    modelId: existing?.modelId ?? '',
    favorite: existing?.favorite ?? 'false',
    content: extracted.content || existing?.content || '',
    tool: extracted.tool || existing?.tool || '',
    lastActivityAt: Date.now(),
    transcriptSourcePath: existing?.transcriptSourcePath ?? null,
    sourceChecksum: existing?.sourceChecksum ?? null,
    sourceLastByteOffset: existing?.sourceLastByteOffset ?? -1,
    sourceLastMtimeMs: existing?.sourceLastMtimeMs ?? 0,
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
  let content = ''
  let tool = ''

  for (const entry of entries) {
    if (entry.kind === 'message') {
      content = appendCappedSearchText(content, entry.markdown, maxIndexedContentChars)
      continue
    }

    tool = appendCappedSearchText(
      tool,
      [entry.toolName, entry.inputMarkdown, entry.resultMarkdown ?? ''].join('\n'),
      maxIndexedToolChars,
    )
  }

  return {
    content: capSearchField(normalizeSearchText(content), maxIndexedContentChars),
    tool: capSearchField(normalizeSearchText(tool), maxIndexedToolChars),
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

function appendCappedSearchText(current: string, next: string, maxChars: number): string {
  if (maxChars <= 0 || current.length >= maxChars) {
    return current
  }

  const separator = current.length > 0 ? '\n' : ''
  const remaining = Math.max(0, maxChars - current.length - separator.length)

  if (remaining <= 0) {
    return current
  }

  return `${current}${separator}${next.slice(0, remaining)}`
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
    searchTermGroups(parsed).every((group) => searchTermGroupMatchesDocument(document, group)) &&
    modifierMatches(document, parsed.modifiers)
  )
}

function searchTermGroupMatchesDocument(document: SearchDocument, group: string[][]): boolean {
  return group.some((variant) =>
    variant.every((term) => termMatchesAnySearchableField(document, term)),
  )
}

function sessionMatchesQuery(
  sessionId: string,
  parsed: ParsedSessionSearchQuery,
  document: SearchDocument | undefined,
  fragments: SearchFragmentDocument[],
): boolean {
  return Object.entries(parsed.modifiers).every(([field, values]) =>
    shouldApplySessionLevelModifier(field as SessionSearchModifier)
      ? (values ?? []).every((value) =>
          sessionMatchesModifier(
            sessionId,
            field as SessionSearchModifier,
            value,
            document,
            fragments,
          ),
        )
      : true,
  )
}

function shouldApplySessionLevelModifier(field: SessionSearchModifier): boolean {
  switch (field) {
    case 'project':
    case 'status':
    case 'path':
    case 'id':
    case 'transport':
    case 'favorite':
    case 'source':
    case 'kind':
    case 'file':
    case 'command':
    case 'issue':
    case 'error':
    case 'model':
    case 'reasoning':
    case 'extension':
      return true
    case 'title':
    case 'content':
    case 'tool':
      return false
  }
}

function sessionMatchesModifier(
  sessionId: string,
  field: SessionSearchModifier,
  value: string,
  document: SearchDocument | undefined,
  fragments: SearchFragmentDocument[],
): boolean {
  if (document && getFieldValue(document, field).includes(value)) {
    return true
  }

  if (field === 'id') {
    return sessionId.includes(value)
  }

  return fragments.some((fragment) => getFragmentFieldValue(fragment, field).includes(value))
}

function groupFragmentsBySession(
  fragments: SearchFragmentDocument[],
): Map<string, SearchFragmentDocument[]> {
  const bySessionId = new Map<string, SearchFragmentDocument[]>()

  for (const fragment of fragments) {
    bySessionId.set(fragment.sessionId, [...(bySessionId.get(fragment.sessionId) ?? []), fragment])
  }

  return bySessionId
}

function fragmentMatchesQuery(
  fragment: SearchFragmentDocument,
  parsed: ParsedSessionSearchQuery,
): boolean {
  const facetEntries = Object.entries(parsed.modifiers).filter(([field]) =>
    isFragmentFacetField(field as SessionSearchModifier),
  )
  const directEntries = Object.entries(parsed.modifiers).filter(
    ([field]) => !isFragmentFacetField(field as SessionSearchModifier),
  )

  return (
    searchTermGroups(parsed).every((group) => searchTermGroupMatchesFragment(fragment, group)) &&
    directEntries.every(([field, values]) =>
      (values ?? []).every((value) =>
        getFragmentFieldValue(fragment, field as SessionSearchModifier).includes(value),
      ),
    ) &&
    (facetEntries.length === 0 ||
      facetEntries.some(([field, values]) =>
        (values ?? []).some((value) =>
          getFragmentFacetValue(fragment, field as SessionSearchModifier).includes(value),
        ),
      ))
  )
}

function searchTermGroupMatchesFragment(
  fragment: SearchFragmentDocument,
  group: string[][],
): boolean {
  return group.some((variant) =>
    variant.every((term) => termMatchesAnyFragmentField(fragment, term)),
  )
}

function termMatchesAnyFragmentField(fragment: SearchFragmentDocument, term: string): boolean {
  return (
    fragment.title.toLowerCase().includes(term) ||
    fragment.subtitle.includes(term) ||
    fragment.body.includes(term) ||
    (fragment.filePath?.includes(term) ?? false) ||
    (fragment.toolName?.includes(term) ?? false) ||
    fragment.sourceKind.includes(term) ||
    (fragment.status?.includes(term) ?? false) ||
    fragment.sessionId.includes(term)
  )
}

function isFragmentFacetField(field: SessionSearchModifier): boolean {
  switch (field) {
    case 'source':
    case 'kind':
    case 'file':
    case 'command':
    case 'issue':
    case 'error':
    case 'model':
    case 'reasoning':
    case 'extension':
      return true
    case 'title':
    case 'content':
    case 'project':
    case 'path':
    case 'status':
    case 'id':
    case 'tool':
    case 'transport':
    case 'favorite':
      return false
  }
}

function getFragmentFieldValue(
  fragment: SearchFragmentDocument,
  field: SessionSearchModifier,
): string {
  switch (field) {
    case 'title':
      return normalizeSearchText(fragment.title)
    case 'content':
      return fragment.body
    case 'project':
      return normalizeSearchText(fragment.projectId ?? '')
    case 'path':
      return fragment.filePath ?? ''
    case 'status':
      return fragment.status ?? ''
    case 'id':
      return fragment.sessionId
    case 'tool':
      return fragment.toolName ?? ''
    case 'source':
    case 'kind':
      return fragment.sourceKind
    case 'file':
      return [fragment.filePath ?? '', fragment.body].join('\n')
    case 'command':
      return fragment.toolName === 'execute' ? fragment.body : ''
    case 'issue':
      return fragment.sourceKind === 'block' ? '' : fragment.body
    case 'error':
      return fragment.status === 'error' ? fragment.body : ''
    case 'model':
    case 'reasoning':
      return fragment.sourceKind === 'settings' ? fragment.body : ''
    case 'extension':
      return fragment.filePath?.split('.').at(-1) ?? ''
    case 'transport':
    case 'favorite':
      return ''
  }
}

function getFragmentFacetValue(
  fragment: SearchFragmentDocument,
  field: SessionSearchModifier,
): string {
  return getFragmentFieldValue(fragment, field)
}

function rankFragment(fragment: SearchFragmentDocument, parsed: ParsedSessionSearchQuery): number {
  const freeTextScore = searchTermGroups(parsed).reduce(
    (total, group) => total + rankTermGroupAcrossFragmentFields(fragment, group),
    0,
  )
  const modifierScore = Object.entries(parsed.modifiers).reduce((total, [field, values]) => {
    const fieldValue = getFragmentFieldValue(fragment, field as SessionSearchModifier)
    return (
      total +
      (values ?? []).reduce(
        (fieldTotal, value) =>
          fieldTotal +
          rankFieldMatch(fieldValue, value, fragmentFieldWeight(field as SessionSearchModifier)),
        0,
      )
    )
  }, 0)

  return Math.round((freeTextScore + modifierScore + 1_000) * fragment.rankBoost)
}

function rankTermGroupAcrossFragmentFields(
  fragment: SearchFragmentDocument,
  group: string[][],
): number {
  return Math.max(
    ...group.map((variant) =>
      variant.reduce((total, term) => total + rankTermAcrossFragmentFields(fragment, term), 0),
    ),
  )
}

function rankTermAcrossFragmentFields(fragment: SearchFragmentDocument, term: string): number {
  return Math.max(
    rankFieldMatch(normalizeSearchText(fragment.title), term, 4_500),
    rankFieldMatch(fragment.body, term, 4_000),
    rankFieldMatch(fragment.filePath ?? '', term, 5_000),
    rankFieldMatch(fragment.toolName ?? '', term, 2_800),
    rankFieldMatch(fragment.sourceKind, term, 1_500),
    rankFieldMatch(fragment.status ?? '', term, 1_200),
  )
}

function fragmentFieldWeight(field: SessionSearchModifier): number {
  switch (field) {
    case 'title':
      return 4_500
    case 'content':
      return 4_000
    case 'project':
      return 1_000
    case 'path':
      return 5_000
    case 'tool':
      return 2_800
    case 'file':
      return 16_000
    case 'command':
      return 15_000
    case 'issue':
      return 14_000
    case 'error':
      return 13_000
    case 'model':
      return 6_000
    case 'reasoning':
      return 5_000
    case 'source':
    case 'kind':
      return 4_000
    case 'extension':
      return 4_500
    case 'status':
      return 1_200
    case 'id':
      return 700
    case 'transport':
    case 'favorite':
      return 0
  }
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
    document.transport.includes(term) ||
    document.modelId.includes(term) ||
    document.sessionId.includes(term)
  )
}

function rankDocument(document: SearchDocument, parsed: ParsedSessionSearchQuery): number {
  const freeTextScore = searchTermGroups(parsed).reduce(
    (total, group) => total + rankTermGroupAcrossFields(document, group),
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

function rankTermGroupAcrossFields(document: SearchDocument, group: string[][]): number {
  return Math.max(
    ...group.map((variant) =>
      variant.reduce((total, term) => total + rankTermAcrossFields(document, term), 0),
    ),
  )
}

function rankTermAcrossFields(document: SearchDocument, term: string): number {
  return Math.max(
    rankFieldMatch(document.title, term, 10_000),
    rankFieldMatch(document.content, term, 6_000),
    rankFieldMatch(document.project, term, 3_500),
    rankFieldMatch(document.path, term, 3_000),
    rankFieldMatch(document.tool, term, 2_000),
    rankFieldMatch(document.transport, term, 1_200),
    rankFieldMatch(document.modelId, term, 2_400),
    rankFieldMatch(document.status, term, 800),
    rankFieldMatch(document.sessionId, term, 700),
  )
}

function rankFieldMatch(value: string, term: string, weight: number): number {
  if (value === term) {
    return weight * 2 + 5_000
  }

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
    case 'transport':
      return 1_200
    case 'model':
      return 2_400
    case 'favorite':
      return 600
    case 'source':
    case 'kind':
    case 'file':
    case 'command':
    case 'issue':
    case 'error':
    case 'reasoning':
    case 'extension':
      return 0
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
    case 'transport':
      return document.transport
    case 'model':
      return document.modelId
    case 'favorite':
      return document.favorite
    case 'source':
    case 'kind':
    case 'file':
    case 'command':
    case 'issue':
    case 'error':
    case 'reasoning':
    case 'extension':
      return ''
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
  const terms = [
    ...reasonSearchTerms(parsed),
    ...Object.values(parsed.modifiers).flatMap((values) => values ?? []),
  ]

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

function buildFragmentReasons(
  fragment: SearchFragmentDocument,
  parsed: ParsedSessionSearchQuery,
): SessionSearchMatch['reasons'] {
  const reasons: SessionSearchMatch['reasons'] = []
  const fields: SessionSearchModifier[] = [
    'content',
    'path',
    'file',
    'command',
    'issue',
    'error',
    'model',
    'reasoning',
    'source',
    'kind',
    'tool',
    'status',
    'id',
    'title',
  ]
  const terms = [
    ...reasonSearchTerms(parsed).map((term) => ({
      term,
      preferredField: null as SessionSearchModifier | null,
    })),
    ...Object.entries(parsed.modifiers).flatMap(([field, values]) =>
      (values ?? []).map((term) => ({
        term,
        preferredField: field as SessionSearchModifier,
      })),
    ),
  ]

  for (const { preferredField, term } of terms) {
    const matchingField =
      preferredField && getFragmentFieldValue(fragment, preferredField).includes(term)
        ? preferredField
        : fields.find((field) => getFragmentFieldValue(fragment, field).includes(term))

    if (!matchingField) {
      continue
    }

    reasons.push({
      field: matchingField,
      messageId: fragment.messageId,
      role: fragment.role,
      snippet:
        matchingField === 'content' && fragment.ftsSnippet
          ? normalizeFtsSnippet(fragment.ftsSnippet)
          : createSnippet(getFragmentFieldValue(fragment, matchingField), term),
      sourceId: fragment.sourceId,
      sourceKind: fragment.sourceKind,
      toolCallId: fragment.toolCallId,
    })

    if (reasons.length >= 3) {
      break
    }
  }

  return reasons
}

function buildSessionCoverageMatches(
  parsed: ParsedSessionSearchQuery,
  fragmentsBySessionId: Map<string, SearchFragmentDocument[]>,
): SessionSearchMatch[] {
  const groups = searchTermGroups(parsed)

  if (groups.length < 2) {
    return []
  }

  const matches: SessionSearchMatch[] = []

  for (const [sessionId, fragments] of fragmentsBySessionId.entries()) {
    const evidence = groups.map((group) => findBestFragmentForSearchTermGroup(fragments, group))

    if (evidence.some((item) => !item)) {
      continue
    }

    const evidenceFragments = evidence.filter((item): item is SearchFragmentDocument =>
      Boolean(item),
    )
    const distinctSourceCount = new Set(
      evidenceFragments.map((fragment) => `${fragment.sourceKind}:${fragment.sourceId}`),
    ).size

    matches.push({
      sessionId,
      score:
        2_000 +
        distinctSourceCount * 250 +
        0.3 *
          evidenceFragments.reduce(
            (total, fragment, index) =>
              total + rankTermGroupAcrossFragmentFields(fragment, groups[index] ?? []),
            0,
          ),
      reasons: buildSessionCoverageReasons(evidenceFragments, groups),
    })
  }

  return matches
}

function findBestFragmentForSearchTermGroup(
  fragments: SearchFragmentDocument[],
  group: string[][],
): SearchFragmentDocument | null {
  let bestFragment: SearchFragmentDocument | null = null
  let bestScore = 0

  for (const fragment of fragments) {
    if (!searchTermGroupMatchesFragment(fragment, group)) {
      continue
    }

    const score = rankTermGroupAcrossFragmentFields(fragment, group)

    if (!bestFragment || score > bestScore) {
      bestFragment = fragment
      bestScore = score
    }
  }

  return bestFragment
}

function buildSessionCoverageReasons(
  fragments: SearchFragmentDocument[],
  groups: string[][][],
): SessionSearchMatch['reasons'] {
  const reasons: SessionSearchMatch['reasons'] = []

  for (const [index, fragment] of fragments.entries()) {
    const term = findMatchedReasonTerm(fragment, groups[index] ?? [])

    if (!term) {
      continue
    }

    const field = findFragmentReasonField(fragment, term)

    if (!field) {
      continue
    }

    reasons.push({
      field,
      messageId: fragment.messageId,
      role: fragment.role,
      snippet:
        field === 'content' && fragment.ftsSnippet
          ? normalizeFtsSnippet(fragment.ftsSnippet)
          : createSnippet(getFragmentFieldValue(fragment, field), term),
      sourceId: fragment.sourceId,
      sourceKind: fragment.sourceKind,
      toolCallId: fragment.toolCallId,
    })

    if (reasons.length >= 3) {
      break
    }
  }

  return reasons
}

function findMatchedReasonTerm(fragment: SearchFragmentDocument, group: string[][]): string | null {
  for (const variant of group) {
    for (const term of variant) {
      if (termMatchesAnyFragmentField(fragment, term)) {
        return term
      }
    }
  }

  return null
}

function findFragmentReasonField(
  fragment: SearchFragmentDocument,
  term: string,
): SessionSearchModifier | null {
  const fields: SessionSearchModifier[] = [
    'content',
    'path',
    'file',
    'command',
    'issue',
    'error',
    'model',
    'reasoning',
    'source',
    'kind',
    'tool',
    'status',
    'id',
    'title',
  ]

  return fields.find((field) => getFragmentFieldValue(fragment, field).includes(term)) ?? null
}

function buildSearchHits(matches: SessionSearchMatch[]): SessionSearchHit[] {
  const hits = matches
    .map((match) => {
      const reason = match.reasons[0] ?? {
        field: 'title' as const,
        snippet: '',
        sourceKind: 'session' as const,
      }

      return {
        id: [
          match.sessionId,
          reason.sourceKind ?? 'session',
          reason.sourceId ?? reason.messageId ?? reason.toolCallId ?? reason.field,
        ].join(':'),
        reason,
        score: match.score,
        sessionId: match.sessionId,
      }
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))

  return diversifySearchHits(hits)
}

function diversifySearchHits(hits: SessionSearchHit[]): SessionSearchHit[] {
  const groups = new Map<string, SessionSearchHit[]>()

  for (const hit of hits) {
    groups.set(hit.sessionId, [...(groups.get(hit.sessionId) ?? []), hit])
  }

  const sessionIds = [...groups.keys()].sort((left, right) => {
    const leftScore = groups.get(left)?.[0]?.score ?? 0
    const rightScore = groups.get(right)?.[0]?.score ?? 0

    return rightScore - leftScore || left.localeCompare(right)
  })
  const diversified: SessionSearchHit[] = []
  let hasMoreHits = true

  while (hasMoreHits) {
    hasMoreHits = false

    for (const sessionId of sessionIds) {
      const hit = groups.get(sessionId)?.shift()

      if (!hit) {
        continue
      }

      diversified.push(hit)
      hasMoreHits = true
    }
  }

  return diversified
}

function mergeSearchMatches(matches: SessionSearchMatch[]): SessionSearchMatch[] {
  const bySessionId = new Map<string, SessionSearchMatch>()

  for (const match of matches) {
    const existing = bySessionId.get(match.sessionId)

    if (!existing) {
      bySessionId.set(match.sessionId, {
        ...match,
        hitCount: 1,
        reasons: dedupeSearchReasons(match.reasons).slice(0, 3),
      })
      continue
    }

    existing.hitCount = (existing.hitCount ?? 1) + 1

    if (match.score > existing.score) {
      existing.score = match.score
      existing.reasons = dedupeSearchReasons([...match.reasons, ...existing.reasons]).slice(0, 3)
      continue
    }

    existing.reasons = dedupeSearchReasons(
      prioritizeSourceReasons([...existing.reasons, ...match.reasons]),
    ).slice(0, 3)
  }

  return [...bySessionId.values()]
}

function dedupeSearchReasons(
  reasons: SessionSearchMatch['reasons'],
): SessionSearchMatch['reasons'] {
  const seen = new Set<string>()
  const deduped: SessionSearchMatch['reasons'] = []

  for (const reason of reasons) {
    const key = [
      reason.field,
      reason.sourceKind ?? 'session',
      reason.sourceId ?? '',
      reason.messageId ?? '',
      reason.toolCallId ?? '',
      reason.snippet,
    ].join('\u0000')

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(reason)
  }

  return deduped
}

function prioritizeSourceReasons(
  reasons: SessionSearchMatch['reasons'],
): SessionSearchMatch['reasons'] {
  return [...reasons].sort(
    (left, right) => Number(Boolean(right.sourceKind)) - Number(Boolean(left.sourceKind)),
  )
}

function normalizeFtsSnippet(snippet: string): string {
  return snippet.replace(/\s+/gu, ' ').trim()
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

function limitIndexedRows<T>(rows: T[], limit: number | undefined): T[] {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return rows
  }

  return rows.slice(0, Math.max(0, Math.floor(limit)))
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
