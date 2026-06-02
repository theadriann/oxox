import type { PersistencePort } from '../../platform/persistence'
import type { PersistedSessionPreferences } from './session.types'

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
    }
  } catch {
    return {}
  }
}
