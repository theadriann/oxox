import { batch, type Observable } from '@legendapp/state'
import type { LiveSessionModel } from '../../../../shared/ipc/contracts'
import { createLocalStoragePort, type PersistencePort } from '../../platform/persistence'
import { persistModelPickerState, readPersistedModelPickerState } from './model-picker.persistence'
import { createModelPickerState$, type ModelPickerState } from './model-picker.state'

export type { ModelPickerCategory } from './model-picker.state'

export interface ModelPickerViewModel {
  categories: ModelPickerCategoryView[]
  activeCategory: string
  filteredModels: LiveSessionModel[]
  searchQuery: string
  selectedModelId: string
  favoriteModelIds: string[]
}

export interface ModelPickerCategoryView {
  id: string
  label: string
  count: number
}

export class ModelPickerStore {
  readonly state$: Observable<ModelPickerState> = createModelPickerState$()

  private readonly persistence: PersistencePort
  private disposer: (() => void) | null = null

  constructor(persistence: PersistencePort = createLocalStoragePort()) {
    this.persistence = persistence
    this.hydrate()

    this.disposer = this.state$.favoriteModelIds.onChange(({ value }) => {
      persistModelPickerState(this.persistence, value)
    })
  }

  get searchQuery(): string {
    return this.state$.searchQuery.get()
  }

  set searchQuery(value: string) {
    this.state$.searchQuery.set(value)
  }

  get activeCategory(): string {
    return this.state$.activeCategory.get()
  }

  set activeCategory(value: string) {
    this.state$.activeCategory.set(value)
  }

  get favoriteModelIds(): string[] {
    return this.state$.favoriteModelIds.get()
  }

  set favoriteModelIds(value: string[]) {
    this.state$.favoriteModelIds.set(value)
  }

  isFavorite(modelId: string): boolean {
    return this.favoriteModelIds.includes(modelId)
  }

  toggleFavorite(modelId: string): void {
    const current = this.favoriteModelIds
    const index = current.indexOf(modelId)

    if (index >= 0) {
      this.favoriteModelIds = current.filter((id) => id !== modelId)
    } else {
      this.favoriteModelIds = [...current, modelId]
    }
  }

  buildViewModel(models: LiveSessionModel[], selectedModelId: string): ModelPickerViewModel {
    const rawQuery = this.searchQuery
    const query = rawQuery.toLowerCase().trim()
    const favoriteIds = this.favoriteModelIds
    const activeCategory = this.activeCategory

    const factoryModels = models.filter((m) => !m.id.startsWith('custom:'))
    const customModels = models.filter((m) => m.id.startsWith('custom:'))
    const favoriteModels = models.filter((m) => favoriteIds.includes(m.id))

    let filteredModels: LiveSessionModel[]

    if (query.length > 0) {
      filteredModels = models.filter((model) => modelMatchesQuery(model, query))
    } else {
      switch (activeCategory) {
        case 'favorites':
          filteredModels = favoriteModels
          break
        case 'factory':
          filteredModels = factoryModels
          break
        case 'custom':
          filteredModels = customModels
          break
        default:
          filteredModels = models
      }
    }

    const categories: ModelPickerCategoryView[] = [
      { id: 'favorites', label: 'Favorites', count: favoriteModels.length },
      { id: 'factory', label: 'Factory AI', count: factoryModels.length },
      { id: 'custom', label: 'Custom', count: customModels.length },
    ]

    return {
      categories,
      activeCategory: query.length > 0 ? 'search' : activeCategory,
      filteredModels,
      searchQuery: rawQuery,
      selectedModelId,
      favoriteModelIds: favoriteIds,
    }
  }

  dispose(): void {
    this.disposer?.()
    this.disposer = null
  }

  private hydrate(): void {
    const persisted = readPersistedModelPickerState(this.persistence)

    batch(() => {
      this.state$.favoriteModelIds.set(
        Array.isArray(persisted.favoriteModelIds) ? persisted.favoriteModelIds : [],
      )
    })
  }
}

function modelMatchesQuery(model: LiveSessionModel, query: string): boolean {
  const queryTokens = tokenizeSearchText(query)

  if (queryTokens.length === 0) {
    return true
  }

  const modelTokens = tokenizeSearchText([model.name, model.id, model.provider ?? ''].join(' '))

  return queryTokens.every((queryToken) =>
    modelTokens.some((modelToken) => searchTokenMatches(modelToken, queryToken)),
  )
}

function tokenizeSearchText(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9.]+/g) ?? []
}

function searchTokenMatches(modelToken: string, queryToken: string): boolean {
  if (modelToken.includes(queryToken)) {
    return true
  }

  if (/\d/.test(queryToken)) {
    return false
  }

  if (queryToken.length < 3) {
    return false
  }

  return (
    levenshteinDistance(modelToken, queryToken) <= Math.max(1, Math.floor(queryToken.length / 4))
  )
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = Array.from({ length: b.length + 1 }, () => 0)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i

    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j]
    }
  }

  return previous[b.length]
}
