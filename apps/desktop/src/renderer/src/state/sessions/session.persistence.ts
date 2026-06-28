import type { PersistencePort } from '../../platform/persistence'
import type { PersistedSessionPreferences, SessionFolder } from './session.types'

export const SESSION_PREFERENCES_STORAGE_KEY = 'oxox.session.preferences'

export function readPersistedSessionPreferences(
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
      sessionFolders: parseSessionFolders(parsed.sessionFolders),
      sessionFolderAssignments: parseSessionFolderAssignments(parsed.sessionFolderAssignments),
    }
  } catch {
    return {}
  }
}

function parseSessionFolders(value: unknown): SessionFolder[] {
  if (!Array.isArray(value)) return []

  return value.filter((folder): folder is SessionFolder => {
    if (!folder || typeof folder !== 'object') return false

    const candidate = folder as Record<string, unknown>

    return (
      typeof candidate.id === 'string' &&
      candidate.id.trim().length > 0 &&
      typeof candidate.projectKey === 'string' &&
      candidate.projectKey.trim().length > 0 &&
      typeof candidate.name === 'string' &&
      candidate.name.trim().length > 0 &&
      (candidate.parentFolderId === null || typeof candidate.parentFolderId === 'string') &&
      typeof candidate.createdAt === 'string' &&
      typeof candidate.updatedAt === 'string' &&
      typeof candidate.order === 'number' &&
      Number.isFinite(candidate.order)
    )
  })
}

function parseSessionFolderAssignments(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === 'string' &&
        entry[0].trim().length > 0 &&
        typeof entry[1] === 'string' &&
        entry[1].trim().length > 0,
    ),
  )
}
