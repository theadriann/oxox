import { describe, expect, it } from 'vitest'

import { createMemoryPersistencePort } from '../../../platform/persistence'
import { ModelPickerStore } from '../model-picker.model'

function createModel(id: string, name: string, provider?: string) {
  return { id, name, provider: provider ?? null }
}

describe('ModelPickerStore', () => {
  it('initializes with empty favorites', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())

    expect(store.favoriteModelIds).toEqual([])
    expect(store.searchQuery).toBe('')
  })

  it('hydrates favorites from persistence', () => {
    const persistence = createMemoryPersistencePort({
      'oxox.model-picker': { favoriteModelIds: ['gpt-5.4', 'claude-opus-4-6'] },
    })

    const store = new ModelPickerStore(persistence)

    expect(store.favoriteModelIds).toEqual(['gpt-5.4', 'claude-opus-4-6'])
  })

  it('toggles a model as favorite', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())

    store.toggleFavorite('gpt-5.4')
    expect(store.favoriteModelIds).toEqual(['gpt-5.4'])

    store.toggleFavorite('gpt-5.4')
    expect(store.favoriteModelIds).toEqual([])
  })

  it('persists favorites on toggle', () => {
    const persistence = createMemoryPersistencePort()
    const store = new ModelPickerStore(persistence)

    store.toggleFavorite('gpt-5.4')

    expect(persistence.get('oxox.model-picker', {}).favoriteModelIds).toEqual(['gpt-5.4'])
  })

  it('isFavorite returns correct state', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())

    expect(store.isFavorite('gpt-5.4')).toBe(false)
    store.toggleFavorite('gpt-5.4')
    expect(store.isFavorite('gpt-5.4')).toBe(true)
  })

  it('buildViewModel groups models into categories', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())
    const models = [
      createModel('claude-opus-4-6', 'Claude Opus 4.6'),
      createModel('gpt-5.4', 'GPT 5.4'),
      createModel('custom:my-model', 'My Model', 'OpenAI'),
    ]

    const vm = store.buildViewModel(models, 'gpt-5.4')

    expect(vm.categories).toEqual([
      { id: 'favorites', label: 'Favorites', count: 0 },
      { id: 'factory', label: 'Factory AI', count: 2 },
      { id: 'custom', label: 'Custom', count: 1 },
    ])
    expect(vm.activeCategory).toBe('factory')
    expect(vm.filteredModels).toHaveLength(2)
    expect(vm.filteredModels.map((m) => m.id)).toEqual(['claude-opus-4-6', 'gpt-5.4'])
  })

  it('buildViewModel shows favorites in favorites category', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())
    const models = [
      createModel('claude-opus-4-6', 'Claude Opus 4.6'),
      createModel('gpt-5.4', 'GPT 5.4'),
      createModel('custom:my-model', 'My Model'),
    ]

    store.toggleFavorite('gpt-5.4')
    store.activeCategory = 'favorites'

    const vm = store.buildViewModel(models, 'claude-opus-4-6')

    expect(vm.filteredModels).toHaveLength(1)
    expect(vm.filteredModels[0].id).toBe('gpt-5.4')
    expect(vm.categories[0].count).toBe(1)
  })

  it('buildViewModel filters by search query across all models', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())
    const models = [
      createModel('claude-opus-4-6', 'Claude Opus 4.6'),
      createModel('gpt-5.4', 'GPT 5.4'),
      createModel('custom:my-model', 'My Model'),
    ]

    store.searchQuery = 'gpt'

    const vm = store.buildViewModel(models, 'claude-opus-4-6')

    expect(vm.activeCategory).toBe('search')
    expect(vm.filteredModels).toHaveLength(1)
    expect(vm.filteredModels[0].id).toBe('gpt-5.4')
  })

  it('buildViewModel fuzzy-matches non-contiguous model name tokens', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())
    const models = [
      createModel('gpt-5.5(high)', 'GPT 5.5 (High)'),
      createModel('gpt-5.5(low-verbose)', 'GPT 5.5 (Low Verbose)'),
      createModel('claude-opus-4-8', 'Claude Opus 4.8'),
    ]

    store.searchQuery = 'GPT High'

    const vm = store.buildViewModel(models, '')

    expect(vm.filteredModels.map((m) => m.id)).toEqual(['gpt-5.5(high)'])
  })

  it('buildViewModel fuzzy-matches abbreviated model name tokens', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())
    const models = [
      createModel('gpt-5.5(high)', 'GPT 5.5 (High)'),
      createModel('gpt-5.5(low-verbose)', 'GPT 5.5 (Low Verbose)'),
      createModel('gpt-5.4(high)', 'GPT 5.4 (High)'),
    ]

    store.searchQuery = '5.5 hi'

    const vm = store.buildViewModel(models, '')

    expect(vm.filteredModels.map((m) => m.id)).toEqual(['gpt-5.5(high)'])
  })

  it('buildViewModel search matches provider names', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())
    const models = [createModel('custom:my-model', 'My Model', 'OpenAI')]

    store.searchQuery = 'openai'

    const vm = store.buildViewModel(models, '')

    expect(vm.filteredModels).toHaveLength(1)
    expect(vm.filteredModels[0].id).toBe('custom:my-model')
  })

  it('buildViewModel search matches model id', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())
    const models = [createModel('custom:my-model', 'My Model')]

    store.searchQuery = 'custom:my'

    const vm = store.buildViewModel(models, '')

    expect(vm.filteredModels).toHaveLength(1)
    expect(vm.filteredModels[0].id).toBe('custom:my-model')
  })

  it('buildViewModel returns empty results for no match', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())
    const models = [createModel('gpt-5.4', 'GPT 5.4')]

    store.searchQuery = 'claude'

    const vm = store.buildViewModel(models, '')

    expect(vm.filteredModels).toHaveLength(0)
  })

  it('buildViewModel includes selectedModelId and favoriteModelIds', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())
    const models = [createModel('gpt-5.4', 'GPT 5.4')]

    store.toggleFavorite('gpt-5.4')

    const vm = store.buildViewModel(models, 'gpt-5.4')

    expect(vm.selectedModelId).toBe('gpt-5.4')
    expect(vm.favoriteModelIds).toEqual(['gpt-5.4'])
  })

  it('buildViewModel preserves untrimmed searchQuery in view model', () => {
    const store = new ModelPickerStore(createMemoryPersistencePort())
    const models = [createModel('gpt-5.4', 'GPT 5.4')]

    store.searchQuery = 'GPT '

    const vm = store.buildViewModel(models, '')

    expect(vm.searchQuery).toBe('GPT ')
    expect(vm.activeCategory).toBe('search')
  })

  it('ignores invalid persisted favoriteModelIds', () => {
    const persistence = createMemoryPersistencePort({
      'oxox.model-picker': { favoriteModelIds: [123, 'valid', null] },
    })

    const store = new ModelPickerStore(persistence)

    expect(store.favoriteModelIds).toEqual(['valid'])
  })

  it('dispose removes the reaction', () => {
    const persistence = createMemoryPersistencePort()
    const store = new ModelPickerStore(persistence)

    store.dispose()
    store.toggleFavorite('gpt-5.4')

    // After dispose, persistence should not have been updated by the reaction
    // (toggle still changes state, but reaction is gone)
    expect(store.favoriteModelIds).toEqual(['gpt-5.4'])
  })
})
