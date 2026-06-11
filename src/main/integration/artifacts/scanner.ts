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

import { listSessions as listSdkSessions } from '@factory/droid-sdk'
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
const DEFAULT_SDK_METADATA_LIMIT = 100
const DEFAULT_MAX_LINEAGE_BACKFILL_READS_PER_SYNC = 100

type ArtifactFile = {
  bucketName: string | null
  lastMtimeMs: number
  sessionId: string
  sourcePath: string
}

type SessionSettings = {
  archivedAt: string | null
  cwd: string | null
  decompMissionId: string | null
  decompSessionType: string | null
  modelId: string | null
}

export interface ArtifactScannerReport {
  deletedCount: number
  durationMs: number
  lineageBackfillScannedCount?: number
  lineageBackfilledCount?: number
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
  maxLineageBackfillReadsPerSync?: number
  sdkListSessions?: SdkListSessions
  sdkMetadataLimit?: number
  sessionsRoot: string
}

type SdkListSessions = (options: {
  fetchOutsideCWD?: boolean
  numSessions?: number
  sessionsDir?: string
}) => Promise<readonly SdkSessionMetadata[]>

type SdkSessionMetadata = {
  id: string
  title?: string
  sessionTitle?: string
  owner?: string
  messageCount?: number
  modifiedTime?: Date | string
  createdTime?: Date | string
  isFavorite?: boolean
  cwd?: string
  decompSessionType?: string
  decompMissionId?: string
}

type TrackedSyncMetadata = SyncMetadataRecord & {
  sourcePath: string
}

type SessionSnapshot = {
  callingSessionId: string | null
  lineageRelationship: 'subagent' | 'fork'
  createdAt: string
  decompMissionId: string | null
  decompSessionType: string | null
  hasUserMessage: boolean
  isFavorite: boolean
  lastActivityAt: string | null
  messageCount: number
  modelId: string | null
  owner: string | null
  projectWorkspacePath: string | null
  status: string
  title: string
  updatedAt: string
}

function isTranscriptFile(entry: Dirent): boolean {
  return entry.isFile() && entry.name.endsWith(TRANSCRIPT_EXTENSION)
}

async function readLatestSdkSessionMetadata(
  options: CreateArtifactScannerOptions,
): Promise<Map<string, SdkSessionMetadata>> {
  const listSessions = options.sdkListSessions ?? listSdkSessions

  try {
    const sessions = await listSessions({
      fetchOutsideCWD: true,
      numSessions: options.sdkMetadataLimit ?? DEFAULT_SDK_METADATA_LIMIT,
      sessionsDir: options.sessionsRoot,
    })

    return new Map(sessions.map((session) => [session.id, session]))
  } catch (error) {
    console.error('Failed to read SDK session metadata', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Map()
  }
}

function listTranscriptArtifacts(sessionsRoot: string): ArtifactFile[] {
  const entries = safeReadDir(sessionsRoot)
  const files: ArtifactFile[] = []

  const addFile = (bucketName: string | null, fileName: string, sourcePath: string): void => {
    let lastMtimeMs: number

    try {
      lastMtimeMs = statSync(sourcePath).mtimeMs
    } catch {
      return
    }

    const sessionId = fileName.slice(0, -TRANSCRIPT_EXTENSION.length)
    files.push({
      bucketName,
      lastMtimeMs,
      sessionId,
      sourcePath,
    })
  }

  const bucketEntries = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))

  for (const bucketName of bucketEntries) {
    const bucketPath = join(sessionsRoot, bucketName)
    const bucketFiles = safeReadDir(bucketPath)
      .filter(isTranscriptFile)
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))

    for (const fileName of bucketFiles) {
      addFile(bucketName, fileName, join(bucketPath, fileName))
    }
  }

  const rootFiles = entries
    .filter(isTranscriptFile)
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))

  for (const fileName of rootFiles) {
    addFile(null, fileName, join(sessionsRoot, fileName))
  }

  return files.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))
}

function dedupeTranscriptArtifacts(files: ArtifactFile[]): ArtifactFile[] {
  const filesBySessionId = new Map<string, ArtifactFile>()

  for (const file of files) {
    const current = filesBySessionId.get(file.sessionId)

    if (current && current.lastMtimeMs >= file.lastMtimeMs) {
      continue
    }

    filesBySessionId.set(file.sessionId, file)
  }

  return [...filesBySessionId.values()].sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  )
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

function readSettings(
  options: CreateArtifactScannerOptions,
  file: ArtifactFile,
  loggedUnreadableSettingsPaths: Set<string>,
): SessionSettings {
  const settingsPath = join(
    file.bucketName ? join(options.sessionsRoot, file.bucketName) : options.sessionsRoot,
    `${file.sessionId}${SETTINGS_SUFFIX}`,
  )
  const settings = tryReadSettings(settingsPath, loggedUnreadableSettingsPaths)

  return (
    settings ?? {
      archivedAt: null,
      cwd: null,
      decompMissionId: null,
      decompSessionType: null,
      modelId: null,
    }
  )
}

function tryReadSettings(
  filePath: string,
  loggedUnreadableSettingsPaths: Set<string>,
): SessionSettings | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    return {
      archivedAt: typeof parsed.archivedAt === 'string' ? parsed.archivedAt : null,
      cwd: typeof parsed.cwd === 'string' ? parsed.cwd : null,
      ...readDecompMetadata(parsed),
      modelId: readModelId(parsed),
    }
  } catch (error) {
    if (isMissingPathError(error)) {
      return null
    }

    if (!loggedUnreadableSettingsPaths.has(filePath)) {
      loggedUnreadableSettingsPaths.add(filePath)
      console.error('Failed to read session settings artifact', {
        error: error instanceof Error ? error.message : String(error),
        filePath,
      })
    }

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

function readDecompMetadata(settings: Record<string, unknown>): {
  decompMissionId: string | null
  decompSessionType: string | null
} {
  const tags = Array.isArray(settings.tags) ? settings.tags : []
  let decompMissionId: string | null = null
  let decompSessionType: string | null = null

  for (const tag of tags) {
    if (!tag || typeof tag !== 'object') {
      continue
    }

    const record = tag as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : ''
    const metadata =
      record.metadata && typeof record.metadata === 'object'
        ? (record.metadata as Record<string, unknown>)
        : null

    if (name.startsWith('mission:') && typeof metadata?.missionId === 'string') {
      decompMissionId = metadata.missionId
    }

    if (name === 'decompSessionType' && typeof metadata?.value === 'string') {
      decompSessionType = metadata.value
    }
  }

  return { decompMissionId, decompSessionType }
}

function toOptionalNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined
}

function applySdkMetadataToSnapshot(
  snapshot: SessionSnapshot,
  sdkMetadata: SdkSessionMetadata | undefined,
): SessionSnapshot {
  if (!sdkMetadata) {
    return snapshot
  }

  return {
    ...snapshot,
    title:
      firstDefinedString(sdkMetadata.sessionTitle, sdkMetadata.title, snapshot.title) ??
      snapshot.title,
    owner: firstDefinedString(sdkMetadata.owner, snapshot.owner) ?? null,
    messageCount: toOptionalNonNegativeInteger(sdkMetadata.messageCount) ?? snapshot.messageCount,
    isFavorite:
      typeof sdkMetadata.isFavorite === 'boolean' ? sdkMetadata.isFavorite : snapshot.isFavorite,
    projectWorkspacePath:
      firstDefinedString(sdkMetadata.cwd, snapshot.projectWorkspacePath) ?? null,
    decompSessionType:
      firstDefinedString(sdkMetadata.decompSessionType, snapshot.decompSessionType) ?? null,
    decompMissionId:
      firstDefinedString(sdkMetadata.decompMissionId, snapshot.decompMissionId) ?? null,
  }
}

function readFavorites(sessionsRoot: string): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(join(sessionsRoot, '.favorites'), 'utf8')) as unknown
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [],
    )
  } catch (error) {
    if (isMissingPathError(error)) {
      return new Set()
    }

    console.error('Failed to read session favorites artifact', {
      error: error instanceof Error ? error.message : String(error),
      filePath: join(sessionsRoot, '.favorites'),
    })

    return new Set()
  }
}

function deriveSnapshot(
  file: ArtifactFile,
  records: TranscriptRecord[],
  settings: SessionSettings,
  favorites: Set<string>,
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
  const owner = firstDefinedString(startRecord.payload.owner, previousSession?.owner) ?? null
  const decompSessionType =
    firstDefinedString(
      startRecord.payload.decompSessionType,
      settings.decompSessionType,
      previousSession?.decompSessionType,
    ) ?? null
  const decompMissionId =
    firstDefinedString(
      settings.decompMissionId,
      startRecord.payload.decompMissionId,
      previousSession?.decompMissionId,
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
    decompMissionId,
    decompSessionType,
    hasUserMessage: records.some((record) => isUserMessageRecord(record.payload)),
    isFavorite: favorites.has(file.sessionId),
    lastActivityAt,
    messageCount: Math.max(0, records.length - 1),
    modelId,
    owner,
    projectWorkspacePath,
    status: records.some((record) => record.type === 'session_end') ? 'completed' : 'idle',
    title,
    updatedAt: lastActivityAt ?? fallbackTimestamp,
  }
}

function deriveDeltaSnapshot(
  deltaRecords: TranscriptRecord[],
  fallbackTimestamp: string,
  previousSession: SessionRecord,
  favorites: Set<string>,
): SessionSnapshot {
  const snapshot = deriveSnapshot(
    {
      bucketName: null,
      lastMtimeMs: 0,
      sessionId: previousSession.id,
      sourcePath: '',
    },
    [{ type: 'session_start', timestamp: previousSession.createdAt, payload: {} }, ...deltaRecords],
    {
      archivedAt: null,
      cwd: previousSession.projectWorkspacePath,
      decompMissionId: previousSession.decompMissionId ?? null,
      decompSessionType: previousSession.decompSessionType ?? null,
      modelId: previousSession.modelId ?? null,
    },
    favorites,
    fallbackTimestamp,
    previousSession,
  )

  return {
    ...snapshot,
    callingSessionId: previousSession.parentSessionId ?? snapshot.callingSessionId,
    lineageRelationship:
      (previousSession.derivationType as 'subagent' | 'fork') ?? snapshot.lineageRelationship,
    hasUserMessage: Boolean(previousSession.hasUserMessage) || snapshot.hasUserMessage,
    messageCount: (previousSession.messageCount ?? 0) + deltaRecords.length,
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
    owner: previousSession?.owner ?? null,
    messageCount: previousSession?.messageCount ?? 0,
    isFavorite: previousSession?.isFavorite ?? false,
    decompSessionType: settings.decompSessionType ?? previousSession?.decompSessionType ?? null,
    decompMissionId: settings.decompMissionId ?? previousSession?.decompMissionId ?? null,
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

function createSdkMetadataOverlayUpsert(
  file: ArtifactFile,
  tracked: TrackedSyncMetadata,
  previousSession: SessionRecord,
  sdkMetadata: SdkSessionMetadata | undefined,
): ArtifactSessionUpsert | null {
  if (!sdkMetadata) {
    return null
  }

  const title =
    firstDefinedString(sdkMetadata.sessionTitle, sdkMetadata.title, previousSession.title) ??
    previousSession.title
  const owner = firstDefinedString(sdkMetadata.owner, previousSession.owner) ?? null
  const messageCount =
    toOptionalNonNegativeInteger(sdkMetadata.messageCount) ?? previousSession.messageCount ?? 0
  const isFavorite =
    typeof sdkMetadata.isFavorite === 'boolean'
      ? sdkMetadata.isFavorite
      : Boolean(previousSession.isFavorite)
  const projectWorkspacePath =
    firstDefinedString(sdkMetadata.cwd, previousSession.projectWorkspacePath) ?? null
  const decompSessionType =
    firstDefinedString(sdkMetadata.decompSessionType, previousSession.decompSessionType) ?? null
  const decompMissionId =
    firstDefinedString(sdkMetadata.decompMissionId, previousSession.decompMissionId) ?? null

  if (
    title === previousSession.title &&
    owner === (previousSession.owner ?? null) &&
    messageCount === (previousSession.messageCount ?? 0) &&
    isFavorite === Boolean(previousSession.isFavorite) &&
    projectWorkspacePath === (previousSession.projectWorkspacePath ?? null) &&
    decompSessionType === (previousSession.decompSessionType ?? null) &&
    decompMissionId === (previousSession.decompMissionId ?? null)
  ) {
    return null
  }

  return {
    sessionId: file.sessionId,
    sourcePath: file.sourcePath,
    projectWorkspacePath,
    modelId: previousSession.modelId ?? null,
    hasUserMessage: Boolean(previousSession.hasUserMessage),
    owner,
    messageCount,
    isFavorite,
    decompSessionType,
    decompMissionId,
    title,
    status: previousSession.status,
    transport: previousSession.transport ?? 'artifacts',
    createdAt: previousSession.createdAt,
    lastActivityAt: previousSession.lastActivityAt,
    updatedAt: previousSession.updatedAt,
    lastByteOffset: tracked.lastByteOffset,
    lastMtimeMs: tracked.lastMtimeMs,
    checksum: tracked.checksum,
  }
}

function backfillSessionLineage(
  options: CreateArtifactScannerOptions,
  files: ArtifactFile[],
  checkedLineageBySourcePath: Map<string, number>,
): { backfilledCount: number; scannedCount: number } {
  const existingLineageIds = new Set(options.database.listSessionLineageIds())
  const maxReads = Math.max(
    0,
    Math.floor(
      options.maxLineageBackfillReadsPerSync ?? DEFAULT_MAX_LINEAGE_BACKFILL_READS_PER_SYNC,
    ),
  )
  const filesToBackfill = files
    .filter(
      (file) =>
        !existingLineageIds.has(file.sessionId) &&
        checkedLineageBySourcePath.get(file.sourcePath) !== file.lastMtimeMs,
    )
    .slice(0, maxReads)
  let backfilledCount = 0
  let scannedCount = 0

  for (const file of filesToBackfill) {
    checkedLineageBySourcePath.set(file.sourcePath, file.lastMtimeMs)
    scannedCount += 1

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
        backfilledCount += 1
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return { backfilledCount, scannedCount }
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
  const loggedUnreadableSettingsPaths = new Set<string>()
  const checkedLineageBySourcePath = new Map<string, number>()

  return {
    sync: async () => {
      const startedAt = Date.now()
      const sdkMetadataBySessionId = await readLatestSdkSessionMetadata(options)
      const trackedByPath = new Map(
        options.database.listSyncMetadata().map((metadata) => [metadata.sourcePath, metadata]),
      )
      const sessionsById = new Map(
        options.database.listSessions().map((session) => [session.id, session]),
      )
      const favorites = readFavorites(options.sessionsRoot)
      const fileSettings = new Map<string, SessionSettings>()
      const currentFiles = dedupeTranscriptArtifacts(
        listTranscriptArtifacts(options.sessionsRoot).filter((file) => {
          const settings = readSettings(options, file, loggedUnreadableSettingsPaths)
          fileSettings.set(file.sourcePath, settings)
          return !settings.archivedAt
        }),
      )
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
          if (tracked && previousSession) {
            const overlay = createSdkMetadataOverlayUpsert(
              file,
              tracked,
              previousSession,
              sdkMetadataBySessionId.get(file.sessionId),
            )

            if (overlay) {
              options.database.upsertArtifactSession(overlay)
            }
          }

          skippedCount += 1
          continue
        }

        const settings =
          fileSettings.get(file.sourcePath) ??
          readSettings(options, file, loggedUnreadableSettingsPaths)

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
                ? deriveDeltaSnapshot(parsed.records, fallbackTimestamp, previousSession, favorites)
                : deriveSnapshot(
                    file,
                    parsed.records,
                    settings,
                    favorites,
                    fallbackTimestamp,
                    previousSession,
                  )
            snapshot = applySdkMetadataToSnapshot(
              snapshot,
              sdkMetadataBySessionId.get(file.sessionId),
            )
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
              favorites,
              fallbackTimestamp,
              previousSession,
            )
            snapshot = applySdkMetadataToSnapshot(
              snapshot,
              sdkMetadataBySessionId.get(file.sessionId),
            )
            lastByteOffset = parsed.lastByteOffset
          }

          options.database.upsertArtifactSession({
            sessionId: file.sessionId,
            sourcePath: file.sourcePath,
            projectWorkspacePath: snapshot.projectWorkspacePath,
            modelId: snapshot.modelId,
            hasUserMessage: snapshot.hasUserMessage,
            owner: snapshot.owner,
            messageCount: snapshot.messageCount,
            isFavorite: snapshot.isFavorite,
            decompSessionType: snapshot.decompSessionType,
            decompMissionId: snapshot.decompMissionId,
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

      const { backfilledCount: lineageBackfilledCount, scannedCount: lineageBackfillScannedCount } =
        backfillSessionLineage(options, currentFiles, checkedLineageBySourcePath)

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
        lineageBackfillScannedCount,
        lineageBackfilledCount,
        processedCount,
        skippedCount,
        unreadableCount,
      }
    },
  }
}
