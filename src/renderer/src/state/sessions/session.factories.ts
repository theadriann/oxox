import type { SessionRecord } from '../../../../shared/ipc/contracts'
import { deriveProjectLabel, toTimestamp } from '../../lib/sessionTime'
import type { ExtendedSessionStatus, SessionPreview } from './session.types'

function toSessionStatus(status: string): ExtendedSessionStatus {
  switch (status) {
    case 'disconnected':
    case 'idle':
    case 'reconnecting':
    case 'orphaned':
    case 'error':
    case 'waiting':
    case 'completed':
      return status
    default:
      return 'active'
  }
}

export function createSessionPreview(session: SessionRecord): SessionPreview {
  const projectWorkspacePath = session.projectWorkspacePath
  const projectKey = session.projectId ?? projectWorkspacePath ?? 'unassigned-project'
  const lastActivityAt = session.lastActivityAt ?? session.updatedAt

  return {
    id: session.id,
    title: session.title,
    projectKey,
    projectLabel: deriveProjectLabel(projectWorkspacePath, session.projectDisplayName),
    defaultProjectLabel: deriveProjectLabel(projectWorkspacePath, session.projectDisplayName),
    projectWorkspacePath,
    modelId: session.modelId ?? null,
    parentSessionId: session.parentSessionId ?? null,
    derivationType: session.derivationType ?? null,
    hasUserMessage: session.hasUserMessage ?? true,
    status: toSessionStatus(session.status),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastActivityAt,
    lastActivityTimestamp: toTimestamp(lastActivityAt ?? session.createdAt),
  }
}
