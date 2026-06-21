import type { LiveSessionModel, LiveSessionSnapshot } from '../../../../shared/ipc/contracts'
import type { PersistencePort } from '../../platform/persistence'

export const SESSION_COMPOSER_STORAGE_KEY = 'oxox.session.composer'

export interface ComposerPreferences {
  modelId: string
  interactionMode: string
  reasoningEffort: string
  autonomyLevel: string
}

export interface FactoryDefaults {
  model?: string
  interactionMode?: string
  reasoningEffort?: string
  autonomyMode?: string
  autonomyLevel?: string
  [key: string]: unknown
}

const DEFAULT_AUTONOMY_LEVEL = 'high'

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
              reasoningEffort:
                typeof value.reasoningEffort === 'string' ? value.reasoningEffort : '',
              autonomyLevel:
                typeof value.autonomyLevel === 'string'
                  ? value.autonomyLevel
                  : DEFAULT_AUTONOMY_LEVEL,
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
  const defaultModelId = firstNonEmptyString(factoryDefaultSettings.model, factoryModels[0]?.id)

  return {
    modelId: defaultModelId,
    interactionMode: firstNonEmptyString(factoryDefaultSettings.interactionMode, 'auto'),
    reasoningEffort: resolveReasoningEffort(
      defaultModelId,
      firstNonEmptyString(factoryDefaultSettings.reasoningEffort),
      factoryModels,
    ),
    autonomyLevel: resolveAutonomyLevel(factoryDefaultSettings),
  }
}

export function deriveComposerPreferences(
  sessionId: string | null,
  snapshot: LiveSessionSnapshot | null,
  persisted: Record<string, ComposerPreferences>,
  factoryDefaultSettings: FactoryDefaults,
  factoryModels: LiveSessionModel[],
): ComposerPreferences {
  const defaultPreferences = deriveDefaultComposerPreferences(factoryDefaultSettings, factoryModels)
  const persistedPreferences = sessionId ? persisted[sessionId] : undefined
  const availableModels = snapshot?.availableModels?.length
    ? mergeComposerModelLists(snapshot.availableModels, factoryModels)
    : factoryModels
  const modelId = firstNonEmptyString(
    persistedPreferences?.modelId,
    snapshot?.settings.modelId,
    factoryDefaultSettings.model,
    snapshot?.availableModels[0]?.id,
    defaultPreferences.modelId,
  )

  return {
    modelId,
    interactionMode: firstNonEmptyString(
      persistedPreferences?.interactionMode,
      snapshot?.settings.interactionMode,
      factoryDefaultSettings.interactionMode,
      defaultPreferences.interactionMode,
    ),
    reasoningEffort: resolveReasoningEffort(
      modelId,
      firstNonEmptyString(
        persistedPreferences?.reasoningEffort,
        snapshot?.settings.reasoningEffort as string | undefined,
        factoryDefaultSettings.reasoningEffort,
        defaultPreferences.reasoningEffort,
      ),
      availableModels,
    ),
    autonomyLevel: firstNonEmptyString(
      persistedPreferences?.autonomyLevel,
      snapshot?.settings.autonomyLevel as string | undefined,
      defaultPreferences.autonomyLevel,
    ),
  }
}

export function resolveReasoningEffort(
  modelId: string,
  reasoningEffort: string | undefined,
  availableModels: LiveSessionModel[],
): string {
  const selectedModel = availableModels.find((model) => model.id === modelId)
  const supportedReasoningEfforts = selectedModel?.supportedReasoningEfforts ?? []

  if (supportedReasoningEfforts.length === 0) {
    return ''
  }

  if (reasoningEffort && supportedReasoningEfforts.includes(reasoningEffort)) {
    return reasoningEffort
  }

  return firstNonEmptyString(selectedModel?.defaultReasoningEffort, supportedReasoningEfforts[0])
}

function resolveAutonomyLevel(factoryDefaultSettings: FactoryDefaults): string {
  return firstNonEmptyString(
    factoryDefaultSettings.autonomyLevel,
    autonomyLevelFromMode(factoryDefaultSettings.autonomyMode),
    DEFAULT_AUTONOMY_LEVEL,
  )
}

function autonomyLevelFromMode(value: string | undefined): string | undefined {
  if (value === 'auto-low') return 'low'
  if (value === 'auto-medium') return 'medium'
  if (value === 'auto-high') return 'high'
  if (value === 'normal') return 'off'
  return undefined
}

export function mergeComposerModelLists(
  primaryModels: LiveSessionModel[],
  fallbackModels: LiveSessionModel[],
): LiveSessionModel[] {
  const mergedModels = new Map<string, LiveSessionModel>()

  for (const model of [...primaryModels, ...fallbackModels]) {
    const existingModel = mergedModels.get(model.id)

    mergedModels.set(model.id, {
      ...existingModel,
      ...model,
      ...(model.supportedReasoningEfforts
        ? { supportedReasoningEfforts: [...model.supportedReasoningEfforts] }
        : existingModel?.supportedReasoningEfforts
          ? { supportedReasoningEfforts: [...existingModel.supportedReasoningEfforts] }
          : {}),
    })
  }

  return [...mergedModels.values()]
}

export function mergeComposerModelMetadata(
  primaryModels: LiveSessionModel[],
  fallbackModels: LiveSessionModel[],
): LiveSessionModel[] {
  const fallbackModelsById = new Map(fallbackModels.map((model) => [model.id, model] as const))

  return primaryModels.map((model) => {
    const fallbackModel = fallbackModelsById.get(model.id)

    return {
      ...model,
      ...(fallbackModel?.supportedReasoningEfforts
        ? { supportedReasoningEfforts: [...fallbackModel.supportedReasoningEfforts] }
        : {}),
      ...(fallbackModel?.defaultReasoningEffort
        ? { defaultReasoningEffort: fallbackModel.defaultReasoningEffort }
        : {}),
      ...(typeof fallbackModel?.maxContextLimit === 'number'
        ? { maxContextLimit: fallbackModel.maxContextLimit }
        : {}),
    }
  })
}

function firstNonEmptyString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return ''
}
