import { makeAutoObservable } from 'mobx'

import type { FoundationRecordDelta, SessionRecord } from '../../../shared/ipc/contracts'
import { deriveProjectLabel, toTimestamp } from '../lib/sessionTime'
import { createLocalStoragePort, type PersistencePort } from '../platform/persistence'
import type { StoreEventBus } from './storeEventBus'

const SESSION_PREFERENCES_STORAGE_KEY = 'oxox.session.preferences'

export type SessionStatus = 'active' | 'waiting' | 'completed'
export type ExtendedSessionStatus =
  | SessionStatus
  | 'idle'
  | 'disconnected'
  | 'reconnecting'
  | 'orphaned'
  | 'error'

export interface SessionPreview {
  id: string
  title: string
  projectKey: string
  projectLabel: string
  defaultProjectLabel?: string
  projectWorkspacePath: string | null
  modelId?: string | null
  parentSessionId: string | null
  derivationType: string | null
  hasUserMessage: boolean
  status: ExtendedSessionStatus
  createdAt: string
  updatedAt: string
  lastActivityAt: string | null
  lastActivityTimestamp: number
}

export interface ProjectSessionGroup {
  key: string
  label: string
  workspacePath: string | null
  latestActivityAt: number
  sessions: SessionPreview[]
}

interface PersistedSessionPreferences {
  pinnedSessionIds?: string[]
  projectDisplayNames?: Record<string, string>
  archivedSessionIds?: string[]
  archivedProjectKeys?: string[]
}

export class SessionStore {
  sessions: SessionPreview[] = []
  selectedSessionId = ''
  hasHydratedSessions = false
  missingSelectedSession = false
  isDraftSelectionActive = false
  pinnedSessionIds: string[] = []
  projectDisplayNames: Record<string, string> = {}
  archivedSessionIds: string[] = []
  archivedProjectKeys: string[] = []
  private readonly persistence: PersistencePort

  constructor(persistence: PersistencePort = createLocalStoragePort()) {
    this.persistence = persistence
    makeAutoObservable(this, { persistence: false }, { autoBind: true })
    this.hydratePreferences()
  }

  get selectedSession(): SessionPreview | undefined {
    return this.sessions.find((session) => session.id === this.selectedSessionId)
  }

  get activeCount(): number {
    return this.sessions.filter((session) => session.status === 'active').length
  }

  get pinnedSessions(): SessionPreview[] {
    const archivedSessionSet = new Set(this.archivedSessionIds)
    const archivedProjectSet = new Set(this.archivedProjectKeys)

    return this.sessions.filter(
      (session) =>
        session.hasUserMessage &&
        this.pinnedSessionIds.includes(session.id) &&
        !archivedSessionSet.has(session.id) &&
        !archivedProjectSet.has(session.projectKey),
    )
  }

  get projectGroups(): ProjectSessionGroup[] {
    const groups = new Map<string, ProjectSessionGroup>()
    const archivedSessionSet = new Set(this.archivedSessionIds)
    const archivedProjectSet = new Set(this.archivedProjectKeys)

    for (const session of this.sessions) {
      if (archivedSessionSet.has(session.id)) continue
      if (archivedProjectSet.has(session.projectKey)) continue
      if (!session.hasUserMessage) continue

      const existing = groups.get(session.projectKey)

      if (existing) {
        existing.sessions.push(session)
        existing.latestActivityAt = Math.max(
          existing.latestActivityAt,
          session.lastActivityTimestamp,
        )
        continue
      }

      groups.set(session.projectKey, {
        key: session.projectKey,
        label: session.projectLabel,
        workspacePath: session.projectWorkspacePath,
        latestActivityAt: session.lastActivityTimestamp,
        sessions: [session],
      })
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        sessions: nestSubagentChildren([...group.sessions].sort(sortSessionsByRecency)),
      }))
      .sort((left, right) => right.latestActivityAt - left.latestActivityAt)
  }

  get hasDeletedSelection(): boolean {
    return this.missingSelectedSession && !this.selectedSession
  }

  selectSession(sessionId: string): void {
    this.selectedSessionId = sessionId
    this.missingSelectedSession = false
    this.isDraftSelectionActive = false
  }

  startDraftSelection(): void {
    this.selectedSessionId = ''
    this.missingSelectedSession = false
    this.isDraftSelectionActive = true
  }

  cancelDraftSelection(nextSessionId?: string): void {
    this.isDraftSelectionActive = false

    if (nextSessionId) {
      this.selectSession(nextSessionId)
      return
    }

    this.selectedSessionId = ''
    this.missingSelectedSession = false
  }

  clearSelection(): void {
    this.selectedSessionId = ''
    this.missingSelectedSession = false
  }

  isSessionPinned(sessionId: string): boolean {
    return this.pinnedSessionIds.includes(sessionId)
  }

  togglePinnedSession(sessionId: string): void {
    if (this.isSessionPinned(sessionId)) {
      this.pinnedSessionIds = this.pinnedSessionIds.filter((id) => id !== sessionId)
      this.persistPreferences()
      return
    }

    this.pinnedSessionIds = [...this.pinnedSessionIds, sessionId]
    this.persistPreferences()
  }

  // ── Archive ────────────────────────

  isSessionArchived(sessionId: string): boolean {
    return this.archivedSessionIds.includes(sessionId)
  }

  isProjectArchived(projectKey: string): boolean {
    return this.archivedProjectKeys.includes(projectKey)
  }

  archiveSession(sessionId: string): void {
    if (this.isSessionArchived(sessionId)) return
    this.archivedSessionIds = [...this.archivedSessionIds, sessionId]
    this.persistPreferences()
  }

  unarchiveSession(sessionId: string): void {
    this.archivedSessionIds = this.archivedSessionIds.filter((id) => id !== sessionId)
    this.persistPreferences()
  }

  archiveProject(projectKey: string): void {
    if (this.isProjectArchived(projectKey)) return
    this.archivedProjectKeys = [...this.archivedProjectKeys, projectKey]
    this.persistPreferences()
  }

  unarchiveProject(projectKey: string): void {
    this.archivedProjectKeys = this.archivedProjectKeys.filter((key) => key !== projectKey)
    this.persistPreferences()
  }

  get archivedSessions(): SessionPreview[] {
    const archivedSet = new Set(this.archivedSessionIds)
    return this.sessions.filter((s) => archivedSet.has(s.id))
  }

  get archivedProjects(): ProjectSessionGroup[] {
    const archivedSet = new Set(this.archivedProjectKeys)
    const groups = new Map<string, ProjectSessionGroup>()
    for (const session of this.sessions) {
      if (!archivedSet.has(session.projectKey)) continue
      const existing = groups.get(session.projectKey)
      if (existing) {
        existing.sessions.push(session)
        existing.latestActivityAt = Math.max(
          existing.latestActivityAt,
          session.lastActivityTimestamp,
        )
        continue
      }
      groups.set(session.projectKey, {
        key: session.projectKey,
        label: session.projectLabel,
        workspacePath: session.projectWorkspacePath,
        latestActivityAt: session.lastActivityTimestamp,
        sessions: [session],
      })
    }
    return Array.from(groups.values()).sort((a, b) => b.latestActivityAt - a.latestActivityAt)
  }

  setProjectDisplayName(projectKey: string, value: string): void {
    const trimmedValue = value.trim()

    if (trimmedValue) {
      this.projectDisplayNames = {
        ...this.projectDisplayNames,
        [projectKey]: trimmedValue,
      }
    } else {
      const remainingDisplayNames = { ...this.projectDisplayNames }
      delete remainingDisplayNames[projectKey]
      this.projectDisplayNames = remainingDisplayNames
    }

    this.sessions = applyDisplayNameOverrides(this.sessions, this.projectDisplayNames)
    this.persistPreferences()
  }

  hydrateSessions(sessionRecords: SessionRecord[]): void {
    const nextSessions = applyDisplayNameOverrides(
      sessionRecords.map((session) => toSessionPreview(session)).sort(sortSessionsByRecency),
      this.projectDisplayNames,
    )
    this.applyNextSessions(nextSessions)
  }

  applySessionChanges(delta: FoundationRecordDelta<SessionRecord>): void {
    const nextById = new Map(this.sessions.map((session) => [session.id, session]))

    for (const removedId of delta.removedIds) {
      nextById.delete(removedId)
    }

    for (const sessionRecord of delta.upserted) {
      const nextSession = applyDisplayNameOverrides(
        [toSessionPreview(sessionRecord)],
        this.projectDisplayNames,
      )[0]

      if (nextSession) {
        nextById.set(nextSession.id, nextSession)
      }
    }

    this.applyNextSessions([...nextById.values()].sort(sortSessionsByRecency))
  }

  upsertSession(sessionRecord: SessionRecord): void {
    this.applySessionChanges({
      upserted: [sessionRecord],
      removedIds: [],
    })
  }

  connectToEventBus(bus: StoreEventBus): () => void {
    const disposers = [
      bus.subscribe('session-upsert', ({ record }) => {
        this.upsertSession(record)
      }),
      bus.subscribe('sessions-hydrate', ({ sessions }) => {
        this.hydrateSessions(sessions)
      }),
      bus.subscribe('session-changes-apply', ({ changes }) => {
        this.applySessionChanges(changes)
      }),
    ]

    return () => {
      for (const dispose of disposers) {
        dispose()
      }
    }
  }

  private applyNextSessions(nextSessions: SessionPreview[]): void {
    const sessionsChanged = sessionPreviewsChanged(this.sessions, nextSessions)
    const currentSessions = sessionsChanged ? nextSessions : this.sessions
    const hadSelectionBeforeHydration = this.hasHydratedSessions
      ? this.sessions.some((session) => session.id === this.selectedSessionId)
      : false
    const stillHasSelectedSession = currentSessions.some(
      (session) => session.id === this.selectedSessionId,
    )

    if (sessionsChanged) {
      this.sessions = nextSessions
    }

    this.hasHydratedSessions = true
    this.missingSelectedSession =
      hadSelectionBeforeHydration && this.selectedSessionId.length > 0 && !stillHasSelectedSession

    if (this.isDraftSelectionActive && this.selectedSessionId.length === 0) {
      return
    }

    if (!this.selectedSessionId) {
      this.selectedSessionId = currentSessions[0]?.id ?? ''
      return
    }

    if (!stillHasSelectedSession && !this.missingSelectedSession) {
      this.selectedSessionId = currentSessions[0]?.id ?? ''
    }
  }

  private hydratePreferences(): void {
    const persistedPreferences = readPersistedSessionPreferences(this.persistence)

    this.pinnedSessionIds = persistedPreferences.pinnedSessionIds ?? []
    this.archivedSessionIds = persistedPreferences.archivedSessionIds ?? []
    this.archivedProjectKeys = persistedPreferences.archivedProjectKeys ?? []
    this.projectDisplayNames = persistedPreferences.projectDisplayNames ?? {}
    this.sessions = applyDisplayNameOverrides(this.sessions, this.projectDisplayNames)
  }

  private persistPreferences(): void {
    const preferences: PersistedSessionPreferences = {
      pinnedSessionIds: this.pinnedSessionIds,
      projectDisplayNames: this.projectDisplayNames,
      archivedSessionIds: this.archivedSessionIds,
      archivedProjectKeys: this.archivedProjectKeys,
    }

    this.persistence.set(SESSION_PREFERENCES_STORAGE_KEY, preferences)
  }
}

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

function toSessionPreview(session: SessionRecord): SessionPreview {
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

function sortSessionsByRecency(left: SessionPreview, right: SessionPreview): number {
  return right.lastActivityTimestamp - left.lastActivityTimestamp
}

function applyDisplayNameOverrides(
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

function sessionPreviewsChanged(
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

function readPersistedSessionPreferences(
  persistence: PersistencePort,
): PersistedSessionPreferences {
  try {
    const parsed = persistence.get<PersistedSessionPreferences>(SESSION_PREFERENCES_STORAGE_KEY, {})

    return {
      pinnedSessionIds: Array.isArray(parsed.pinnedSessionIds)
        ? parsed.pinnedSessionIds.filter((value): value is string => typeof value === 'string')
        : [],
      projectDisplayNames: Object.fromEntries(
        Object.entries(parsed.projectDisplayNames ?? {}).filter(
          (entry): entry is [string, string] =>
            typeof entry[0] === 'string' &&
            typeof entry[1] === 'string' &&
            entry[1].trim().length > 0,
        ),
      ),
      archivedSessionIds: Array.isArray(parsed.archivedSessionIds)
        ? parsed.archivedSessionIds.filter((value): value is string => typeof value === 'string')
        : [],
      archivedProjectKeys: Array.isArray(parsed.archivedProjectKeys)
        ? parsed.archivedProjectKeys.filter((value): value is string => typeof value === 'string')
        : [],
    }
  } catch {
    return {}
  }
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
