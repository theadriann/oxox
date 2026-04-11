import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createArtifactScanner } from '../artifacts/scanner'
import { createDatabaseService } from '../database/service'

function createNodeSqliteDatabaseFactory() {
  return (databasePath: string) => {
    const sqlite = new DatabaseSync(databasePath)
    let open = true

    return {
      close: () => {
        open = false
        sqlite.close()
      },
      exec: (sql: string) => {
        sqlite.exec(sql)
      },
      get open() {
        return open
      },
      pragma: (statement: string, options?: { simple?: boolean }) => {
        const row = sqlite.prepare(`PRAGMA ${statement}`).get() as
          | Record<string, unknown>
          | undefined

        if (options?.simple) {
          return row ? Object.values(row)[0] : undefined
        }

        return row
      },
      prepare: (sql: string) => {
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
  }
}

function writeSessionArtifact(options: {
  sessionsRoot: string
  bucket: string
  sessionId: string
  transcriptLines: string[]
  settings?: Record<string, unknown>
}) {
  const bucketPath = join(options.sessionsRoot, options.bucket)
  mkdirSync(bucketPath, { recursive: true })

  const transcriptPath = join(bucketPath, `${options.sessionId}.jsonl`)
  writeFileSync(transcriptPath, `${options.transcriptLines.join('\n')}\n`)

  if (options.settings) {
    writeFileSync(
      join(bucketPath, `${options.sessionId}.settings.json`),
      `${JSON.stringify(options.settings, null, 2)}\n`,
    )
  }

  return { bucketPath, transcriptPath }
}

describe('artifact scanner', () => {
  const cleanup: Array<() => void> = []

  afterEach(() => {
    while (cleanup.length > 0) {
      cleanup.pop()?.()
    }
  })

  it('indexes readable session artifacts into SQLite and tracks file offsets + mtimes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-artifacts-'))
    const sessionsRoot = join(root, 'sessions')
    const userDataPath = join(root, 'user-data')
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    writeSessionArtifact({
      sessionsRoot,
      bucket: '-sample-project',
      sessionId: '11111111-1111-4111-8111-111111111111',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-03-24T23:40:00.000Z',
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Artifact indexed session',
          cwd: '/tmp/sample-project',
        }),
        JSON.stringify({
          type: 'message',
          timestamp: '2026-03-24T23:41:00.000Z',
          message: { role: 'user', content: 'hello' },
        }),
        JSON.stringify({
          type: 'session_end',
          timestamp: '2026-03-24T23:42:00.000Z',
        }),
      ],
      settings: {
        cwd: '/tmp/sample-project',
        model: 'gpt-5.4',
      },
    })

    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createNodeSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const scanner = createArtifactScanner({
      database,
      sessionsRoot,
    })

    const report = await scanner.sync()
    const [project] = database.listProjects()
    const [session] = database.listSessions()
    const [syncMetadata] = database.listSyncMetadata()

    expect(report.processedCount).toBe(1)
    expect(report.skippedCount).toBe(0)
    expect(report.deletedCount).toBe(0)
    expect(report.unreadableCount).toBe(0)
    expect(project?.workspacePath).toBe('/tmp/sample-project')
    expect(session).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      projectWorkspacePath: '/tmp/sample-project',
      modelId: 'gpt-5.4',
      title: 'Artifact indexed session',
      status: 'completed',
      transport: 'artifacts',
      createdAt: '2026-03-24T23:40:00.000Z',
      lastActivityAt: '2026-03-24T23:42:00.000Z',
      hasUserMessage: true,
    })
    expect(syncMetadata?.lastByteOffset).toBeGreaterThan(0)
    expect(syncMetadata?.lastMtimeMs).toBeGreaterThan(0)
  })

  it('prefers the explicit session title from artifacts over the first prompt text', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-artifacts-'))
    const sessionsRoot = join(root, 'sessions')
    const userDataPath = join(root, 'user-data')
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    writeSessionArtifact({
      sessionsRoot,
      bucket: '-explicit-title',
      sessionId: '12121212-1212-4212-8212-121212121212',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-04-03T00:40:00.000Z',
          id: '12121212-1212-4212-8212-121212121212',
          title: 'Can you find the latest changes on the apartment project?',
          sessionTitle: 'Find Latest Apartment Project Changes',
          cwd: '/tmp/explicit-title',
        }),
      ],
    })

    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createNodeSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const scanner = createArtifactScanner({
      database,
      sessionsRoot,
    })

    await expect(scanner.sync()).resolves.toMatchObject({
      processedCount: 1,
      unreadableCount: 0,
    })
    expect(database.getSession('12121212-1212-4212-8212-121212121212')).toMatchObject({
      title: 'Find Latest Apartment Project Changes',
    })
  })

  it('only processes new or modified files on incremental rescans', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-artifacts-'))
    const sessionsRoot = join(root, 'sessions')
    const userDataPath = join(root, 'user-data')
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    writeSessionArtifact({
      sessionsRoot,
      bucket: '-project-one',
      sessionId: '11111111-1111-4111-8111-111111111111',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-03-24T23:45:00.000Z',
          id: '11111111-1111-4111-8111-111111111111',
          title: 'First session',
          cwd: '/tmp/project-one',
        }),
      ],
    })

    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createNodeSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const scanner = createArtifactScanner({
      database,
      sessionsRoot,
    })

    const initialReport = await scanner.sync()
    const unchangedReport = await scanner.sync()

    writeSessionArtifact({
      sessionsRoot,
      bucket: '-project-two',
      sessionId: '22222222-2222-4222-8222-222222222222',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-03-24T23:46:00.000Z',
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Second session',
          cwd: '/tmp/project-two',
        }),
      ],
    })

    const deltaReport = await scanner.sync()

    expect(initialReport.processedCount).toBe(1)
    expect(unchangedReport.processedCount).toBe(0)
    expect(unchangedReport.skippedCount).toBe(1)
    expect(deltaReport.processedCount).toBe(1)
    expect(deltaReport.skippedCount).toBe(1)
    expect(database.listSessions().map((session) => session.id)).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    ])
  })

  it('recomputes hasUserMessage when a legacy rescan invalidates offsets with -1', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-artifacts-'))
    const sessionsRoot = join(root, 'sessions')
    const userDataPath = join(root, 'user-data')
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    const artifact = writeSessionArtifact({
      sessionsRoot,
      bucket: '-project-one',
      sessionId: 'aaaaaaaa-1111-4111-8111-111111111111',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-03-24T23:45:00.000Z',
          id: 'aaaaaaaa-1111-4111-8111-111111111111',
          title: 'Legacy rescan session',
          cwd: '/tmp/project-one',
        }),
        JSON.stringify({
          type: 'message',
          timestamp: '2026-03-24T23:46:00.000Z',
          message: { role: 'user', content: 'hello' },
        }),
      ],
    })

    const stat = statSync(artifact.transcriptPath)
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createNodeSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    database.upsertArtifactSession({
      sessionId: 'aaaaaaaa-1111-4111-8111-111111111111',
      sourcePath: artifact.transcriptPath,
      projectWorkspacePath: '/tmp/project-one',
      title: 'Legacy rescan session',
      status: 'idle',
      transport: 'artifacts',
      createdAt: '2026-03-24T23:45:00.000Z',
      lastActivityAt: '2026-03-24T23:45:00.000Z',
      updatedAt: '2026-03-24T23:45:00.000Z',
      hasUserMessage: false,
      lastByteOffset: -1,
      lastMtimeMs: stat.mtimeMs,
      checksum: `${stat.size}:${Math.floor(stat.mtimeMs)}`,
    })

    const scanner = createArtifactScanner({
      database,
      sessionsRoot,
    })

    await expect(scanner.sync()).resolves.toMatchObject({
      processedCount: 1,
      unreadableCount: 0,
    })
    expect(database.getSession('aaaaaaaa-1111-4111-8111-111111111111')).toMatchObject({
      hasUserMessage: true,
      lastActivityAt: '2026-03-24T23:46:00.000Z',
    })
  })

  it('degrades corrupted artifacts to an unreadable session without blocking valid indexing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-artifacts-'))
    const sessionsRoot = join(root, 'sessions')
    const userDataPath = join(root, 'user-data')
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    writeSessionArtifact({
      sessionsRoot,
      bucket: '-valid',
      sessionId: '11111111-1111-4111-8111-111111111111',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-03-24T23:50:00.000Z',
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Valid session',
          cwd: '/tmp/valid',
        }),
      ],
    })

    const corrupted = writeSessionArtifact({
      sessionsRoot,
      bucket: '-broken',
      sessionId: '33333333-3333-4333-8333-333333333333',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-03-24T23:51:00.000Z',
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Broken session',
          cwd: '/tmp/broken',
        }),
        '{"type":"message","timestamp":"2026-03-24T23:52:00.000Z"',
      ],
    })

    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createNodeSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const logger = vi.spyOn(console, 'error').mockImplementation(() => {})
    cleanup.push(() => logger.mockRestore())

    const scanner = createArtifactScanner({
      database,
      sessionsRoot,
    })

    const report = await scanner.sync()
    const sessions = database.listSessions()

    expect(report.processedCount).toBe(2)
    expect(report.unreadableCount).toBe(1)
    expect(sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Valid session',
        }),
        expect.objectContaining({
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Unreadable session',
          status: 'disconnected',
        }),
      ]),
    )
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('Failed to index session artifact'),
      expect.objectContaining({
        sessionId: '33333333-3333-4333-8333-333333333333',
        sourcePath: corrupted.transcriptPath,
      }),
    )
  })

  it('ignores an incomplete trailing JSON line during append-only rescans', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-artifacts-'))
    const sessionsRoot = join(root, 'sessions')
    const userDataPath = join(root, 'user-data')
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    const artifact = writeSessionArtifact({
      sessionsRoot,
      bucket: '-partial',
      sessionId: '55555555-5555-4555-8555-555555555555',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-03-24T23:58:00.000Z',
          id: '55555555-5555-4555-8555-555555555555',
          title: 'Partial append session',
          cwd: '/tmp/partial',
        }),
      ],
    })

    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createNodeSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const scanner = createArtifactScanner({
      database,
      sessionsRoot,
    })

    await expect(scanner.sync()).resolves.toMatchObject({
      processedCount: 1,
      unreadableCount: 0,
    })

    appendFileSync(
      artifact.transcriptPath,
      '\n{"type":"message","timestamp":"2026-03-24T23:59:00.000Z","message":{"role":"user","content":"',
      'utf8',
    )

    const report = await scanner.sync()

    expect(report).toMatchObject({
      processedCount: 1,
      unreadableCount: 0,
    })
    expect(database.getSession('55555555-5555-4555-8555-555555555555')).toMatchObject({
      title: 'Partial append session',
      status: 'idle',
    })
  })

  it('reconciles a previously partial appended line once the record is completed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-artifacts-'))
    const sessionsRoot = join(root, 'sessions')
    const userDataPath = join(root, 'user-data')
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    const artifact = writeSessionArtifact({
      sessionsRoot,
      bucket: '-reconcile',
      sessionId: '66666666-6666-4666-8666-666666666666',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-04-03T00:30:00.000Z',
          id: '66666666-6666-4666-8666-666666666666',
          title: 'Reconcile partial session',
          cwd: '/tmp/reconcile',
        }),
      ],
    })

    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createNodeSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const scanner = createArtifactScanner({
      database,
      sessionsRoot,
    })

    await expect(scanner.sync()).resolves.toMatchObject({
      processedCount: 1,
      unreadableCount: 0,
    })

    appendFileSync(
      artifact.transcriptPath,
      '\n{"type":"message","timestamp":"2026-04-03T00:31:00.000Z","message":{"role":"assistant","content":"',
      'utf8',
    )

    await expect(scanner.sync()).resolves.toMatchObject({
      processedCount: 1,
      unreadableCount: 0,
    })

    appendFileSync(
      artifact.transcriptPath,
      'and review"}}\n{"type":"session_end","timestamp":"2026-04-03T00:32:00.000Z"}\n',
      'utf8',
    )

    const report = await scanner.sync()

    expect(report).toMatchObject({
      processedCount: 1,
      unreadableCount: 0,
    })
    expect(database.getSession('66666666-6666-4666-8666-666666666666')).toMatchObject({
      title: 'Reconcile partial session',
      status: 'completed',
      lastActivityAt: '2026-04-03T00:32:00.000Z',
    })
  })

  it('rescans unchanged unreadable sessions so recovered artifacts self-heal', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-artifacts-'))
    const sessionsRoot = join(root, 'sessions')
    const userDataPath = join(root, 'user-data')
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    const artifact = writeSessionArtifact({
      sessionsRoot,
      bucket: '-heal-unreadable',
      sessionId: '77777777-7777-4777-8777-777777777777',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-04-03T00:40:00.000Z',
          id: '77777777-7777-4777-8777-777777777777',
          title: 'Can you find the latest changes on the apartment project?',
          sessionTitle: 'Find Latest Apartment Project Changes',
          cwd: '/tmp/heal-unreadable',
        }),
      ],
    })

    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createNodeSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const scanner = createArtifactScanner({
      database,
      sessionsRoot,
    })

    await expect(scanner.sync()).resolves.toMatchObject({
      processedCount: 1,
      unreadableCount: 0,
    })

    const stat = statSync(artifact.transcriptPath)

    database.upsertArtifactSession({
      sessionId: '77777777-7777-4777-8777-777777777777',
      sourcePath: artifact.transcriptPath,
      projectWorkspacePath: '/tmp/heal-unreadable',
      modelId: null,
      title: 'Unreadable session',
      status: 'disconnected',
      transport: 'artifacts',
      createdAt: '2026-04-03T00:40:00.000Z',
      lastActivityAt: '2026-04-03T00:40:00.000Z',
      updatedAt: '2026-04-03T00:40:00.000Z',
      lastByteOffset: stat.size,
      lastMtimeMs: stat.mtimeMs,
      checksum: 'stale-unreadable',
    })

    const healed = await scanner.sync()

    expect(healed).toMatchObject({
      processedCount: 1,
      unreadableCount: 0,
      skippedCount: 0,
    })
    expect(database.getSession('77777777-7777-4777-8777-777777777777')).toMatchObject({
      title: 'Find Latest Apartment Project Changes',
      status: 'idle',
    })
  })

  it('skips unchanged unreadable artifacts once their metadata already matches the tracked failure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-artifacts-'))
    const sessionsRoot = join(root, 'sessions')
    const userDataPath = join(root, 'user-data')
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    const artifact = writeSessionArtifact({
      sessionsRoot,
      bucket: '-stable-unreadable',
      sessionId: '88888888-8888-4888-8888-888888888888',
      transcriptLines: [
        JSON.stringify({
          type: 'message',
          timestamp: '2026-04-03T00:50:00.000Z',
          message: { role: 'user', content: 'still malformed for indexing' },
        }),
      ],
      settings: {
        cwd: '/tmp/stable-unreadable',
      },
    })

    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createNodeSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const logger = vi.spyOn(console, 'error').mockImplementation(() => {})
    cleanup.push(() => logger.mockRestore())

    const scanner = createArtifactScanner({
      database,
      sessionsRoot,
    })

    const firstReport = await scanner.sync()
    const secondReport = await scanner.sync()
    const stat = statSync(artifact.transcriptPath)

    expect(firstReport).toMatchObject({
      processedCount: 1,
      unreadableCount: 1,
      skippedCount: 0,
    })
    expect(secondReport).toMatchObject({
      processedCount: 0,
      unreadableCount: 0,
      skippedCount: 1,
    })
    expect(database.getSession('88888888-8888-4888-8888-888888888888')).toMatchObject({
      title: 'Unreadable session',
      status: 'disconnected',
    })
    expect(database.listSyncMetadata()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePath: artifact.transcriptPath,
          lastByteOffset: stat.size,
          lastMtimeMs: stat.mtimeMs,
          checksum: `${stat.size}:${Math.floor(stat.mtimeMs)}`,
        }),
      ]),
    )
    expect(logger).toHaveBeenCalledTimes(1)
  })

  it('removes deleted sessions from SQLite on the next poll cycle', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-artifacts-'))
    const sessionsRoot = join(root, 'sessions')
    const userDataPath = join(root, 'user-data')
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))

    const artifact = writeSessionArtifact({
      sessionsRoot,
      bucket: '-delete-me',
      sessionId: '44444444-4444-4444-8444-444444444444',
      transcriptLines: [
        JSON.stringify({
          type: 'session_start',
          timestamp: '2026-03-24T23:55:00.000Z',
          id: '44444444-4444-4444-8444-444444444444',
          title: 'Delete me',
          cwd: '/tmp/delete-me',
        }),
      ],
    })

    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createNodeSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const scanner = createArtifactScanner({
      database,
      sessionsRoot,
    })

    const firstReport = await scanner.sync()
    expect(database.listSessions()).toEqual([
      expect.objectContaining({
        id: '44444444-4444-4444-8444-444444444444',
        hasUserMessage: false,
      }),
    ])
    unlinkSync(artifact.transcriptPath)
    const secondReport = await scanner.sync()

    expect(firstReport.processedCount).toBe(1)
    expect(secondReport.deletedCount).toBe(1)
    expect(database.listSessions()).toEqual([])
    expect(database.listSyncMetadata()).toEqual([])
  })
})
