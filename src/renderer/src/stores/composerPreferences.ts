import type { LiveSessionModel, LiveSessionSnapshot } from '../../../shared/ipc/contracts'
import type { PersistencePort } from '../platform/persistence'

export const SESSION_COMPOSER_STORAGE_KEY = 'oxox.session.composer'

export interface ComposerPreferences {
  modelId: string
  interactionMode: string
  autonomyLevel: string
}

export interface FactoryDefaults {
  model?: string
  interactionMode?: string
  [key: string]: unknown
}

export function readPersistedComposerPreferences(
  persistence: PersistencePort,
): Record<string, ComposerPreferences> {
  const parsed = persistence.get<Record<string, Partial<ComposerPreferences>>>(
    SESSION_COMPOSER_STORAGE_KEY,
    {},
  )

  try {
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([sessionId, value]) => {
        if (
          typeof sessionId !== 'string' ||
          typeof value?.modelId !== 'string' ||
          typeof value?.interactionMode !== 'string'
        ) {
          return []
        }

        return [
          [
            sessionId,
            {
              modelId: value.modelId,
              interactionMode: value.interactionMode,
              autonomyLevel:
                typeof value.autonomyLevel === 'string' ? value.autonomyLevel : 'medium',
            },
          ],
        ]
      }),
    )
  } catch {
    return {}
  }
}

export function persistComposerPreferences(
  persistence: PersistencePort,
  preferences: Record<string, ComposerPreferences>,
): void {
  persistence.set(SESSION_COMPOSER_STORAGE_KEY, preferences)
}

export function deriveDefaultComposerPreferences(
  factoryDefaultSettings: FactoryDefaults,
  factoryModels: LiveSessionModel[],
): ComposerPreferences {
  return {
    modelId: firstNonEmptyString(factoryDefaultSettings.model, factoryModels[0]?.id),
    interactionMode: firstNonEmptyString(factoryDefaultSettings.interactionMode, 'auto'),
    autonomyLevel: 'medium',
  }
}

export function deriveComposerPreferences(
  sessionId: string | null,
  snapshot: LiveSessionSnapshot | null,
  persisted: Record<string, ComposerPreferences>,
  factoryDefaultSettings: FactoryDefaults,
  factoryModels: LiveSessionModel[],
): ComposerPreferences {
  if (sessionId && persisted[sessionId]) {
    return persisted[sessionId]
  }

  const defaultPreferences = deriveDefaultComposerPreferences(factoryDefaultSettings, factoryModels)

  return {
    modelId: firstNonEmptyString(
      snapshot?.settings.modelId,
      factoryDefaultSettings.model,
      snapshot?.availableModels[0]?.id,
      defaultPreferences.modelId,
    ),
    interactionMode: firstNonEmptyString(
      snapshot?.settings.interactionMode,
      factoryDefaultSettings.interactionMode,
      defaultPreferences.interactionMode,
    ),
    autonomyLevel: firstNonEmptyString(
      snapshot?.settings.autonomyLevel as string | undefined,
      defaultPreferences.autonomyLevel,
    ),
  }
}

function firstNonEmptyString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return ''
}
