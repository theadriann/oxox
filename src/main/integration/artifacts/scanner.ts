import {
  closeSync,
  type Dirent,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'

import type { SessionRecord, SyncMetadataRecord } from '../../../shared/ipc/contracts'
import type { ArtifactSessionUpsert, DatabaseService } from '../database/service'
import {
  buildArtifactChecksum,
  partitionArtifactMetadataDeletes,
  shouldSkipArtifactSync,
  shouldUseAppendOnlyArtifactSync,
} from './changeDetection'
import {
  parseTranscriptFileFromPath,
  type TranscriptParseResult,
  type TranscriptRecord,
} from './jsonlParser'

const TRANSCRIPT_EXTENSION = '.jsonl'
const SETTINGS_SUFFIX = '.settings.json'
const UNREADABLE_SESSION_TITLE = 'Unreadable session'

type ArtifactFile = {
  bucketName: string | null
  sessionId: string
  sourcePath: string
}

type SessionSettings = {
  cwd: string | null
  modelId: string | null
}

export interface ArtifactScannerReport {
  deletedCount: number
  durationMs: number
  processedCount: number
  skippedCount: number
  unreadableCount: number
}

export interface ArtifactScanner {
  sync: () => ArtifactScannerReport | Promise<ArtifactScannerReport>
  close?: () => void | Promise<void>
}

export interface CreateArtifactScannerOptions {
  database: DatabaseService
  sessionsRoot: string
}

type TrackedSyncMetadata = SyncMetadataRecord & {
  sourcePath: string
}

type SessionSnapshot = {
  callingSessionId: string | null
  lineageRelationship: 'subagent' | 'fork'
  createdAt: string
  hasUserMessage: boolean
  lastActivityAt: string | null
  modelId: string | null
  projectWorkspacePath: string | null
  status: string
  title: string
  updatedAt: string
}

function isTranscriptFile(entry: Dirent): boolean {
  return entry.isFile() && entry.name.endsWith(TRANSCRIPT_EXTENSION)
}

function listTranscriptArtifacts(sessionsRoot: string): ArtifactFile[] {
  const entries = safeReadDir(sessionsRoot)
  const bucketEntries = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))

  const files: ArtifactFile[] = []
  const seenSessionIds = new Set<string>()

  for (const bucketName of bucketEntries) {
    const bucketPath = join(sessionsRoot, bucketName)
    const bucketFiles = safeReadDir(bucketPath)
      .filter(isTranscriptFile)
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))

    for (const fileName of bucketFiles) {
      const sessionId = fileName.slice(0, -TRANSCRIPT_EXTENSION.length)
      seenSessionIds.add(sessionId)
      files.push({
        bucketName,
        sessionId,
        sourcePath: join(bucketPath, fileName),
      })
    }
  }

  const rootFiles = entries
    .filter(isTranscriptFile)
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))

  for (const fileName of rootFiles) {
    const sessionId = fileName.slice(0, -TRANSCRIPT_EXTENSION.length)

    if (seenSessionIds.has(sessionId)) {
      continue
    }

    files.push({
      bucketName: null,
      sessionId,
      sourcePath: join(sessionsRoot, fileName),
    })
  }

  return files
}

function safeReadDir(directoryPath: string): Dirent[] {
  try {
    return readdirSync(directoryPath, { withFileTypes: true })
  } catch (error) {
    if (isMissingPathError(error)) {
      return []
    }

    throw error
  }
}

function isMissingPathError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT',
  )
}

function readSettings(options: CreateArtifactScannerOptions, file: ArtifactFile): SessionSettings {
  const bucketSettingsPath = join(
    file.bucketName ? join(options.sessionsRoot, file.bucketName) : options.sessionsRoot,
    `${file.sessionId}${SETTINGS_SUFFIX}`,
  )
  const rootSettingsPath = join(options.sessionsRoot, `${file.sessionId}${SETTINGS_SUFFIX}`)
  const settingsPath = file.bucketName
    ? (tryReadSettings(bucketSettingsPath) ?? tryReadSettings(rootSettingsPath))
    : tryReadSettings(rootSettingsPath)

  return settingsPath ?? { cwd: null, modelId: null }
}

function tryReadSettings(filePath: string): SessionSettings | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    return {
      cwd: typeof parsed.cwd === 'string' ? parsed.cwd : null,
      modelId: readModelId(parsed),
    }
  } catch (error) {
    if (isMissingPathError(error)) {
      return null
    }

    console.error('Failed to read session settings artifact', {
      error: error instanceof Error ? error.message : String(error),
      filePath,
    })

    return null
  }
}

function firstDefinedString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return null
}

function readModelId(settings: Record<string, unknown>): string | null {
  const nestedSettings =
    settings.settings && typeof settings.settings === 'object'
      ? (settings.settings as Record<string, unknown>)
      : null

  return firstDefinedString(
    settings.modelId,
    settings.model,
    nestedSettings?.modelId,
    nestedSettings?.model,
  )
}

function deriveSnapshot(
  file: ArtifactFile,
  records: TranscriptRecord[],
  settings: SessionSettings,
  fallbackTimestamp: string,
  previousSession?: SessionRecord,
): SessionSnapshot {
  const startRecord = records.find((record) => record.type === 'session_start')

  if (!startRecord) {
    throw new Error('missing session_start record')
  }

  const timestamps = records.flatMap((record) => (record.timestamp ? [record.timestamp] : []))
  const title =
    firstDefinedString(
      startRecord.payload.sessionTitle,
      startRecord.payload.name,
      startRecord.payload.title,
      previousSession?.title,
    ) ?? 'Untitled session'
  const projectWorkspacePath =
    firstDefinedString(
      startRecord.payload.cwd,
      settings.cwd,
      previousSession?.projectWorkspacePath,
      file.bucketName ? `~/.factory/sessions/${file.bucketName}` : null,
    ) ?? null
  const modelId =
    firstDefinedString(
      startRecord.payload.modelId,
      startRecord.payload.model,
      settings.modelId,
      previousSession?.modelId,
    ) ?? null
  const createdAt =
    firstDefinedString(startRecord.timestamp, timestamps[0], previousSession?.createdAt) ??
    fallbackTimestamp
  const lastActivityAt =
    firstDefinedString(
      timestamps.at(-1),
      previousSession?.lastActivityAt,
      previousSession?.updatedAt,
      createdAt,
    ) ?? fallbackTimestamp

  const parentId = firstDefinedString(
    startRecord.payload.callingSessionId,
    startRecord.payload.parent,
  )
  const lineageRelationship = startRecord.payload.callingSessionId ? 'subagent' : 'fork'

  return {
    callingSessionId: parentId,
    lineageRelationship,
    createdAt,
    hasUserMessage: records.some((record) => isUserMessageRecord(record.payload)),
    lastActivityAt,
    modelId,
    projectWorkspacePath,
    status: records.some((record) => record.type === 'session_end') ? 'completed' : 'idle',
    title,
    updatedAt: lastActivityAt ?? fallbackTimestamp,
  }
}

function deriveDeltaSnapshot(
  deltaRecords: TranscriptRecord[],
  _fallbackTimestamp: string,
  previousSession: SessionRecord,
): SessionSnapshot {
  const snapshot = deriveSnapshot(
    {
      bucketName: null,
      sessionId: previousSession.id,
      sourcePath: '',
    },
    [{ type: 'session_start', timestamp: previousSession.createdAt, payload: {} }, ...deltaRecords],
    { cwd: previousSession.projectWorkspacePath },
    { cwd: previousSession.projectWorkspacePath, modelId: previousSession.modelId ?? null },
    previousSession,
  )

  return {
    ...snapshot,
    callingSessionId: previousSession.parentSessionId ?? snapshot.callingSessionId,
    lineageRelationship:
      (previousSession.derivationType as 'subagent' | 'fork') ?? snapshot.lineageRelationship,
    hasUserMessage: Boolean(previousSession.hasUserMessage) || snapshot.hasUserMessage,
    title: previousSession.title,
    modelId: previousSession.modelId ?? snapshot.modelId,
    projectWorkspacePath: previousSession.projectWorkspacePath,
  }
}

function createUnreadableUpsert(
  file: ArtifactFile,
  tracked: TrackedSyncMetadata | undefined,
  previousSession: SessionRecord | undefined,
  stat: { mtimeMs: number; size: number },
  fallbackTimestamp: string,
  settings: SessionSettings,
): ArtifactSessionUpsert {
  return {
    sessionId: file.sessionId,
    sourcePath: file.sourcePath,
    projectWorkspacePath:
      settings.cwd ??
      previousSession?.projectWorkspacePath ??
      (file.bucketName ? `~/.factory/sessions/${file.bucketName}` : null),
    modelId: settings.modelId ?? previousSession?.modelId ?? null,
    hasUserMessage: previousSession?.hasUserMessage ?? false,
    title: UNREADABLE_SESSION_TITLE,
    status: 'disconnected',
    transport: 'artifacts',
    createdAt: previousSession?.createdAt ?? fallbackTimestamp,
    lastActivityAt: previousSession?.lastActivityAt ?? fallbackTimestamp,
    updatedAt: fallbackTimestamp,
    lastByteOffset: stat.size,
    lastMtimeMs: stat.mtimeMs,
    checksum: tracked?.checksum ?? buildArtifactChecksum(stat),
  }
}

function backfillSessionLineage(
  options: CreateArtifactScannerOptions,
  files: ArtifactFile[],
): void {
  const existingLineageIds = new Set(options.database.listSessionLineageIds())
  const filesToBackfill = files.filter((file) => !existingLineageIds.has(file.sessionId))

  for (const file of filesToBackfill) {
    try {
      const firstLine = readFirstLine(file.sourcePath)

      if (!firstLine) {
        continue
      }

      const record = JSON.parse(firstLine) as Record<string, unknown>
      const callingSessionId =
        typeof record.callingSessionId === 'string' && record.callingSessionId.length > 0
          ? record.callingSessionId
          : null
      const parentId =
        typeof record.parent === 'string' && record.parent.length > 0 ? record.parent : null
      const resolvedParent = callingSessionId ?? parentId
      const relationship = callingSessionId ? 'subagent' : 'fork'

      if (resolvedParent) {
        const timestamp =
          typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString()
        options.database.linkSessionParent(file.sessionId, resolvedParent, relationship, timestamp)
      }
    } catch {
      // Skip files that can't be read
    }
  }
}

function readFirstLine(filePath: string): string | null {
  const fileDescriptor = openSync(filePath, 'r')

  try {
    const buffer = Buffer.alloc(4096)
    const bytesRead = readSync(fileDescriptor, buffer, 0, 4096, 0)

    if (bytesRead === 0) {
      return null
    }

    const text = buffer.toString('utf8', 0, bytesRead)
    const newlineIndex = text.indexOf('\n')
    return newlineIndex >= 0 ? text.slice(0, newlineIndex) : text
  } finally {
    closeSync(fileDescriptor)
  }
}

function isUserMessageRecord(payload: Record<string, unknown>): boolean {
  const message =
    payload.message && typeof payload.message === 'object'
      ? (payload.message as Record<string, unknown>)
      : null

  return message?.role === 'user'
}

export function createArtifactScanner(options: CreateArtifactScannerOptions): ArtifactScanner {
  return {
    sync: async () => {
      const startedAt = Date.now()
      const trackedByPath = new Map(
        options.database.listSyncMetadata().map((metadata) => [metadata.sourcePath, metadata]),
      )
      const sessionsById = new Map(
        options.database.listSessions().map((session) => [session.id, session]),
      )
      const currentFiles = listTranscriptArtifacts(options.sessionsRoot)
      const currentSourcePaths = new Set(currentFiles.map((file) => file.sourcePath))
      const currentSessionIds = new Set(currentFiles.map((file) => file.sessionId))

      let processedCount = 0
      let skippedCount = 0
      let unreadableCount = 0

      for (const file of currentFiles) {
        const stat = statSync(file.sourcePath)
        const tracked = trackedByPath.get(file.sourcePath)
        const previousSession = sessionsById.get(file.sessionId)
        const fallbackTimestamp = new Date(stat.mtimeMs).toISOString()
        const currentChecksum = buildArtifactChecksum(stat)

        if (
          shouldSkipArtifactSync({
            tracked,
            previousSession,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            currentChecksum,
          })
        ) {
          skippedCount += 1
          continue
        }

        const settings = readSettings(options, file)

        try {
          const isAppendOnlyUpdate = shouldUseAppendOnlyArtifactSync({
            tracked,
            previousSession,
            size: stat.size,
          })

          let parsed: TranscriptParseResult
          let snapshot: SessionSnapshot
          let lastByteOffset: number

          try {
            const startOffset = isAppendOnlyUpdate ? tracked.lastByteOffset : 0
            parsed = await parseTranscriptFileFromPath(file.sourcePath, startOffset)
            snapshot =
              isAppendOnlyUpdate && previousSession
                ? deriveDeltaSnapshot(parsed.records, fallbackTimestamp, previousSession)
                : deriveSnapshot(file, parsed.records, settings, fallbackTimestamp, previousSession)
            lastByteOffset = startOffset + parsed.lastByteOffset
          } catch (error) {
            if (!(isAppendOnlyUpdate && previousSession)) {
              throw error
            }

            parsed = await parseTranscriptFileFromPath(file.sourcePath, 0)
            snapshot = deriveSnapshot(
              file,
              parsed.records,
              settings,
              fallbackTimestamp,
              previousSession,
            )
            lastByteOffset = parsed.lastByteOffset
          }

          options.database.upsertArtifactSession({
            sessionId: file.sessionId,
            sourcePath: file.sourcePath,
            projectWorkspacePath: snapshot.projectWorkspacePath,
            modelId: snapshot.modelId,
            hasUserMessage: snapshot.hasUserMessage,
            title: snapshot.title,
            status: snapshot.status,
            transport: 'artifacts',
            createdAt: snapshot.createdAt,
            lastActivityAt: snapshot.lastActivityAt,
            updatedAt: snapshot.updatedAt,
            lastByteOffset,
            lastMtimeMs: stat.mtimeMs,
            checksum: currentChecksum,
          })

          if (snapshot.callingSessionId) {
            options.database.linkSessionParent(
              file.sessionId,
              snapshot.callingSessionId,
              snapshot.lineageRelationship,
              snapshot.createdAt,
            )
          }
        } catch (error) {
          unreadableCount += 1
          console.error('Failed to index session artifact', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: file.sessionId,
            sourcePath: file.sourcePath,
          })
          options.database.upsertArtifactSession(
            createUnreadableUpsert(
              file,
              tracked,
              previousSession,
              stat,
              fallbackTimestamp,
              settings,
            ),
          )
        }

        processedCount += 1
      }

      backfillSessionLineage(options, currentFiles)

      const { missingSessionDeletes, staleMetadataDeletes } = partitionArtifactMetadataDeletes({
        trackedMetadata: options.database.listSyncMetadata(),
        currentSourcePaths,
        currentSessionIds,
      })

      options.database.removeSyncMetadataBySourcePaths(
        staleMetadataDeletes.map((metadata) => metadata.sourcePath),
      )
      options.database.removeSessionsBySourcePaths(
        missingSessionDeletes.map((metadata) => metadata.sourcePath),
      )

      return {
        deletedCount: missingSessionDeletes.length,
        durationMs: Date.now() - startedAt,
        processedCount,
        skippedCount,
        unreadableCount,
      }
    },
  }
}
