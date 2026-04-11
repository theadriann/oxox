import type {
  DaemonConnectionSnapshot,
  DatabaseDiagnostics,
  DroidCliStatus,
  FoundationBootstrap,
  FoundationChanges,
  FoundationRecordDelta,
  FoundationSyncMetadataDelta,
  ProjectRecord,
  SessionRecord,
  SyncMetadataRecord,
} from './contracts'

export function diffFoundationBootstraps(
  previous: FoundationBootstrap,
  next: FoundationBootstrap,
): FoundationChanges | null {
  const changes: FoundationChanges = {}

  if (!databaseDiagnosticsEqual(previous.database, next.database)) {
    changes.database = next.database
  }

  if (!droidCliStatusEqual(previous.droidCli, next.droidCli)) {
    changes.droidCli = next.droidCli
  }

  if (!daemonSnapshotEqual(previous.daemon, next.daemon)) {
    changes.daemon = next.daemon
  }

  const projectChanges = diffRecordCollections(
    previous.projects,
    next.projects,
    (project) => project.id,
    projectRecordEqual,
  )

  if (projectChanges) {
    changes.projects = projectChanges
  }

  const sessionChanges = diffRecordCollections(
    previous.sessions,
    next.sessions,
    (session) => session.id,
    sessionRecordEqual,
  )

  if (sessionChanges) {
    changes.sessions = sessionChanges
  }

  const syncMetadataChanges = diffSyncMetadata(previous.syncMetadata, next.syncMetadata)

  if (syncMetadataChanges) {
    changes.syncMetadata = syncMetadataChanges
  }

  if (!factoryModelsEqual(previous.factoryModels, next.factoryModels)) {
    changes.factoryModels = next.factoryModels
  }

  if (
    !foundationDefaultSettingsEqual(previous.factoryDefaultSettings, next.factoryDefaultSettings)
  ) {
    changes.factoryDefaultSettings = next.factoryDefaultSettings
  }

  return hasFoundationChanges(changes) ? changes : null
}

export function applyFoundationChanges(
  foundation: FoundationBootstrap,
  changes: FoundationChanges,
): FoundationBootstrap {
  const nextProjects = changes.projects
    ? applyRecordDelta(foundation.projects, changes.projects, (project) => project.id)
    : foundation.projects
  const nextSessions = changes.sessions
    ? applyRecordDelta(foundation.sessions, changes.sessions, (session) => session.id)
    : foundation.sessions
  const nextSyncMetadata = changes.syncMetadata
    ? applySyncMetadataDelta(foundation.syncMetadata, changes.syncMetadata)
    : foundation.syncMetadata

  return {
    database: changes.database ?? foundation.database,
    droidCli: changes.droidCli ?? foundation.droidCli,
    daemon: changes.daemon ?? foundation.daemon,
    projects: nextProjects,
    sessions: nextSessions,
    syncMetadata: nextSyncMetadata,
    factoryModels: changes.factoryModels ?? foundation.factoryModels,
    factoryDefaultSettings: changes.factoryDefaultSettings ?? foundation.factoryDefaultSettings,
  }
}

export function hasFoundationChanges(changes: FoundationChanges | null | undefined): boolean {
  return Boolean(changes && Object.keys(changes).length > 0)
}

function diffRecordCollections<TRecord>(
  previous: TRecord[],
  next: TRecord[],
  getId: (record: TRecord) => string,
  isEqual: (left: TRecord, right: TRecord) => boolean,
): FoundationRecordDelta<TRecord> | null {
  const previousById = new Map(previous.map((record) => [getId(record), record]))
  const nextById = new Map(next.map((record) => [getId(record), record]))
  const upserted: TRecord[] = []
  const removedIds: string[] = []

  for (const [id, record] of nextById) {
    const previousRecord = previousById.get(id)

    if (!previousRecord || !isEqual(previousRecord, record)) {
      upserted.push(record)
    }
  }

  for (const id of previousById.keys()) {
    if (!nextById.has(id)) {
      removedIds.push(id)
    }
  }

  if (upserted.length === 0 && removedIds.length === 0) {
    return null
  }

  return {
    upserted,
    removedIds,
  }
}

function applyRecordDelta<TRecord>(
  current: TRecord[],
  delta: FoundationRecordDelta<TRecord>,
  getId: (record: TRecord) => string,
): TRecord[] {
  const nextById = new Map(current.map((record) => [getId(record), record]))

  for (const removedId of delta.removedIds) {
    nextById.delete(removedId)
  }

  for (const record of delta.upserted) {
    nextById.set(getId(record), record)
  }

  return [...nextById.values()]
}

function diffSyncMetadata(
  previous: SyncMetadataRecord[],
  next: SyncMetadataRecord[],
): FoundationSyncMetadataDelta | null {
  const previousByPath = new Map(previous.map((record) => [record.sourcePath, record]))
  const nextByPath = new Map(next.map((record) => [record.sourcePath, record]))
  const upserted: SyncMetadataRecord[] = []
  const removedSourcePaths: string[] = []

  for (const [sourcePath, record] of nextByPath) {
    const previousRecord = previousByPath.get(sourcePath)

    if (!previousRecord || !syncMetadataRecordEqual(previousRecord, record)) {
      upserted.push(record)
    }
  }

  for (const sourcePath of previousByPath.keys()) {
    if (!nextByPath.has(sourcePath)) {
      removedSourcePaths.push(sourcePath)
    }
  }

  if (upserted.length === 0 && removedSourcePaths.length === 0) {
    return null
  }

  return {
    upserted,
    removedSourcePaths,
  }
}

function applySyncMetadataDelta(
  current: SyncMetadataRecord[],
  delta: FoundationSyncMetadataDelta,
): SyncMetadataRecord[] {
  const nextByPath = new Map(current.map((record) => [record.sourcePath, record]))

  for (const sourcePath of delta.removedSourcePaths) {
    nextByPath.delete(sourcePath)
  }

  for (const record of delta.upserted) {
    nextByPath.set(record.sourcePath, record)
  }

  return [...nextByPath.values()]
}

function databaseDiagnosticsEqual(left: DatabaseDiagnostics, right: DatabaseDiagnostics): boolean {
  return (
    left.exists === right.exists &&
    left.journalMode === right.journalMode &&
    left.path === right.path &&
    stringArraysEqual(left.tableNames, right.tableNames)
  )
}

function droidCliStatusEqual(left: DroidCliStatus, right: DroidCliStatus): boolean {
  return (
    left.available === right.available &&
    left.path === right.path &&
    left.version === right.version &&
    left.error === right.error &&
    stringArraysEqual(left.searchedLocations, right.searchedLocations)
  )
}

export function daemonSnapshotEqual(
  left: DaemonConnectionSnapshot,
  right: DaemonConnectionSnapshot,
): boolean {
  return (
    left.status === right.status &&
    left.connectedPort === right.connectedPort &&
    left.lastError === right.lastError &&
    left.lastConnectedAt === right.lastConnectedAt &&
    left.lastSyncAt === right.lastSyncAt &&
    left.nextRetryDelayMs === right.nextRetryDelayMs
  )
}

function sessionRecordEqual(left: SessionRecord, right: SessionRecord): boolean {
  return (
    left.id === right.id &&
    left.projectId === right.projectId &&
    left.projectWorkspacePath === right.projectWorkspacePath &&
    left.projectDisplayName === right.projectDisplayName &&
    left.parentSessionId === right.parentSessionId &&
    left.derivationType === right.derivationType &&
    left.hasUserMessage === right.hasUserMessage &&
    left.modelId === right.modelId &&
    left.title === right.title &&
    left.status === right.status &&
    left.transport === right.transport &&
    left.createdAt === right.createdAt &&
    left.lastActivityAt === right.lastActivityAt &&
    left.updatedAt === right.updatedAt
  )
}

function projectRecordEqual(left: ProjectRecord, right: ProjectRecord): boolean {
  return (
    left.id === right.id &&
    left.workspacePath === right.workspacePath &&
    left.displayName === right.displayName &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  )
}

function syncMetadataRecordEqual(left: SyncMetadataRecord, right: SyncMetadataRecord): boolean {
  return (
    left.sourcePath === right.sourcePath &&
    left.sessionId === right.sessionId &&
    left.lastByteOffset === right.lastByteOffset &&
    left.lastMtimeMs === right.lastMtimeMs &&
    left.lastSyncedAt === right.lastSyncedAt &&
    left.checksum === right.checksum
  )
}

function factoryModelsEqual(
  left: FoundationBootstrap['factoryModels'],
  right: FoundationBootstrap['factoryModels'],
): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((model, index) => {
    const other = right[index]
    return (
      model.id === other?.id && model.name === other?.name && model.provider === other?.provider
    )
  })
}

function foundationDefaultSettingsEqual(
  left: FoundationBootstrap['factoryDefaultSettings'],
  right: FoundationBootstrap['factoryDefaultSettings'],
): boolean {
  return left.model === right.model && left.interactionMode === right.interactionMode
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}
