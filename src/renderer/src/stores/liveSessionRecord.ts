import type { LiveSessionSnapshot, SessionRecord } from '../../../shared/ipc/contracts'

import { deriveProjectLabel } from '../lib/sessionTime'
import type { SessionPreview } from './SessionStore'

export function toSessionRecord(
  snapshot: LiveSessionSnapshot,
  existingSession?: SessionPreview,
): SessionRecord {
  const timestamp = new Date().toISOString()
  const activityTimestamp = resolveSnapshotActivityTimestamp(snapshot, existingSession, timestamp)
  const projectWorkspacePath =
    existingSession?.projectWorkspacePath ?? snapshot.projectWorkspacePath
  const defaultProjectLabel = deriveProjectLabel(projectWorkspacePath, null)
  const projectDisplayName =
    existingSession && existingSession.projectLabel !== defaultProjectLabel
      ? existingSession.projectLabel
      : null

  return {
    id: snapshot.sessionId,
    projectId: existingSession?.projectKey ?? snapshot.projectWorkspacePath,
    projectWorkspacePath,
    projectDisplayName,
    modelId: snapshot.settings.modelId ?? existingSession?.modelId ?? null,
    parentSessionId: snapshot.parentSessionId,
    derivationType: existingSession?.derivationType ?? null,
    title: snapshot.title,
    status: snapshot.status,
    transport: snapshot.transport,
    createdAt: existingSession?.createdAt ?? timestamp,
    lastActivityAt: activityTimestamp,
    updatedAt: existingSession?.updatedAt ?? activityTimestamp,
  }
}

function resolveSnapshotActivityTimestamp(
  snapshot: LiveSessionSnapshot,
  existingSession: SessionPreview | undefined,
  fallbackTimestamp: string,
): string {
  const lastEventWithTimestamp = [...snapshot.events]
    .reverse()
    .find((event) => typeof event.occurredAt === 'string' && event.occurredAt.length > 0)

  return (
    lastEventWithTimestamp?.occurredAt ??
    existingSession?.lastActivityAt ??
    existingSession?.updatedAt ??
    fallbackTimestamp
  )
}
