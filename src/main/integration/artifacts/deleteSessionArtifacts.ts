import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'

import { findSessionTranscriptPath } from '../transcripts/mutations'

const TRANSCRIPT_EXTENSION = '.jsonl'
const SETTINGS_SUFFIX = '.settings.json'
const SNAPSHOTS_SUFFIX = '.snapshots.json'

export interface DeleteSessionArtifactsOptions {
  sessionsRoot: string
  sessionId: string
  sourcePath?: string | null
}

export interface DeleteSessionArtifactsResult {
  deletedPaths: string[]
  transcriptPath: string | null
}

export function deleteSessionArtifacts({
  sessionsRoot,
  sessionId,
  sourcePath,
}: DeleteSessionArtifactsOptions): DeleteSessionArtifactsResult {
  const transcriptPath = sourcePath ?? findSessionTranscriptPath(sessionsRoot, sessionId)
  const deletedPaths: string[] = []

  if (transcriptPath) {
    const sessionArtifactBasePath = join(
      dirname(transcriptPath),
      basename(transcriptPath, TRANSCRIPT_EXTENSION),
    )

    for (const filePath of [
      transcriptPath,
      `${sessionArtifactBasePath}${SETTINGS_SUFFIX}`,
      `${sessionArtifactBasePath}${SNAPSHOTS_SUFFIX}`,
      resolveGlobalSnapshotsSidecarPath(sessionId, transcriptPath),
    ]) {
      if (safeUnlink(filePath)) {
        deletedPaths.push(filePath)
      }
    }
  }

  removeSessionFromFavorites(sessionsRoot, sessionId)

  return { deletedPaths, transcriptPath }
}

function safeUnlink(filePath: string): boolean {
  try {
    unlinkSync(filePath)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

function removeSessionFromFavorites(sessionsRoot: string, sessionId: string): void {
  const favoritesPath = join(sessionsRoot, '.favorites')

  if (!existsSync(favoritesPath)) {
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(favoritesPath, 'utf8'))
  } catch {
    return
  }
  if (!Array.isArray(parsed)) {
    return
  }

  const nextFavorites = parsed.filter((value) => value !== sessionId)
  if (nextFavorites.length === parsed.length) {
    return
  }

  writeFileSync(favoritesPath, `${JSON.stringify(nextFavorites, null, 2)}\n`, 'utf8')
}

function resolveGlobalSnapshotsSidecarPath(sessionId: string, sourcePath: string): string {
  const factorySessionsSegment = `${sep}.factory${sep}sessions${sep}`
  const segmentIndex = sourcePath.indexOf(factorySessionsSegment)

  if (segmentIndex >= 0) {
    return join(
      sourcePath.slice(0, segmentIndex + `${sep}.factory`.length),
      'snapshots',
      'manifests',
      `${sessionId}${SNAPSHOTS_SUFFIX}`,
    )
  }

  const sessionsSegment = `${sep}sessions${sep}`
  const sessionsIndex = sourcePath.indexOf(sessionsSegment)

  if (sessionsIndex >= 0) {
    return join(
      sourcePath.slice(0, sessionsIndex),
      'snapshots',
      'manifests',
      `${sessionId}${SNAPSHOTS_SUFFIX}`,
    )
  }

  return join(homedir(), '.factory', 'snapshots', 'manifests', `${sessionId}${SNAPSHOTS_SUFFIX}`)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
