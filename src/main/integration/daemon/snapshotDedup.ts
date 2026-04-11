import type { DaemonConnectionSnapshot, SessionRecord } from '../../../shared/ipc/contracts'
import { daemonSnapshotEqual } from '../../../shared/ipc/foundationUpdates'

export function areDaemonSessionsEqual(left: SessionRecord[], right: SessionRecord[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((session, index) => {
    const other = right[index]

    return (
      other !== undefined &&
      session.id === other.id &&
      session.projectId === other.projectId &&
      session.projectWorkspacePath === other.projectWorkspacePath &&
      session.projectDisplayName === other.projectDisplayName &&
      session.hasUserMessage === other.hasUserMessage &&
      session.title === other.title &&
      session.status === other.status &&
      session.transport === other.transport &&
      session.createdAt === other.createdAt &&
      session.lastActivityAt === other.lastActivityAt &&
      session.updatedAt === other.updatedAt
    )
  })
}

export function getDaemonSnapshotUpdate(
  current: DaemonConnectionSnapshot,
  partial: Partial<DaemonConnectionSnapshot>,
): {
  changed: boolean
  nextSnapshot: DaemonConnectionSnapshot
} {
  const nextSnapshot: DaemonConnectionSnapshot = {
    status: partial.status ?? current.status,
    connectedPort:
      partial.connectedPort === undefined ? current.connectedPort : partial.connectedPort,
    lastError: partial.lastError === undefined ? current.lastError : partial.lastError,
    lastConnectedAt:
      partial.lastConnectedAt === undefined ? current.lastConnectedAt : partial.lastConnectedAt,
    lastSyncAt: partial.lastSyncAt === undefined ? current.lastSyncAt : partial.lastSyncAt,
    nextRetryDelayMs:
      partial.nextRetryDelayMs === undefined ? current.nextRetryDelayMs : partial.nextRetryDelayMs,
  }

  if (daemonSnapshotEqual(current, nextSnapshot)) {
    return {
      changed: false,
      nextSnapshot: current,
    }
  }

  return {
    changed: true,
    nextSnapshot,
  }
}
