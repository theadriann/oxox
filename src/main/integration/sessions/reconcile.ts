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

  return chooseValue(currentValue, currentSource, nextValue, nextSource)
}

function isDaemonFallbackTitle(value: string): boolean {
  return value === 'Daemon session'
}

function mergeSessionRecord(
  current: SessionRecord,
  currentSource: SessionSource,
  next: SessionRecord,
  nextSource: SessionSource,
): SessionRecord {
  return {
    id: current.id,
    projectId: chooseValue(current.projectId, currentSource, next.projectId, nextSource),
    projectWorkspacePath: chooseValue(
      current.projectWorkspacePath,
      currentSource,
      next.projectWorkspacePath,
      nextSource,
    ),
    projectDisplayName: chooseValue(
      current.projectDisplayName,
      currentSource,
      next.projectDisplayName,
      nextSource,
    ),
    hasUserMessage: chooseValue(
      current.hasUserMessage,
      currentSource,
      next.hasUserMessage,
      nextSource,
    ),
    modelId: chooseValue(current.modelId, currentSource, next.modelId, nextSource),
    parentSessionId: chooseValue(
      current.parentSessionId,
      currentSource,
      next.parentSessionId,
      nextSource,
    ),
    derivationType: chooseValue(
      current.derivationType,
      currentSource,
      next.derivationType,
      nextSource,
    ),
    title: chooseTitleValue(current.title, currentSource, next.title, nextSource),
    status: chooseValue(current.status, currentSource, next.status, nextSource),
    transport: chooseValue(current.transport, currentSource, next.transport, nextSource),
    createdAt: chooseValue(current.createdAt, currentSource, next.createdAt, nextSource),
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
