import { deriveProjectLabel } from '../../lib/sessionTime'
import type { ProjectSessionGroup, SessionPreview } from './session.types'

export function selectPinnedSessions(
  sessions: SessionPreview[],
  pinnedSessionIds: string[],
  archivedSessionIds: string[],
  archivedProjectKeys: string[],
): SessionPreview[] {
  const archivedSessionSet = new Set(archivedSessionIds)
  const archivedProjectSet = new Set(archivedProjectKeys)

  return sessions.filter(
    (session) =>
      shouldSurfaceInSidebar(session) &&
      pinnedSessionIds.includes(session.id) &&
      !archivedSessionSet.has(session.id) &&
      !archivedProjectSet.has(session.projectKey),
  )
}

export function selectProjectGroups(
  sessions: SessionPreview[],
  archivedSessionIds: string[],
  archivedProjectKeys: string[],
): ProjectSessionGroup[] {
  const groups = new Map<string, ProjectSessionGroup>()
  const archivedSessionSet = new Set(archivedSessionIds)
  const archivedProjectSet = new Set(archivedProjectKeys)

  for (const session of sessions) {
    if (archivedSessionSet.has(session.id)) continue
    if (archivedProjectSet.has(session.projectKey)) continue
    if (!shouldSurfaceInSidebar(session)) continue

    upsertProjectGroup(groups, session)
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      sessions: nestDerivedSessions([...group.sessions].sort(sortSessionsByRecency)),
    }))
    .sort((left, right) => right.latestActivityAt - left.latestActivityAt)
}

export function selectArchivedProjects(
  sessions: SessionPreview[],
  archivedProjectKeys: string[],
): ProjectSessionGroup[] {
  const archivedSet = new Set(archivedProjectKeys)
  const groups = new Map<string, ProjectSessionGroup>()

  for (const session of sessions) {
    if (!archivedSet.has(session.projectKey)) continue
    upsertProjectGroup(groups, session)
  }

  return Array.from(groups.values()).sort((a, b) => b.latestActivityAt - a.latestActivityAt)
}

export function sortSessionsByRecency(left: SessionPreview, right: SessionPreview): number {
  return right.lastActivityTimestamp - left.lastActivityTimestamp
}

export function applyDisplayNameOverrides(
  sessions: SessionPreview[],
  projectDisplayNames: Record<string, string>,
): SessionPreview[] {
  return sessions.map((session) => ({
    ...session,
    projectLabel: deriveProjectLabel(
      session.projectWorkspacePath,
      projectDisplayNames[session.projectKey] ??
        session.defaultProjectLabel ??
        session.projectLabel,
    ),
  }))
}

export function sessionPreviewsChanged(
  previousSessions: SessionPreview[],
  nextSessions: SessionPreview[],
): boolean {
  if (previousSessions.length !== nextSessions.length) {
    return true
  }

  return previousSessions.some((session, index) => {
    const nextSession = nextSessions[index]

    return !nextSession || sessionPreviewChanged(session, nextSession)
  })
}

export function sessionPreviewChanged(previous: SessionPreview, next: SessionPreview): boolean {
  return (
    previous.id !== next.id ||
    previous.title !== next.title ||
    previous.projectKey !== next.projectKey ||
    previous.projectLabel !== next.projectLabel ||
    previous.defaultProjectLabel !== next.defaultProjectLabel ||
    previous.projectWorkspacePath !== next.projectWorkspacePath ||
    previous.modelId !== next.modelId ||
    previous.parentSessionId !== next.parentSessionId ||
    previous.derivationType !== next.derivationType ||
    previous.hasUserMessage !== next.hasUserMessage ||
    previous.status !== next.status ||
    previous.createdAt !== next.createdAt ||
    previous.updatedAt !== next.updatedAt ||
    previous.lastActivityAt !== next.lastActivityAt ||
    previous.lastActivityTimestamp !== next.lastActivityTimestamp
  )
}

function shouldSurfaceInSidebar(session: SessionPreview): boolean {
  return session.hasUserMessage || session.derivationType === 'compact'
}

function upsertProjectGroup(
  groups: Map<string, ProjectSessionGroup>,
  session: SessionPreview,
): void {
  const existing = groups.get(session.projectKey)

  if (existing) {
    existing.sessions.push(session)
    existing.latestActivityAt = Math.max(existing.latestActivityAt, session.lastActivityTimestamp)
    return
  }

  groups.set(session.projectKey, {
    key: session.projectKey,
    label: session.projectLabel,
    workspacePath: session.projectWorkspacePath,
    latestActivityAt: session.lastActivityTimestamp,
    sessions: [session],
  })
}

function nestDerivedSessions(sessions: SessionPreview[]): SessionPreview[] {
  const sessionIds = new Set(sessions.map((session) => session.id))
  const childrenByParent = new Map<string, SessionPreview[]>()
  const topLevel: SessionPreview[] = []

  for (const session of sessions) {
    if (
      session.derivationType &&
      session.derivationType !== 'fork' &&
      session.parentSessionId &&
      sessionIds.has(session.parentSessionId)
    ) {
      const siblings = childrenByParent.get(session.parentSessionId)
      if (siblings) {
        siblings.push(session)
      } else {
        childrenByParent.set(session.parentSessionId, [session])
      }
    } else {
      topLevel.push(session)
    }
  }

  if (childrenByParent.size === 0) {
    return sessions
  }

  const result: SessionPreview[] = []
  const visited = new Set<string>()

  const appendSession = (session: SessionPreview): void => {
    if (visited.has(session.id)) {
      return
    }

    visited.add(session.id)
    result.push(session)

    const children = childrenByParent.get(session.id)
    if (children) {
      for (const child of children) {
        appendSession(child)
      }
      childrenByParent.delete(session.id)
    }
  }

  for (const session of topLevel) {
    appendSession(session)
  }

  for (const session of sessions) {
    appendSession(session)
  }

  return result
}
