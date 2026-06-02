import { batch, type Observable } from '@legendapp/state'
import type { FoundationRecordDelta, SessionRecord } from '../../../../shared/ipc/contracts'
import { createLocalStoragePort, type PersistencePort } from '../../platform/persistence'
import type { StoreEventBus } from '../events/store-event-bus'
import { createSessionPreview } from './session.factories'
import {
  readPersistedSessionPreferences,
  SESSION_PREFERENCES_STORAGE_KEY,
} from './session.persistence'
import {
  applyDisplayNameOverrides,
  selectArchivedProjects,
  selectPinnedSessions,
  selectProjectGroups,
  sessionPreviewChanged,
  sessionPreviewsChanged,
  sortSessionsByRecency,
} from './session.selectors'
import { createSessionState$ } from './session.state'
import type {
  PersistedSessionPreferences,
  ProjectSessionGroup,
  SessionPreview,
  SessionState,
} from './session.types'

export type {
  ExtendedSessionStatus,
  ProjectSessionGroup,
  SessionPreview,
  SessionStatus,
} from './session.types'

export class SessionStore {
  readonly state$: Observable<SessionState> = createSessionState$()
  private readonly persistence: PersistencePort

  constructor(persistence: PersistencePort = createLocalStoragePort()) {
    this.persistence = persistence
    this.hydratePreferences()
  }

  get sessions(): SessionPreview[] {
    return this.state$.sessions.get()
  }

  set sessions(value: SessionPreview[]) {
    this.setSessions(value)
  }

  get sessionsById(): Record<string, SessionPreview> {
    return this.state$.sessionsById.get()
  }

  get sessionsById$(): Observable<Record<string, SessionPreview>> {
    return this.state$.sessionsById
  }

  get selectedSessionId(): string {
    return this.state$.selectedSessionId.get()
  }

  set selectedSessionId(value: string) {
    this.state$.selectedSessionId.set(value)
  }

  get hasHydratedSessions(): boolean {
    return this.state$.hasHydratedSessions.get()
  }

  set hasHydratedSessions(value: boolean) {
    this.state$.hasHydratedSessions.set(value)
  }

  get missingSelectedSession(): boolean {
    return this.state$.missingSelectedSession.get()
  }

  set missingSelectedSession(value: boolean) {
    this.state$.missingSelectedSession.set(value)
  }

  get isDraftSelectionActive(): boolean {
    return this.state$.isDraftSelectionActive.get()
  }

  set isDraftSelectionActive(value: boolean) {
    this.state$.isDraftSelectionActive.set(value)
  }

  get pinnedSessionIds(): string[] {
    return this.state$.pinnedSessionIds.get()
  }

  set pinnedSessionIds(value: string[]) {
    this.state$.pinnedSessionIds.set(value)
  }

  get projectDisplayNames(): Record<string, string> {
    return this.state$.projectDisplayNames.get()
  }

  set projectDisplayNames(value: Record<string, string>) {
    this.state$.projectDisplayNames.set(value)
  }

  get archivedSessionIds(): string[] {
    return this.state$.archivedSessionIds.get()
  }

  set archivedSessionIds(value: string[]) {
    this.state$.archivedSessionIds.set(value)
  }

  get archivedProjectKeys(): string[] {
    return this.state$.archivedProjectKeys.get()
  }

  set archivedProjectKeys(value: string[]) {
    this.state$.archivedProjectKeys.set(value)
  }

  get selectedSession(): SessionPreview | undefined {
    return this.sessionsById[this.selectedSessionId]
  }

  get activeCount(): number {
    return this.sessions.filter((session) => session.status === 'active').length
  }

  get pinnedSessions(): SessionPreview[] {
    return selectPinnedSessions(
      this.sessions,
      this.pinnedSessionIds,
      this.archivedSessionIds,
      this.archivedProjectKeys,
    )
  }

  get projectGroups(): ProjectSessionGroup[] {
    return selectProjectGroups(this.sessions, this.archivedSessionIds, this.archivedProjectKeys)
  }

  get hasDeletedSelection(): boolean {
    return this.missingSelectedSession && !this.selectedSession
  }

  selectSession = (sessionId: string): void => {
    batch(() => {
      this.selectedSessionId = sessionId
      this.missingSelectedSession = false
      this.isDraftSelectionActive = false
    })
  }

  startDraftSelection = (): void => {
    batch(() => {
      this.selectedSessionId = ''
      this.missingSelectedSession = false
      this.isDraftSelectionActive = true
    })
  }

  cancelDraftSelection = (nextSessionId?: string): void => {
    batch(() => {
      this.isDraftSelectionActive = false

      if (nextSessionId) {
        this.selectSession(nextSessionId)
        return
      }

      this.selectedSessionId = ''
      this.missingSelectedSession = false
    })
  }

  clearSelection = (): void => {
    batch(() => {
      this.selectedSessionId = ''
      this.missingSelectedSession = false
    })
  }

  isSessionPinned = (sessionId: string): boolean => {
    return this.pinnedSessionIds.includes(sessionId)
  }

  session$ = (sessionId: string): Observable<SessionPreview> => {
    return this.state$.sessionsById[sessionId]
  }

  togglePinnedSession = (sessionId: string): void => {
    if (this.isSessionPinned(sessionId)) {
      this.pinnedSessionIds = this.pinnedSessionIds.filter((id) => id !== sessionId)
      this.persistPreferences()
      return
    }

    this.pinnedSessionIds = [...this.pinnedSessionIds, sessionId]
    this.persistPreferences()
  }

  // ── Archive ────────────────────────

  isSessionArchived = (sessionId: string): boolean => {
    return this.archivedSessionIds.includes(sessionId)
  }

  isProjectArchived = (projectKey: string): boolean => {
    return this.archivedProjectKeys.includes(projectKey)
  }

  archiveSession = (sessionId: string): void => {
    if (this.isSessionArchived(sessionId)) return
    this.archivedSessionIds = [...this.archivedSessionIds, sessionId]
    this.persistPreferences()
  }

  unarchiveSession = (sessionId: string): void => {
    this.archivedSessionIds = this.archivedSessionIds.filter((id) => id !== sessionId)
    this.persistPreferences()
  }

  archiveProject = (projectKey: string): void => {
    if (this.isProjectArchived(projectKey)) return
    this.archivedProjectKeys = [...this.archivedProjectKeys, projectKey]
    this.persistPreferences()
  }

  unarchiveProject = (projectKey: string): void => {
    this.archivedProjectKeys = this.archivedProjectKeys.filter((key) => key !== projectKey)
    this.persistPreferences()
  }

  get archivedSessions(): SessionPreview[] {
    const archivedSet = new Set(this.archivedSessionIds)
    return this.sessions.filter((s) => archivedSet.has(s.id))
  }

  get archivedProjects(): ProjectSessionGroup[] {
    return selectArchivedProjects(this.sessions, this.archivedProjectKeys)
  }

  setProjectDisplayName = (projectKey: string, value: string): void => {
    const trimmedValue = value.trim()

    batch(() => {
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
    })
    this.persistPreferences()
  }

  hydrateSessions = (sessionRecords: SessionRecord[]): void => {
    const nextSessions = applyDisplayNameOverrides(
      sessionRecords.map((session) => createSessionPreview(session)).sort(sortSessionsByRecency),
      this.projectDisplayNames,
    )
    this.applyNextSessions(nextSessions)
  }

  applySessionChanges = (delta: FoundationRecordDelta<SessionRecord>): void => {
    const nextById = new Map(this.sessions.map((session) => [session.id, session]))

    for (const removedId of delta.removedIds) {
      nextById.delete(removedId)
    }

    for (const sessionRecord of delta.upserted) {
      const nextSession = applyDisplayNameOverrides(
        [createSessionPreview(sessionRecord)],
        this.projectDisplayNames,
      )[0]

      if (nextSession) {
        nextById.set(nextSession.id, nextSession)
      }
    }

    this.applyNextSessions([...nextById.values()].sort(sortSessionsByRecency))
  }

  upsertSession = (sessionRecord: SessionRecord): void => {
    this.applySessionChanges({
      upserted: [sessionRecord],
      removedIds: [],
    })
  }

  connectToEventBus = (bus: StoreEventBus): (() => void) => {
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

    batch(() => {
      if (sessionsChanged) {
        this.setSessions(nextSessions)
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
    })
  }

  private setSessions(nextSessions: SessionPreview[]): void {
    batch(() => {
      this.syncSessionNodes(nextSessions)
      this.state$.sessions.set(nextSessions)
    })
  }

  private syncSessionNodes(nextSessions: SessionPreview[]): void {
    const nextIds = new Set<string>()
    const currentSessionsById = this.state$.sessionsById.peek() ?? {}

    for (const nextSession of nextSessions) {
      nextIds.add(nextSession.id)
      const currentSession = currentSessionsById[nextSession.id]

      if (!currentSession || sessionPreviewChanged(currentSession, nextSession)) {
        this.state$.sessionsById[nextSession.id].set(nextSession)
      }
    }

    for (const sessionId of Object.keys(currentSessionsById)) {
      if (!nextIds.has(sessionId)) {
        this.state$.sessionsById[sessionId].delete()
      }
    }
  }

  private hydratePreferences(): void {
    const persistedPreferences = readPersistedSessionPreferences(this.persistence)

    batch(() => {
      this.pinnedSessionIds = persistedPreferences.pinnedSessionIds ?? []
      this.archivedSessionIds = persistedPreferences.archivedSessionIds ?? []
      this.archivedProjectKeys = persistedPreferences.archivedProjectKeys ?? []
      this.projectDisplayNames = persistedPreferences.projectDisplayNames ?? {}
      this.sessions = applyDisplayNameOverrides(this.sessions, this.projectDisplayNames)
    })
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
