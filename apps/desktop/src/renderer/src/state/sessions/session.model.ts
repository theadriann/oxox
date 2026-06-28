import { batch, type Observable } from '@legendapp/state'
import type {
  FoundationRecordDelta,
  SessionFolderAssignmentRecord,
  SessionFolderMetadata,
  SessionRecord,
} from '../../../../shared/ipc/contracts'
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
  SessionFolder,
  SessionPreview,
  SessionState,
} from './session.types'

export type {
  ExtendedSessionStatus,
  ProjectSessionGroup,
  SessionFolder,
  SessionPreview,
  SessionStatus,
} from './session.types'

export interface SessionFolderPersistenceBridge {
  mergeSessionFolderMetadata?: (metadata: SessionFolderMetadata) => Promise<void>
  upsertSessionFolder?: (folder: SessionFolder) => Promise<void>
  deleteSessionFolder?: (folderId: string) => Promise<void>
  setSessionFolderAssignment?: (assignment: SessionFolderAssignmentRecord) => Promise<void>
  removeSessionFolderAssignment?: (sessionId: string) => Promise<void>
}

export class SessionStore {
  readonly state$: Observable<SessionState> = createSessionState$()
  private readonly persistence: PersistencePort
  private readonly folderPersistence: SessionFolderPersistenceBridge | null
  private folderPersistenceQueue: Promise<void> = Promise.resolve()
  private legacySessionFolderMetadata: SessionFolderMetadata | null = null

  constructor(
    persistence: PersistencePort = createLocalStoragePort(),
    folderPersistence: SessionFolderPersistenceBridge | null = null,
  ) {
    this.persistence = persistence
    this.folderPersistence = folderPersistence
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

  get sessionFolders(): SessionFolder[] {
    return this.state$.sessionFolders.get()
  }

  set sessionFolders(value: SessionFolder[]) {
    this.state$.sessionFolders.set(value)
  }

  get sessionFolderAssignments(): Record<string, string> {
    return this.state$.sessionFolderAssignments.get()
  }

  set sessionFolderAssignments(value: Record<string, string>) {
    this.state$.sessionFolderAssignments.set(value)
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

  deleteSessionLocally = (sessionId: string): void => {
    const nextAssignments = { ...this.sessionFolderAssignments }
    delete nextAssignments[sessionId]
    const nextSessions = this.sessions.filter((session) => session.id !== sessionId)

    batch(() => {
      this.pinnedSessionIds = this.pinnedSessionIds.filter((id) => id !== sessionId)
      this.archivedSessionIds = this.archivedSessionIds.filter((id) => id !== sessionId)
      this.sessionFolderAssignments = nextAssignments
      this.setSessions(nextSessions)

      if (this.selectedSessionId === sessionId) {
        this.selectedSessionId = nextSessions[0]?.id ?? ''
        this.missingSelectedSession = false
        this.isDraftSelectionActive = false
      }
    })
    this.persistRemoveSessionFolderAssignment(sessionId)
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

  createSessionFolder = (
    projectKey: string,
    name = 'New folder',
    parentFolderId: string | null = null,
  ): SessionFolder => {
    const trimmedName = name.trim() || 'New folder'
    const now = new Date().toISOString()
    const parentFolder = parentFolderId
      ? this.sessionFolders.find((folder) => folder.id === parentFolderId)
      : null
    const resolvedParentFolderId =
      parentFolder && parentFolder.projectKey === projectKey ? parentFolder.id : null
    const nextFolder: SessionFolder = {
      id: createSessionFolderId(),
      projectKey,
      name: trimmedName,
      parentFolderId: resolvedParentFolderId,
      createdAt: now,
      updatedAt: now,
      order:
        Math.max(
          -1,
          ...this.sessionFolders
            .filter(
              (folder) =>
                folder.projectKey === projectKey &&
                folder.parentFolderId === resolvedParentFolderId,
            )
            .map((folder) => folder.order),
        ) + 1,
    }

    this.sessionFolders = [...this.sessionFolders, nextFolder]
    this.persistFolderPreferences()
    this.persistUpsertSessionFolder(nextFolder)

    return nextFolder
  }

  renameSessionFolder = (folderId: string, name: string): void => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    const updatedAt = new Date().toISOString()
    const nextFolders = this.sessionFolders.map((folder) =>
      folder.id === folderId ? { ...folder, name: trimmedName, updatedAt } : folder,
    )

    if (nextFolders === this.sessionFolders) return
    this.sessionFolders = nextFolders
    this.persistFolderPreferences()
    const updatedFolder = nextFolders.find((folder) => folder.id === folderId)
    if (updatedFolder) {
      this.persistUpsertSessionFolder(updatedFolder)
    }
  }

  deleteSessionFolder = (folderId: string): void => {
    const folderIdsToDelete = collectDescendantFolderIds(this.sessionFolders, folderId)
    if (folderIdsToDelete.size === 0) return

    const nextAssignments = { ...this.sessionFolderAssignments }
    for (const [sessionId, assignedFolderId] of Object.entries(nextAssignments)) {
      if (folderIdsToDelete.has(assignedFolderId)) {
        delete nextAssignments[sessionId]
      }
    }

    batch(() => {
      this.sessionFolders = this.sessionFolders.filter(
        (folder) => !folderIdsToDelete.has(folder.id),
      )
      this.sessionFolderAssignments = nextAssignments
    })
    this.persistFolderPreferences()
    for (const deletedFolderId of folderIdsToDelete) {
      this.persistDeleteSessionFolder(deletedFolderId)
    }
  }

  moveSessionToFolder = (sessionId: string, folderId: string): void => {
    const session = this.sessionsById[sessionId]
    const folder = this.sessionFolders.find((candidate) => candidate.id === folderId)

    if (!session || !folder || session.projectKey !== folder.projectKey || isNestedChild(session)) {
      return
    }

    this.sessionFolderAssignments = {
      ...this.sessionFolderAssignments,
      [sessionId]: folderId,
    }
    this.persistFolderPreferences()
    this.persistSetSessionFolderAssignment(sessionId, folderId)
  }

  assignSessionToFolder = (sessionId: string, folderId: string): void => {
    if (!this.sessionFolders.some((folder) => folder.id === folderId)) return

    this.sessionFolderAssignments = {
      ...this.sessionFolderAssignments,
      [sessionId]: folderId,
    }
    this.persistFolderPreferences()
    this.persistSetSessionFolderAssignment(sessionId, folderId)
  }

  moveSessionToProject = (sessionId: string, projectKey: string): void => {
    const session = this.sessionsById[sessionId]
    if (!session || session.projectKey !== projectKey || isNestedChild(session)) return

    const nextAssignments = { ...this.sessionFolderAssignments }
    delete nextAssignments[sessionId]
    this.sessionFolderAssignments = nextAssignments
    this.persistFolderPreferences()
    this.persistRemoveSessionFolderAssignment(sessionId)
  }

  moveFolder = (
    folderId: string,
    projectKey: string,
    parentFolderId: string | null = null,
  ): void => {
    const folder = this.sessionFolders.find((candidate) => candidate.id === folderId)
    if (!folder || folder.projectKey !== projectKey || folder.id === parentFolderId) return

    const parentFolder = parentFolderId
      ? this.sessionFolders.find((candidate) => candidate.id === parentFolderId)
      : null
    const resolvedParentFolderId =
      parentFolder && parentFolder.projectKey === projectKey ? parentFolder.id : null

    if (
      resolvedParentFolderId &&
      collectDescendantFolderIds(this.sessionFolders, folder.id).has(resolvedParentFolderId)
    ) {
      return
    }

    const updatedAt = new Date().toISOString()
    this.sessionFolders = this.sessionFolders.map((candidate) =>
      candidate.id === folderId
        ? { ...candidate, parentFolderId: resolvedParentFolderId, updatedAt }
        : candidate,
    )
    this.persistFolderPreferences()
    const updatedFolder = this.sessionFolders.find((candidate) => candidate.id === folderId)
    if (updatedFolder) {
      this.persistUpsertSessionFolder(updatedFolder)
    }
  }

  migrateLegacySessionFolderMetadata = async (): Promise<void> => {
    if (!this.legacySessionFolderMetadata || !this.folderPersistence?.mergeSessionFolderMetadata) {
      return
    }

    await this.folderPersistence.mergeSessionFolderMetadata(this.legacySessionFolderMetadata)
    this.legacySessionFolderMetadata = null
    this.persistPreferences()
  }

  hydrateSessionFolderMetadata = (metadata: SessionFolderMetadata): void => {
    if (!this.isFolderDatabaseBacked()) return
    if (
      metadata.folders.length === 0 &&
      metadata.assignments.length === 0 &&
      this.legacySessionFolderMetadata &&
      this.sessionFolders.length > 0
    ) {
      return
    }

    batch(() => {
      this.sessionFolders = metadata.folders
      this.sessionFolderAssignments = Object.fromEntries(
        metadata.assignments.map((assignment) => [assignment.sessionId, assignment.folderId]),
      )
    })
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
      bus.subscribe('foundation-hydrate', ({ bootstrap }) => {
        this.hydrateSessionFolderMetadata({
          folders: bootstrap.sessionFolders ?? [],
          assignments: bootstrap.sessionFolderAssignments ?? [],
        })
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

    this.cleanupFolderPreferences(currentSessions)
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
    const legacyFolders = persistedPreferences.sessionFolders ?? []
    const legacyAssignments = sessionFolderAssignmentRecordFromObject(
      persistedPreferences.sessionFolderAssignments ?? {},
    )
    this.legacySessionFolderMetadata =
      legacyFolders.length > 0 || legacyAssignments.length > 0
        ? { folders: legacyFolders, assignments: legacyAssignments }
        : null

    batch(() => {
      this.pinnedSessionIds = persistedPreferences.pinnedSessionIds ?? []
      this.archivedSessionIds = persistedPreferences.archivedSessionIds ?? []
      this.archivedProjectKeys = persistedPreferences.archivedProjectKeys ?? []
      this.projectDisplayNames = persistedPreferences.projectDisplayNames ?? {}
      this.sessionFolders = legacyFolders
      this.sessionFolderAssignments = persistedPreferences.sessionFolderAssignments ?? {}
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

    if (!this.isFolderDatabaseBacked()) {
      preferences.sessionFolders = this.sessionFolders
      preferences.sessionFolderAssignments = this.sessionFolderAssignments
    }

    this.persistence.set(SESSION_PREFERENCES_STORAGE_KEY, preferences)
  }

  private cleanupFolderPreferences(sessions: SessionPreview[]): void {
    if (this.isFolderDatabaseBacked()) return

    const validProjectKeys = new Set(sessions.map((session) => session.projectKey))
    const validSessionIds = new Set(sessions.map((session) => session.id))
    const validFolders = this.sessionFolders.filter((folder) =>
      validProjectKeys.has(folder.projectKey),
    )
    const validFolderIds = new Set(validFolders.map((folder) => folder.id))
    const normalizedFolders = validFolders.map((folder) =>
      folder.parentFolderId && validFolderIds.has(folder.parentFolderId)
        ? folder
        : { ...folder, parentFolderId: null },
    )
    const nextAssignments = Object.fromEntries(
      Object.entries(this.sessionFolderAssignments).filter(
        ([sessionId, folderId]) => validSessionIds.has(sessionId) && validFolderIds.has(folderId),
      ),
    )

    const foldersChanged =
      normalizedFolders.length !== this.sessionFolders.length ||
      normalizedFolders.some((folder, index) => folder !== this.sessionFolders[index])
    const assignmentsChanged =
      Object.keys(nextAssignments).length !== Object.keys(this.sessionFolderAssignments).length

    if (!foldersChanged && !assignmentsChanged) return

    batch(() => {
      if (foldersChanged) {
        this.sessionFolders = normalizedFolders
      }
      if (assignmentsChanged) {
        this.sessionFolderAssignments = nextAssignments
      }
    })
    this.persistPreferences()
  }

  private isFolderDatabaseBacked(): boolean {
    return Boolean(this.folderPersistence)
  }

  private persistFolderPreferences(): void {
    if (!this.isFolderDatabaseBacked()) {
      this.persistPreferences()
    }
  }

  private persistUpsertSessionFolder(folder: SessionFolder): void {
    this.enqueueFolderPersistenceWrite(async () => {
      await this.folderPersistence?.upsertSessionFolder?.(folder)
    })
  }

  private persistDeleteSessionFolder(folderId: string): void {
    this.enqueueFolderPersistenceWrite(async () => {
      await this.folderPersistence?.deleteSessionFolder?.(folderId)
    })
  }

  private persistSetSessionFolderAssignment(sessionId: string, folderId: string): void {
    this.enqueueFolderPersistenceWrite(async () => {
      await this.folderPersistence?.setSessionFolderAssignment?.({
        sessionId,
        folderId,
        updatedAt: new Date().toISOString(),
      })
    })
  }

  private persistRemoveSessionFolderAssignment(sessionId: string): void {
    this.enqueueFolderPersistenceWrite(async () => {
      await this.folderPersistence?.removeSessionFolderAssignment?.(sessionId)
    })
  }

  private enqueueFolderPersistenceWrite(operation: () => Promise<void>): void {
    if (!this.isFolderDatabaseBacked()) return

    this.folderPersistenceQueue = this.folderPersistenceQueue
      .catch(() => undefined)
      .then(operation)
      .catch((error) => {
        console.error('Failed to persist session folder metadata', error)
      })
  }

  async flushFolderPersistenceWrites(): Promise<void> {
    await this.folderPersistenceQueue.catch(() => undefined)
  }
}

function createSessionFolderId(): string {
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function collectDescendantFolderIds(folders: SessionFolder[], folderId: string): Set<string> {
  const collected = new Set<string>()
  const queue = [folderId]

  while (queue.length > 0) {
    const nextId = queue.shift()
    if (!nextId || collected.has(nextId)) continue

    collected.add(nextId)
    for (const folder of folders) {
      if (folder.parentFolderId === nextId) {
        queue.push(folder.id)
      }
    }
  }

  return collected
}

function isNestedChild(session: SessionPreview): boolean {
  return Boolean(
    session.parentSessionId && session.derivationType && session.derivationType !== 'fork',
  )
}

function sessionFolderAssignmentRecordFromObject(
  assignments: Record<string, string>,
): SessionFolderAssignmentRecord[] {
  const updatedAt = new Date().toISOString()

  return Object.entries(assignments).map(([sessionId, folderId]) => ({
    sessionId,
    folderId,
    updatedAt,
  }))
}
