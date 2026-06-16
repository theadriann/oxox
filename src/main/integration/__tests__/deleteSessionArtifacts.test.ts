import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { deleteSessionArtifacts } from '../artifacts/deleteSessionArtifacts'

describe('deleteSessionArtifacts', () => {
  const cleanup: string[] = []

  afterEach(() => {
    while (cleanup.length > 0) {
      rmSync(cleanup.pop() ?? '', { force: true, recursive: true })
    }
  })

  it('removes transcript sidecars, global snapshot manifest, and favorites references', () => {
    const factoryRoot = mkdtempSync(join(tmpdir(), 'oxox-delete-artifacts-'))
    cleanup.push(factoryRoot)
    const sessionsRoot = join(factoryRoot, 'sessions')
    const projectBucket = join(sessionsRoot, '-tmp-project')
    const manifestsRoot = join(factoryRoot, 'snapshots', 'manifests')
    mkdirSync(projectBucket, { recursive: true })
    mkdirSync(manifestsRoot, { recursive: true })

    const transcriptPath = join(projectBucket, 'session-delete.jsonl')
    const settingsPath = join(projectBucket, 'session-delete.settings.json')
    const localSnapshotsPath = join(projectBucket, 'session-delete.snapshots.json')
    const globalSnapshotsPath = join(manifestsRoot, 'session-delete.snapshots.json')
    const keepTranscriptPath = join(projectBucket, 'session-keep.jsonl')
    const favoritesPath = join(sessionsRoot, '.favorites')

    writeFileSync(transcriptPath, '{}\n')
    writeFileSync(settingsPath, '{}')
    writeFileSync(localSnapshotsPath, '{}')
    writeFileSync(globalSnapshotsPath, '{}')
    writeFileSync(keepTranscriptPath, '{}\n')
    writeFileSync(favoritesPath, JSON.stringify(['session-delete', 'session-keep']))

    const result = deleteSessionArtifacts({
      sessionsRoot,
      sessionId: 'session-delete',
      sourcePath: transcriptPath,
    })

    expect(result.transcriptPath).toBe(transcriptPath)
    expect(result.deletedPaths.sort()).toEqual(
      [globalSnapshotsPath, localSnapshotsPath, settingsPath, transcriptPath].sort(),
    )
    expect(existsSync(transcriptPath)).toBe(false)
    expect(existsSync(settingsPath)).toBe(false)
    expect(existsSync(localSnapshotsPath)).toBe(false)
    expect(existsSync(globalSnapshotsPath)).toBe(false)
    expect(existsSync(keepTranscriptPath)).toBe(true)
    expect(JSON.parse(readFileSync(favoritesPath, 'utf8'))).toEqual(['session-keep'])
  })
})
