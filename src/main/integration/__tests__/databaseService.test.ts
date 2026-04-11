import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

import { createDatabaseService } from '../database/service'

describe('createDatabaseService', () => {
  const cleanup: Array<() => void> = []

  afterEach(() => {
    while (cleanup.length > 0) {
      cleanup.pop()?.()
    }
  })

  it('creates a WAL-mode SQLite database with the foundation schema in userData', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-db-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: (databasePath) => {
        const sqlite = new DatabaseSync(databasePath)
        let open = true

        return {
          close: () => {
            open = false
            sqlite.close()
          },
          exec: (sql) => {
            sqlite.exec(sql)
          },
          get open() {
            return open
          },
          pragma: (statement, options) => {
            const row = sqlite.prepare(`PRAGMA ${statement}`).get() as
              | Record<string, unknown>
              | undefined

            if (options?.simple) {
              return row ? Object.values(row)[0] : undefined
            }

            return row
          },
          prepare: (sql) => {
            const statement = sqlite.prepare(sql)

            return {
              all: (...params: unknown[]) => statement.all(...params),
              get: (...params: unknown[]) => statement.get(...params),
              run: (...params: unknown[]) => statement.run(...params),
            }
          },
          transaction: <T extends (...args: unknown[]) => unknown>(callback: T): T =>
            ((...args: Parameters<T>) => {
              sqlite.exec('BEGIN')

              try {
                const result = callback(...args)
                sqlite.exec('COMMIT')
                return result
              } catch (error) {
                sqlite.exec('ROLLBACK')
                throw error
              }
            }) as T,
        }
      },
    })
    cleanup.push(() => database.close())

    const diagnostics = database.getDiagnostics()
    const syncMetadataColumns = database.getSyncMetadataColumns()

    expect(diagnostics.path).toBe(join(userDataPath, 'oxox.db'))
    expect(diagnostics.exists).toBe(true)
    expect(diagnostics.journalMode).toBe('wal')
    expect(diagnostics.tableNames).toEqual(
      expect.arrayContaining([
        'projects',
        'sessions',
        'sync_metadata',
        'session_runtime',
        'session_lineage',
      ]),
    )
    expect(syncMetadataColumns).toEqual(
      expect.arrayContaining(['source_path', 'session_id', 'last_byte_offset', 'last_mtime_ms']),
    )
  })

  it('re-invalidates stale artifact rows from schema version 3 so hasUserMessage is recomputed', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-db-'))
    const databasePath = join(userDataPath, 'oxox.db')
    const sqlite = new DatabaseSync(databasePath)

    sqlite.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        workspace_path TEXT NOT NULL UNIQUE,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE sessions (
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
      CREATE TABLE sync_metadata (
        source_path TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        last_byte_offset INTEGER NOT NULL DEFAULT 0,
        last_mtime_ms INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT
      );
      CREATE TABLE session_runtime (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        transport TEXT NOT NULL,
        status TEXT NOT NULL,
        process_id INTEGER,
        viewer_count INTEGER NOT NULL DEFAULT 0,
        last_event_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE session_lineage (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        relationship TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      PRAGMA user_version = 3;
    `)
    sqlite
      .prepare(
        `INSERT INTO sessions (
          id, project_id, model_id, has_user_message, title, status, transport, created_at, last_activity_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'session-legacy',
        null,
        null,
        1,
        'New Session',
        'idle',
        'artifacts',
        '2026-04-05T09:18:54.206Z',
        '2026-04-05T09:18:54.206Z',
        '2026-04-05T09:18:54.206Z',
      )
    sqlite
      .prepare(
        `INSERT INTO sync_metadata (
          source_path, session_id, last_byte_offset, last_mtime_ms, last_synced_at, checksum
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        '/Users/brojbean/.factory/sessions/session-legacy.jsonl',
        'session-legacy',
        123,
        456,
        '2026-04-05T09:18:54.206Z',
        '123:456',
      )
    sqlite.close()

    const database = createDatabaseService({
      userDataPath,
      databaseFactory: (nextDatabasePath) => {
        const migratedSqlite = new DatabaseSync(nextDatabasePath)
        let open = true

        return {
          close: () => {
            open = false
            migratedSqlite.close()
          },
          exec: (sql) => {
            migratedSqlite.exec(sql)
          },
          get open() {
            return open
          },
          pragma: (statement, options) => {
            const row = migratedSqlite.prepare(`PRAGMA ${statement}`).get() as
              | Record<string, unknown>
              | undefined

            if (options?.simple) {
              return row ? Object.values(row)[0] : undefined
            }

            return row
          },
          prepare: (sql) => {
            const statement = migratedSqlite.prepare(sql)

            return {
              all: (...params: unknown[]) => statement.all(...params),
              get: (...params: unknown[]) => statement.get(...params),
              run: (...params: unknown[]) => statement.run(...params),
            }
          },
          transaction: <T extends (...args: unknown[]) => unknown>(callback: T): T =>
            ((...args: Parameters<T>) => {
              migratedSqlite.exec('BEGIN')

              try {
                const result = callback(...args)
                migratedSqlite.exec('COMMIT')
                return result
              } catch (error) {
                migratedSqlite.exec('ROLLBACK')
                throw error
              }
            }) as T,
        }
      },
    })
    cleanup.push(() => database.close())

    expect(database.getSession('session-legacy')).toMatchObject({
      id: 'session-legacy',
      hasUserMessage: false,
    })
    expect(database.listSyncMetadata()).toEqual([
      expect.objectContaining({
        sessionId: 'session-legacy',
        lastByteOffset: -1,
      }),
    ])
  })

  it('overlays runtime state and keeps session lineage rows tied to valid parent sessions', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-db-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: (databasePath) => {
        const sqlite = new DatabaseSync(databasePath)
        let open = true

        return {
          close: () => {
            open = false
            sqlite.close()
          },
          exec: (sql) => {
            sqlite.exec(sql)
          },
          get open() {
            return open
          },
          pragma: (statement, options) => {
            const row = sqlite.prepare(`PRAGMA ${statement}`).get() as
              | Record<string, unknown>
              | undefined

            if (options?.simple) {
              return row ? Object.values(row)[0] : undefined
            }

            return row
          },
          prepare: (sql) => {
            const statement = sqlite.prepare(sql)

            return {
              all: (...params: unknown[]) => statement.all(...params),
              get: (...params: unknown[]) => statement.get(...params),
              run: (...params: unknown[]) => statement.run(...params),
            }
          },
          transaction: <T extends (...args: unknown[]) => unknown>(callback: T): T =>
            ((...args: Parameters<T>) => {
              sqlite.exec('BEGIN')

              try {
                const result = callback(...args)
                sqlite.exec('COMMIT')
                return result
              } catch (error) {
                sqlite.exec('ROLLBACK')
                throw error
              }
            }) as T,
        }
      },
    })
    cleanup.push(() => database.close())

    database.upsertSession({
      sessionId: 'session-parent',
      projectWorkspacePath: '/tmp/parent',
      title: 'Parent session',
      status: 'idle',
      transport: 'artifacts',
      createdAt: '2026-03-25T00:00:00.000Z',
      lastActivityAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    })
    database.upsertSession({
      sessionId: 'session-child',
      projectWorkspacePath: '/tmp/child',
      title: 'Child session',
      status: 'idle',
      transport: 'artifacts',
      createdAt: '2026-03-25T00:01:00.000Z',
      lastActivityAt: '2026-03-25T00:01:00.000Z',
      updatedAt: '2026-03-25T00:01:00.000Z',
    })
    database.linkSessionParent(
      'session-child',
      'session-parent',
      'fork',
      '2026-03-25T00:01:05.000Z',
    )
    database.upsertSessionRuntime({
      sessionId: 'session-child',
      transport: 'stream-jsonrpc',
      status: 'active',
      processId: 4242,
      viewerCount: 1,
      lastEventAt: '2026-03-25T00:02:00.000Z',
      updatedAt: '2026-03-25T00:02:00.000Z',
    })

    expect(database.getSession('session-child')).toMatchObject({
      id: 'session-child',
      status: 'active',
      transport: 'stream-jsonrpc',
      projectWorkspacePath: '/tmp/child',
      lastActivityAt: '2026-03-25T00:02:00.000Z',
    })

    database.clearSessionRuntime('session-child')

    expect(database.getSession('session-child')).toMatchObject({
      id: 'session-child',
      status: 'idle',
      transport: 'artifacts',
      projectWorkspacePath: '/tmp/child',
    })
  })

  it('prefers the freshest persisted last-activity over an older runtime event timestamp', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-db-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: (databasePath) => {
        const sqlite = new DatabaseSync(databasePath)
        let open = true

        return {
          close: () => {
            open = false
            sqlite.close()
          },
          exec: (sql) => {
            sqlite.exec(sql)
          },
          get open() {
            return open
          },
          pragma: (statement, options) => {
            const row = sqlite.prepare(`PRAGMA ${statement}`).get() as
              | Record<string, unknown>
              | undefined

            if (options?.simple) {
              return row ? Object.values(row)[0] : undefined
            }

            return row
          },
          prepare: (sql) => {
            const statement = sqlite.prepare(sql)

            return {
              all: (...params: unknown[]) => statement.all(...params),
              get: (...params: unknown[]) => statement.get(...params),
              run: (...params: unknown[]) => statement.run(...params),
            }
          },
          transaction: <T extends (...args: unknown[]) => unknown>(callback: T): T =>
            ((...args: Parameters<T>) => {
              sqlite.exec('BEGIN')

              try {
                const result = callback(...args)
                sqlite.exec('COMMIT')
                return result
              } catch (error) {
                sqlite.exec('ROLLBACK')
                throw error
              }
            }) as T,
        }
      },
    })
    cleanup.push(() => database.close())

    database.upsertSession({
      sessionId: 'session-stale-runtime',
      projectWorkspacePath: '/tmp/stale-runtime',
      title: 'Stale runtime timestamp',
      status: 'idle',
      transport: 'artifacts',
      createdAt: '2026-04-06T20:00:00.000Z',
      lastActivityAt: '2026-04-06T23:00:00.000Z',
      updatedAt: '2026-04-06T23:00:00.000Z',
    })
    database.upsertSessionRuntime({
      sessionId: 'session-stale-runtime',
      transport: 'stream-jsonrpc',
      status: 'orphaned',
      processId: null,
      viewerCount: 0,
      lastEventAt: '2026-04-06T07:00:00.000Z',
      updatedAt: '2026-04-07T15:00:00.000Z',
    })

    expect(database.getSession('session-stale-runtime')).toMatchObject({
      id: 'session-stale-runtime',
      lastActivityAt: '2026-04-06T23:00:00.000Z',
    })
  })

  it('keeps sidebar reads available while a writer holds an uncommitted transaction in WAL mode', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-db-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: (databasePath) => {
        const sqlite = new DatabaseSync(databasePath)
        let open = true

        return {
          close: () => {
            open = false
            sqlite.close()
          },
          exec: (sql) => {
            sqlite.exec(sql)
          },
          get open() {
            return open
          },
          pragma: (statement, options) => {
            const row = sqlite.prepare(`PRAGMA ${statement}`).get() as
              | Record<string, unknown>
              | undefined

            if (options?.simple) {
              return row ? Object.values(row)[0] : undefined
            }

            return row
          },
          prepare: (sql) => {
            const statement = sqlite.prepare(sql)

            return {
              all: (...params: unknown[]) => statement.all(...params),
              get: (...params: unknown[]) => statement.get(...params),
              run: (...params: unknown[]) => statement.run(...params),
            }
          },
          transaction: <T extends (...args: unknown[]) => unknown>(callback: T): T =>
            ((...args: Parameters<T>) => {
              sqlite.exec('BEGIN')

              try {
                const result = callback(...args)
                sqlite.exec('COMMIT')
                return result
              } catch (error) {
                sqlite.exec('ROLLBACK')
                throw error
              }
            }) as T,
        }
      },
    })
    cleanup.push(() => database.close())

    database.upsertSession({
      sessionId: 'session-sidebar',
      projectWorkspacePath: '/tmp/sidebar',
      title: 'Sidebar session',
      status: 'idle',
      transport: 'artifacts',
      createdAt: '2026-03-25T00:00:00.000Z',
      lastActivityAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    })

    const writer = new DatabaseSync(database.getDiagnostics().path)
    const reader = new DatabaseSync(database.getDiagnostics().path)
    cleanup.push(() => writer.close())
    cleanup.push(() => reader.close())

    writer.exec('PRAGMA journal_mode = WAL')
    reader.exec('PRAGMA journal_mode = WAL')
    writer.exec('BEGIN IMMEDIATE')
    writer
      .prepare(
        `
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
        `,
      )
      .run(
        'session-sidebar',
        'stream-jsonrpc',
        'active',
        101,
        1,
        '2026-03-25T00:01:00.000Z',
        '2026-03-25T00:01:00.000Z',
      )

    const startedAt = Date.now()
    const row = reader
      .prepare(
        `
          SELECT sessions.id
          FROM sessions
          LEFT JOIN session_runtime ON session_runtime.session_id = sessions.id
          WHERE sessions.id = ?
        `,
      )
      .get('session-sidebar') as { id: string } | undefined
    const durationMs = Date.now() - startedAt

    expect(row).toEqual({ id: 'session-sidebar' })
    expect(durationMs).toBeLessThan(100)

    writer.exec('ROLLBACK')
  })
})
