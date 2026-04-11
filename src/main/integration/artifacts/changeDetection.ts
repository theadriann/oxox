import type { SessionRecord, SyncMetadataRecord } from '../../../shared/ipc/contracts'

const UNREADABLE_SESSION_TITLE = 'Unreadable session'

export function buildArtifactChecksum(stat: { mtimeMs: number; size: number }): string {
  return `${stat.size}:${Math.floor(stat.mtimeMs)}`
}

export function shouldSkipArtifactSync(options: {
  tracked: SyncMetadataRecord | undefined
  previousSession: SessionRecord | undefined
  size: number
  mtimeMs: number
  currentChecksum: string
}): boolean {
  const { tracked, previousSession, size, mtimeMs, currentChecksum } = options

  return Boolean(
    tracked &&
      tracked.lastByteOffset === size &&
      tracked.lastMtimeMs === mtimeMs &&
      (previousSession?.title !== UNREADABLE_SESSION_TITLE || tracked.checksum === currentChecksum),
  )
}

export function shouldUseAppendOnlyArtifactSync(options: {
  tracked: SyncMetadataRecord | undefined
  previousSession: SessionRecord | undefined
  size: number
}): boolean {
  const { tracked, previousSession, size } = options

  return Boolean(
    tracked &&
      previousSession &&
      tracked.lastByteOffset >= 0 &&
      previousSession.title !== UNREADABLE_SESSION_TITLE &&
      previousSession.status !== 'disconnected' &&
      size > tracked.lastByteOffset,
  )
}

export function partitionArtifactMetadataDeletes(options: {
  trackedMetadata: SyncMetadataRecord[]
  currentSourcePaths: Set<string>
  currentSessionIds: Set<string>
}): {
  missingSessionDeletes: SyncMetadataRecord[]
  staleMetadataDeletes: SyncMetadataRecord[]
} {
  const missingRows = options.trackedMetadata.filter(
    (metadata) => !options.currentSourcePaths.has(metadata.sourcePath),
  )

  return {
    missingSessionDeletes: missingRows.filter(
      (metadata) => !options.currentSessionIds.has(metadata.sessionId),
    ),
    staleMetadataDeletes: missingRows.filter((metadata) =>
      options.currentSessionIds.has(metadata.sessionId),
    ),
  }
}
