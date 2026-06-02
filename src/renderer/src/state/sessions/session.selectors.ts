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
      sessions: nestSubagentChildren([...group.sessions].sort(sortSessionsByRecency)),
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

    return (
      session.id !== nextSession?.id ||
      session.updatedAt !== nextSession.updatedAt ||
      session.status !== nextSession.status ||
      session.title !== nextSession.title ||
      session.hasUserMessage !== nextSession.hasUserMessage ||
      session.lastActivityAt !== nextSession.lastActivityAt ||
      session.modelId !== nextSession.modelId ||
      session.derivationType !== nextSession.derivationType
    )
  })
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

function nestSubagentChildren(sessions: SessionPreview[]): SessionPreview[] {
  const childrenByParent = new Map<string, SessionPreview[]>()
  const topLevel: SessionPreview[] = []

  for (const session of sessions) {
    if (session.derivationType === 'subagent' && session.parentSessionId) {
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

  for (const session of topLevel) {
    result.push(session)
    const children = childrenByParent.get(session.id)
    if (children) {
      result.push(...children)
      childrenByParent.delete(session.id)
    }
  }

  for (const orphans of childrenByParent.values()) {
    result.push(...orphans)
  }

  return result
}
