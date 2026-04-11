import { describe, expect, it } from 'vitest'
import type { SessionRecord, SyncMetadataRecord } from '../../../shared/ipc/contracts'

import {
  buildArtifactChecksum,
  partitionArtifactMetadataDeletes,
  shouldSkipArtifactSync,
  shouldUseAppendOnlyArtifactSync,
} from '../artifacts/changeDetection'

function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: overrides.id ?? 'session-1',
    projectId: overrides.projectId ?? null,
    projectWorkspacePath: overrides.projectWorkspacePath ?? '/tmp/project',
    projectDisplayName: overrides.projectDisplayName ?? null,
    hasUserMessage: overrides.hasUserMessage ?? false,
    title: overrides.title ?? 'Session',
    status: overrides.status ?? 'idle',
    transport: overrides.transport ?? 'artifacts',
    createdAt: overrides.createdAt ?? '2026-04-10T00:00:00.000Z',
    lastActivityAt: overrides.lastActivityAt ?? '2026-04-10T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-10T00:00:00.000Z',
    parentSessionId: overrides.parentSessionId ?? null,
    derivationType: overrides.derivationType ?? null,
  }
}

function createMetadata(overrides: Partial<SyncMetadataRecord> = {}): SyncMetadataRecord {
  return {
    sessionId: overrides.sessionId ?? 'session-1',
    sourcePath: overrides.sourcePath ?? '/tmp/session-1.jsonl',
    lastByteOffset: overrides.lastByteOffset ?? 120,
    lastMtimeMs: overrides.lastMtimeMs ?? 200,
    lastSyncedAt: overrides.lastSyncedAt ?? '2026-04-10T00:00:00.000Z',
    checksum: overrides.checksum ?? '120:200',
  }
}

describe('artifact change detection', () => {
  it('builds the artifact checksum from file size and floored mtime', () => {
    expect(buildArtifactChecksum({ size: 120, mtimeMs: 200.8 })).toBe('120:200')
  })

  it('skips unchanged readable artifacts', () => {
    expect(
      shouldSkipArtifactSync({
        tracked: createMetadata(),
        previousSession: createSession(),
        size: 120,
        mtimeMs: 200,
        currentChecksum: '120:200',
      }),
    ).toBe(true)
  })

  it('rescans unreadable artifacts when the checksum no longer matches the tracked failure', () => {
    expect(
      shouldSkipArtifactSync({
        tracked: createMetadata({ checksum: 'stale-unreadable' }),
        previousSession: createSession({
          title: 'Unreadable session',
          status: 'disconnected',
        }),
        size: 120,
        mtimeMs: 200,
        currentChecksum: '120:200',
      }),
    ).toBe(false)
  })

  it('allows append-only syncs only for healthy tracked sessions with growth beyond the tracked offset', () => {
    expect(
      shouldUseAppendOnlyArtifactSync({
        tracked: createMetadata({ lastByteOffset: 50 }),
        previousSession: createSession(),
        size: 120,
      }),
    ).toBe(true)

    expect(
      shouldUseAppendOnlyArtifactSync({
        tracked: createMetadata({ lastByteOffset: -1 }),
        previousSession: createSession(),
        size: 120,
      }),
    ).toBe(false)
    expect(
      shouldUseAppendOnlyArtifactSync({
        tracked: createMetadata({ lastByteOffset: 50 }),
        previousSession: createSession({
          title: 'Unreadable session',
          status: 'disconnected',
        }),
        size: 120,
      }),
    ).toBe(false)
  })

  it('partitions missing metadata into session deletes and stale metadata deletes', () => {
    const trackedMetadata = [
      createMetadata({
        sessionId: 'session-1',
        sourcePath: '/tmp/session-1.jsonl',
      }),
      createMetadata({
        sessionId: 'session-2',
        sourcePath: '/tmp/stale/session-2.jsonl',
      }),
    ]

    expect(
      partitionArtifactMetadataDeletes({
        trackedMetadata,
        currentSourcePaths: new Set<string>(),
        currentSessionIds: new Set(['session-2']),
      }),
    ).toEqual({
      missingSessionDeletes: [trackedMetadata[0]],
      staleMetadataDeletes: [trackedMetadata[1]],
    })
  })
})
