import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import type {
  DatabaseDiagnostics,
  ProjectRecord,
  SessionRecord,
  SyncMetadataRecord,
} from '../../../shared/ipc/contracts'

const FOUNDATION_SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    workspace_path TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    model_id TEXT,
    has_user_message INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    transport TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sync_metadata (
    source_path TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    last_byte_offset INTEGER NOT NULL DEFAULT 0,
    last_mtime_ms INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum TEXT
  );

  CREATE TABLE IF NOT EXISTS session_runtime (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    transport TEXT NOT NULL,
    status TEXT NOT NULL,
    process_id INTEGER,
    viewer_count INTEGER NOT NULL DEFAULT 0,
    last_event_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS session_lineage (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    relationship TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS session_rewind_boundaries (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    rewind_boundary_message_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, message_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_last_activity_at ON sessions(last_activity_at);
  CREATE INDEX IF NOT EXISTS idx_sync_metadata_session_id ON sync_metadata(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_runtime_status ON session_runtime(status);
  CREATE INDEX IF NOT EXISTS idx_session_lineage_parent_session_id ON session_lineage(parent_session_id);
  CREATE INDEX IF NOT EXISTS idx_session_rewind_boundaries_session_id ON session_rewind_boundaries(session_id);
`

const CURRENT_SCHEMA_VERSION = 5

const require = createRequire(import.meta.url)

export interface StatementLike<TResult> {
  all: (...params: unknown[]) => TResult[]
  get: (...params: unknown[]) => TResult | undefined
  run: (...params: unknown[]) => unknown
}

export interface DatabaseConnection {
  close: () => void
  exec: (sql: string) => void
  pragma: (statement: string, options?: { simple?: boolean }) => unknown
  prepare: <TResult>(sql: string) => StatementLike<TResult>
  transaction: <T extends (...args: unknown[]) => unknown>(callback: T) => T
  readonly open: boolean
}

export type DatabaseFactory = (databasePath: string) => DatabaseConnection

export interface ArtifactSessionUpsert {
  sessionId: string
  sourcePath: string
  projectWorkspacePath: string | null
  modelId?: string | null
  hasUserMessage?: boolean
  title: string
  status: string
  transport: string
  createdAt: string
  lastActivityAt: string | null
  updatedAt: string
  lastByteOffset: number
  lastMtimeMs: number
  checksum: string | null
}

export interface SessionUpsert {
  sessionId: string
  projectWorkspacePath: string | null
  modelId?: string | null
  hasUserMessage?: boolean
  title: string
  status: string
  transport: string | null
  createdAt: string
  lastActivityAt: string | null
  updatedAt: string
}

export interface SessionRuntimeUpsert {
  sessionId: string
  transport: string
  status: string
  processId: number | null
  viewerCount: number
  lastEventAt: string | null
  updatedAt: string
}

export interface SessionRuntimeRecord {
  sessionId: string
  transport: string
  status: string
  processId: number | null
  viewerCount: number
  lastEventAt: string | null
  updatedAt: string
}

export interface SessionRewindBoundaryUpsert {
  sessionId: string
  messageId: string
  rewindBoundaryMessageId: string
  updatedAt: string
}

export interface SessionRewindBoundaryRecord {
  sessionId: string
  messageId: string
  rewindBoundaryMessageId: string
  updatedAt: string
}

export interface DatabaseService {
  close: () => void
  getDiagnostics: () => DatabaseDiagnostics
  getSyncMetadataColumns: () => string[]
  getSession: (sessionId: string) => SessionRecord | null
  listProjects: () => ProjectRecord[]
  listPersistedSessions: () => SessionRecord[]
  listSessionRuntimes: () => SessionRuntimeRecord[]
  listSessionRewindBoundaries: (sessionId: string) => SessionRewindBoundaryRecord[]
  listSessions: () => SessionRecord[]
  listSyncMetadata: () => SyncMetadataRecord[]
  linkSessionParent: (
    sessionId: string,
    parentSessionId: string | null,
    relationship: string,
    createdAt: string,
  ) => void
  listSessionLineageIds: () => string[]
  clearSessionRuntime: (sessionId: string) => void
  upsertSessionRewindBoundary: (boundary: SessionRewindBoundaryUpsert) => void
  upsertSession: (session: SessionUpsert) => void
  upsertSessionRuntime: (runtime: SessionRuntimeUpsert) => void
  upsertArtifactSession: (session: ArtifactSessionUpsert) => void
  removeSessionsBySourcePaths: (sourcePaths: string[]) => void
  removeSyncMetadataBySourcePaths: (sourcePaths: string[]) => void
}

export interface CreateDatabaseServiceOptions {
  userDataPath: string
  databaseFactory?: DatabaseFactory
}

type TableNameRow = {
  name: string
}

type TableInfoRow = {
  name: string
}

type ProjectMutationInput = {
  id: string
  workspacePath: string
  updatedAt: string
}

function defaultDatabaseFactory(databasePath: string): DatabaseConnection {
  const BetterSqlite3 = require('better-sqlite3')
  const database = new BetterSqlite3(databasePath)

  return {
    close: () => {
      database.close()
    },
    exec: (sql) => {
      database.exec(sql)
    },
    get open() {
      return database.open
    },
    pragma: (statement, options) => database.pragma(statement, options),
    prepare: (sql) => database.prepare(sql),
    transaction: (callback) => database.transaction(callback),
  }
}

function createProjectId(workspacePath: string): string {
  return createHash('sha1').update(workspacePath).digest('hex')
}

export function createDatabaseService({
  userDataPath,
  databaseFactory = defaultDatabaseFactory,
}: CreateDatabaseServiceOptions): DatabaseService {
  mkdirSync(userDataPath, { recursive: true })

  const databasePath = join(userDataPath, 'oxox.db')
  const database = databaseFactory(databasePath)

  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  database.exec(FOUNDATION_SCHEMA)
  ensureColumn(database, 'sessions', 'model_id', 'TEXT')
  ensureColumn(database, 'sessions', 'has_user_message', 'INTEGER NOT NULL DEFAULT 1')
  runSchemaMigrations(database)

  const projectStatement = database.prepare<ProjectRecord>(`
    SELECT
      id,
      workspace_path AS workspacePath,
      display_name AS displayName,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM projects
    ORDER BY COALESCE(display_name, workspace_path) COLLATE NOCASE ASC
  `)

  const persistedSessionStatement = database.prepare<SessionRecord>(`
    SELECT
      sessions.id,
      sessions.project_id AS projectId,
      projects.workspace_path AS projectWorkspacePath,
      projects.display_name AS projectDisplayName,
      sessions.model_id AS modelId,
      sessions.has_user_message AS hasUserMessage,
      sessions.title,
      sessions.status,
      sessions.transport,
      sessions.created_at AS createdAt,
      sessions.last_activity_at AS lastActivityAt,
      sessions.updated_at AS updatedAt
    FROM sessions
    LEFT JOIN projects ON projects.id = sessions.project_id
    ORDER BY
      COALESCE(sessions.last_activity_at, sessions.updated_at, sessions.created_at) DESC,
      sessions.id ASC
  `)

  const sessionStatement = database.prepare<SessionRecord>(`
    SELECT
      sessions.id,
      sessions.project_id AS projectId,
      projects.workspace_path AS projectWorkspacePath,
      projects.display_name AS projectDisplayName,
      sessions.model_id AS modelId,
      session_lineage.parent_session_id AS parentSessionId,
      session_lineage.relationship AS derivationType,
      sessions.has_user_message AS hasUserMessage,
      sessions.title,
      COALESCE(session_runtime.status, sessions.status) AS status,
      COALESCE(session_runtime.transport, sessions.transport) AS transport,
      sessions.created_at AS createdAt,
      MAX(
        COALESCE(session_runtime.last_event_at, ''),
        COALESCE(sessions.last_activity_at, ''),
        COALESCE(sessions.updated_at, ''),
        sessions.created_at
      ) AS lastActivityAt,
      COALESCE(session_runtime.updated_at, sessions.updated_at) AS updatedAt
    FROM sessions
    LEFT JOIN projects ON projects.id = sessions.project_id
    LEFT JOIN session_runtime ON session_runtime.session_id = sessions.id
    LEFT JOIN session_lineage ON session_lineage.session_id = sessions.id
    ORDER BY
      MAX(
        COALESCE(session_runtime.last_event_at, ''),
        COALESCE(sessions.last_activity_at, ''),
        COALESCE(sessions.updated_at, ''),
        sessions.created_at
      ) DESC,
      sessions.id ASC
  `)

  const sessionByIdStatement = database.prepare<SessionRecord>(`
    SELECT
      sessions.id,
      sessions.project_id AS projectId,
      projects.workspace_path AS projectWorkspacePath,
      projects.display_name AS projectDisplayName,
      sessions.model_id AS modelId,
      session_lineage.parent_session_id AS parentSessionId,
      session_lineage.relationship AS derivationType,
      sessions.has_user_message AS hasUserMessage,
      sessions.title,
      COALESCE(session_runtime.status, sessions.status) AS status,
      COALESCE(session_runtime.transport, sessions.transport) AS transport,
      sessions.created_at AS createdAt,
      MAX(
        COALESCE(session_runtime.last_event_at, ''),
        COALESCE(sessions.last_activity_at, ''),
        COALESCE(sessions.updated_at, ''),
        sessions.created_at
      ) AS lastActivityAt,
      COALESCE(session_runtime.updated_at, sessions.updated_at) AS updatedAt
    FROM sessions
    LEFT JOIN projects ON projects.id = sessions.project_id
    LEFT JOIN session_runtime ON session_runtime.session_id = sessions.id
    LEFT JOIN session_lineage ON session_lineage.session_id = sessions.id
    WHERE sessions.id = ?
  `)

  const syncMetadataStatement = database.prepare<SyncMetadataRecord>(`
    SELECT
      source_path AS sourcePath,
      session_id AS sessionId,
      last_byte_offset AS lastByteOffset,
      last_mtime_ms AS lastMtimeMs,
      last_synced_at AS lastSyncedAt,
      checksum
    FROM sync_metadata
    ORDER BY source_path ASC
  `)

  const sessionRuntimeStatement = database.prepare<SessionRuntimeRecord>(`
    SELECT
      session_id AS sessionId,
      transport,
      status,
      process_id AS processId,
      viewer_count AS viewerCount,
      last_event_at AS lastEventAt,
      updated_at AS updatedAt
    FROM session_runtime
    ORDER BY updated_at DESC, session_id ASC
  `)

  const sessionRewindBoundaryStatement = database.prepare<SessionRewindBoundaryRecord>(`
    SELECT
      session_id AS sessionId,
      message_id AS messageId,
      rewind_boundary_message_id AS rewindBoundaryMessageId,
      updated_at AS updatedAt
    FROM session_rewind_boundaries
    WHERE session_id = ?
    ORDER BY updated_at ASC, message_id ASC
  `)

  const tableNamesStatement = database.prepare<TableNameRow>(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC
  `)

  const syncMetadataColumnsStatement = database.prepare<TableInfoRow>(`
    SELECT name
    FROM pragma_table_info('sync_metadata')
    ORDER BY cid ASC
  `)

  const insertProjectStatement = database.prepare(`
    INSERT INTO projects (id, workspace_path, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_path) DO UPDATE SET
      updated_at = excluded.updated_at
  `)

  const upsertSessionStatement = database.prepare(`
    INSERT INTO sessions (
      id,
      project_id,
      model_id,
      has_user_message,
      title,
      status,
      transport,
      created_at,
      last_activity_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      model_id = excluded.model_id,
      has_user_message = excluded.has_user_message,
      title = excluded.title,
      status = excluded.status,
      transport = excluded.transport,
      created_at = excluded.created_at,
      last_activity_at = excluded.last_activity_at,
      updated_at = excluded.updated_at
  `)

  const upsertSyncMetadataStatement = database.prepare(`
    INSERT INTO sync_metadata (
      source_path,
      session_id,
      last_byte_offset,
      last_mtime_ms,
      last_synced_at,
      checksum
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_path) DO UPDATE SET
      session_id = excluded.session_id,
      last_byte_offset = excluded.last_byte_offset,
      last_mtime_ms = excluded.last_mtime_ms,
      last_synced_at = excluded.last_synced_at,
      checksum = excluded.checksum
  `)

  const deleteSessionBySourcePathStatement = database.prepare(`
    DELETE FROM sessions
    WHERE id IN (
      SELECT session_id
      FROM sync_metadata
      WHERE source_path = ?
    )
  `)

  const deleteSyncMetadataBySourcePathStatement = database.prepare(`
    DELETE FROM sync_metadata
    WHERE source_path = ?
  `)

  const upsertSessionRuntimeStatement = database.prepare(`
    INSERT INTO session_runtime (
      session_id,
      transport,
      status,
      process_id,
      viewer_count,
      last_event_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      transport = excluded.transport,
      status = excluded.status,
      process_id = excluded.process_id,
      viewer_count = excluded.viewer_count,
      last_event_at = excluded.last_event_at,
      updated_at = excluded.updated_at
  `)

  const deleteSessionRuntimeStatement = database.prepare(`
    DELETE FROM session_runtime
    WHERE session_id = ?
  `)

  const upsertSessionLineageStatement = database.prepare(`
    INSERT INTO session_lineage (
      session_id,
      parent_session_id,
      relationship,
      created_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id) DO NOTHING
  `)

  const upsertSessionRewindBoundaryStatement = database.prepare(`
    INSERT INTO session_rewind_boundaries (
      session_id,
      message_id,
      rewind_boundary_message_id,
      updated_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id, message_id) DO UPDATE SET
      rewind_boundary_message_id = excluded.rewind_boundary_message_id,
      updated_at = excluded.updated_at
  `)

  const persistSessionRow = (session: SessionUpsert): void => {
    if (session.projectWorkspacePath) {
      const project: ProjectMutationInput = {
        id: createProjectId(session.projectWorkspacePath),
        workspacePath: session.projectWorkspacePath,
        updatedAt: session.updatedAt,
      }

      insertProjectStatement.run(
        project.id,
        project.workspacePath,
        session.createdAt,
        project.updatedAt,
      )
    }

    upsertSessionStatement.run(
      session.sessionId,
      session.projectWorkspacePath ? createProjectId(session.projectWorkspacePath) : null,
      session.modelId ?? null,
      (session.hasUserMessage ?? true) ? 1 : 0,
      session.title,
      session.status,
      session.transport,
      session.createdAt,
      session.lastActivityAt,
      session.updatedAt,
    )
  }

  const upsertSessionTransaction = database.transaction((session: SessionUpsert) => {
    persistSessionRow(session)
  })

  const upsertArtifactSessionTransaction = database.transaction(
    (session: ArtifactSessionUpsert) => {
      persistSessionRow({
        sessionId: session.sessionId,
        projectWorkspacePath: session.projectWorkspacePath,
        modelId: session.modelId ?? null,
        hasUserMessage: session.hasUserMessage ?? true,
        title: session.title,
        status: session.status,
        transport: session.transport,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        updatedAt: session.updatedAt,
      })

      upsertSyncMetadataStatement.run(
        session.sourcePath,
        session.sessionId,
        session.lastByteOffset,
        session.lastMtimeMs,
        session.updatedAt,
        session.checksum,
      )
    },
  )

  const removeSessionsBySourcePathsTransaction = database.transaction((sourcePaths: string[]) => {
    for (const sourcePath of sourcePaths) {
      deleteSessionBySourcePathStatement.run(sourcePath)
    }
  })

  const removeSyncMetadataBySourcePathsTransaction = database.transaction(
    (sourcePaths: string[]) => {
      for (const sourcePath of sourcePaths) {
        deleteSyncMetadataBySourcePathStatement.run(sourcePath)
      }
    },
  )

  return {
    close: () => {
      if (database.open) {
        database.close()
      }
    },
    getDiagnostics: () => ({
      path: databasePath,
      exists: existsSync(databasePath),
      journalMode: String(database.pragma('journal_mode', { simple: true })).toLowerCase(),
      tableNames: tableNamesStatement.all().map((row) => row.name),
    }),
    getSyncMetadataColumns: () => syncMetadataColumnsStatement.all().map((row) => row.name),
    getSession: (sessionId) => {
      const row = sessionByIdStatement.get(sessionId)
      return row ? normalizeSessionRecord(row) : null
    },
    listProjects: () => projectStatement.all(),
    listPersistedSessions: () => persistedSessionStatement.all().map(normalizeSessionRecord),
    listSessionRuntimes: () => sessionRuntimeStatement.all(),
    listSessionRewindBoundaries: (sessionId) => sessionRewindBoundaryStatement.all(sessionId),
    listSessions: () => sessionStatement.all().map(normalizeSessionRecord),
    listSyncMetadata: () => syncMetadataStatement.all(),
    linkSessionParent: (sessionId, parentSessionId, relationship, createdAt) => {
      upsertSessionLineageStatement.run(sessionId, parentSessionId, relationship, createdAt)
    },
    listSessionLineageIds: () => {
      return database
        .prepare<{ session_id: string }>('SELECT session_id FROM session_lineage')
        .all()
        .map((row) => row.session_id)
    },
    clearSessionRuntime: (sessionId) => {
      deleteSessionRuntimeStatement.run(sessionId)
    },
    upsertSessionRewindBoundary: (boundary) => {
      upsertSessionRewindBoundaryStatement.run(
        boundary.sessionId,
        boundary.messageId,
        boundary.rewindBoundaryMessageId,
        boundary.updatedAt,
      )
    },
    upsertSession: (session) => {
      upsertSessionTransaction(session)
    },
    upsertSessionRuntime: (runtime) => {
      upsertSessionRuntimeStatement.run(
        runtime.sessionId,
        runtime.transport,
        runtime.status,
        runtime.processId,
        runtime.viewerCount,
        runtime.lastEventAt,
        runtime.updatedAt,
      )
    },
    upsertArtifactSession: (session) => {
      upsertArtifactSessionTransaction(session)
    },
    removeSessionsBySourcePaths: (sourcePaths) => {
      if (sourcePaths.length === 0) {
        return
      }

      removeSessionsBySourcePathsTransaction(sourcePaths)
    },
    removeSyncMetadataBySourcePaths: (sourcePaths) => {
      if (sourcePaths.length === 0) {
        return
      }

      removeSyncMetadataBySourcePathsTransaction(sourcePaths)
    },
  }
}

function normalizeSessionRecord(session: SessionRecord): SessionRecord {
  return {
    ...session,
    hasUserMessage:
      session.hasUserMessage === undefined || session.hasUserMessage === null
        ? true
        : Boolean(session.hasUserMessage),
  }
}

function runSchemaMigrations(database: DatabaseConnection): void {
  const currentVersion = Number(database.pragma('user_version', { simple: true }) ?? 0)

  if (currentVersion < 4) {
    database.exec(`
      UPDATE sessions
      SET has_user_message = CASE
        WHEN transport = 'artifacts' THEN 0
        ELSE COALESCE(has_user_message, 1)
      END;
      UPDATE sync_metadata
      SET last_byte_offset = -1
      WHERE session_id IN (
        SELECT id
        FROM sessions
        WHERE transport = 'artifacts'
      );
      PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};
    `)
    return
  }

  if (currentVersion < CURRENT_SCHEMA_VERSION) {
    database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`)
  }
}

function ensureColumn(
  database: DatabaseConnection,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): void {
  const columnInfoStatement = database.prepare<TableInfoRow>(`
    SELECT name
    FROM pragma_table_info('${tableName}')
    ORDER BY cid ASC
  `)
  const hasColumn = columnInfoStatement.all().some((column) => column.name === columnName)

  if (!hasColumn) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
  }
}
