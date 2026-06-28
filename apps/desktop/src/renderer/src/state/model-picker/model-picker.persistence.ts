import type { PersistencePort } from '../../platform/persistence'
import { MODEL_PICKER_STORAGE_KEY } from './model-picker.state'

export interface PersistedModelPickerState {
  favoriteModelIds?: string[]
}

export function readPersistedModelPickerState(
  persistence: PersistencePort,
): PersistedModelPickerState {
  try {
    const parsed = persistence.get<PersistedModelPickerState>(MODEL_PICKER_STORAGE_KEY, {})

    return {
      favoriteModelIds: Array.isArray(parsed.favoriteModelIds)
        ? parsed.favoriteModelIds.filter((value): value is string => typeof value === 'string')
        : [],
    }
  } catch {
    return {}
  }
}

export function persistModelPickerState(
  persistence: PersistencePort,
  favoriteModelIds: string[],
): void {
  persistence.set(MODEL_PICKER_STORAGE_KEY, { favoriteModelIds })
}
