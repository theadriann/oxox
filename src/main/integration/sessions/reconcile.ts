import type { SessionRecord } from '../../../shared/ipc/contracts'

export interface ReconcileSessionRecordsOptions {
  cachedSessions: SessionRecord[]
  artifactSessions: SessionRecord[]
  daemonSessions: SessionRecord[]
}

const SOURCE_PRIORITY = {
  cache: 0,
  artifacts: 1,
  daemon: 2,
} as const

type SessionSource = keyof typeof SOURCE_PRIORITY

function getRecencyValue(session: SessionRecord): number {
  const candidates = [session.lastActivityAt, session.updatedAt, session.createdAt]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const timestamp = Date.parse(candidate)

    if (!Number.isNaN(timestamp)) {
      return timestamp
    }
  }

  return 0
}

function chooseValue<T>(
  currentValue: T,
  currentSource: SessionSource,
  nextValue: T,
  nextSource: SessionSource,
): T {
  const nextHasValue = nextValue !== null && nextValue !== undefined && nextValue !== ''

  if (!nextHasValue) {
    return currentValue
  }

  if (SOURCE_PRIORITY[nextSource] >= SOURCE_PRIORITY[currentSource]) {
    return nextValue
  }

  return currentValue
}

function hasValue<T>(value: T): boolean {
  return value !== null && value !== undefined && value !== ''
}

function chooseDurableValue<T>(
  currentValue: T,
  currentSource: SessionSource,
  nextValue: T,
  nextSource: SessionSource,
): T {
  if (!hasValue(nextValue)) {
    return currentValue
  }

  if (nextSource === 'daemon' && hasValue(currentValue)) {
    return currentValue
  }

  if (nextSource === 'artifacts' && currentSource !== 'artifacts') {
    return nextValue
  }

  return chooseValue(currentValue, currentSource, nextValue, nextSource)
}

function chooseTitleValue(
  currentValue: string,
  currentSource: SessionSource,
  nextValue: string,
  nextSource: SessionSource,
): string {
  const nextHasValue = nextValue !== ''

  if (!nextHasValue) {
    return currentValue
  }

  if (
    currentSource === 'artifacts' &&
    nextSource === 'daemon' &&
    currentValue !== '' &&
    isDaemonFallbackTitle(nextValue)
  ) {
    return currentValue
  }

  if (
    currentSource === 'daemon' &&
    nextSource === 'artifacts' &&
    nextValue !== '' &&
    isDaemonFallbackTitle(currentValue)
  ) {
    return nextValue
  }

  if (nextSource === 'daemon' && currentValue !== '' && !isLocalPlaceholderTitle(currentValue)) {
    return currentValue
  }

  if (nextSource === 'daemon' && isLocalPlaceholderTitle(currentValue)) {
    return nextValue
  }

  return chooseDurableValue(currentValue, currentSource, nextValue, nextSource)
}

function isDaemonFallbackTitle(value: string): boolean {
  return value === 'Daemon session'
}

function isLocalPlaceholderTitle(value: string): boolean {
  return value === 'Untitled session'
}

function mergeSessionRecord(
  current: SessionRecord,
  currentSource: SessionSource,
  next: SessionRecord,
  nextSource: SessionSource,
): SessionRecord {
  return {
    id: current.id,
    projectId: chooseDurableValue(current.projectId, currentSource, next.projectId, nextSource),
    projectWorkspacePath: chooseDurableValue(
      current.projectWorkspacePath,
      currentSource,
      next.projectWorkspacePath,
      nextSource,
    ),
    projectDisplayName: chooseDurableValue(
      current.projectDisplayName,
      currentSource,
      next.projectDisplayName,
      nextSource,
    ),
    hasUserMessage: chooseDurableValue(
      current.hasUserMessage,
      currentSource,
      next.hasUserMessage,
      nextSource,
    ),
    modelId: chooseDurableValue(current.modelId, currentSource, next.modelId, nextSource),
    parentSessionId: chooseDurableValue(
      current.parentSessionId,
      currentSource,
      next.parentSessionId,
      nextSource,
    ),
    derivationType: chooseDurableValue(
      current.derivationType,
      currentSource,
      next.derivationType,
      nextSource,
    ),
    owner: chooseDurableValue(current.owner, currentSource, next.owner, nextSource),
    messageCount: chooseValue(current.messageCount, currentSource, next.messageCount, nextSource),
    isFavorite: chooseDurableValue(current.isFavorite, currentSource, next.isFavorite, nextSource),
    decompSessionType: chooseDurableValue(
      current.decompSessionType,
      currentSource,
      next.decompSessionType,
      nextSource,
    ),
    decompMissionId: chooseDurableValue(
      current.decompMissionId,
      currentSource,
      next.decompMissionId,
      nextSource,
    ),
    title: chooseTitleValue(current.title, currentSource, next.title, nextSource),
    status: chooseValue(current.status, currentSource, next.status, nextSource),
    transport: chooseValue(current.transport, currentSource, next.transport, nextSource),
    createdAt: chooseDurableValue(current.createdAt, currentSource, next.createdAt, nextSource),
    lastActivityAt: chooseValue(
      current.lastActivityAt,
      currentSource,
      next.lastActivityAt,
      nextSource,
    ),
    updatedAt: chooseValue(current.updatedAt, currentSource, next.updatedAt, nextSource),
  }
}

function mergeSessions(
  target: Map<string, { session: SessionRecord; source: SessionSource }>,
  sessions: SessionRecord[],
  source: SessionSource,
): void {
  for (const session of sessions) {
    const current = target.get(session.id)

    if (!current) {
      target.set(session.id, { session, source })
      continue
    }

    target.set(session.id, {
      session: mergeSessionRecord(current.session, current.source, session, source),
      source: SOURCE_PRIORITY[source] >= SOURCE_PRIORITY[current.source] ? source : current.source,
    })
  }
}

export function reconcileSessionRecords({
  cachedSessions,
  artifactSessions,
  daemonSessions,
}: ReconcileSessionRecordsOptions): SessionRecord[] {
  const sessionsById = new Map<string, { session: SessionRecord; source: SessionSource }>()

  mergeSessions(sessionsById, cachedSessions, 'cache')
  mergeSessions(sessionsById, artifactSessions, 'artifacts')
  mergeSessions(sessionsById, daemonSessions, 'daemon')

  return [...sessionsById.values()]
    .map((entry) => entry.session)
    .sort((left, right) => {
      const recencyDelta = getRecencyValue(right) - getRecencyValue(left)

      if (recencyDelta !== 0) {
        return recencyDelta
      }

      return left.id.localeCompare(right.id)
    })
}
