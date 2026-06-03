import { type Observable, observable } from '@legendapp/state'

export const MODEL_PICKER_STORAGE_KEY = 'oxox.model-picker'

export type ModelPickerCategory = 'favorites' | 'factory' | 'custom'

export interface ModelPickerState {
  searchQuery: string
  activeCategory: string
  favoriteModelIds: string[]
}

export function createDefaultModelPickerState(): ModelPickerState {
  return {
    searchQuery: '',
    activeCategory: 'factory',
    favoriteModelIds: [],
  }
}

export function createModelPickerState$(): Observable<ModelPickerState> {
  return observable(createDefaultModelPickerState())
}
