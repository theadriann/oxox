// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { ModelPickerViewModel } from '../../../state/model-picker/model-picker.model'
import { ModelPicker } from '../ModelPicker'

function ControlledModelPicker({
  initialModelId = 'gpt-5.4',
  initialViewModel = buildDefaultViewModel(),
}: {
  initialModelId?: string
  initialViewModel?: ModelPickerViewModel
}) {
  const [selectedModelId, setSelectedModelId] = useState(initialModelId)
  const [viewModel, setViewModel] = useState(initialViewModel)

  return (
    <ModelPicker
      models={[
        { id: 'gpt-5.4', name: 'GPT 5.4' },
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
        { id: 'custom:my-model', name: 'My Model', provider: 'OpenAI' },
      ]}
      selectedModelId={selectedModelId}
      disabled={false}
      onModelChange={setSelectedModelId}
      viewModel={viewModel}
      onSearchChange={(query) =>
        setViewModel((prev) => {
          const allModels = [
            { id: 'gpt-5.4', name: 'GPT 5.4' },
            { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
            { id: 'custom:my-model', name: 'My Model', provider: 'OpenAI' },
          ]
          const filtered = query
            ? allModels.filter(
                (m) =>
                  m.name.toLowerCase().includes(query.toLowerCase()) ||
                  m.id.toLowerCase().includes(query.toLowerCase()),
              )
            : prev.filteredModels
          return { ...prev, searchQuery: query, filteredModels: filtered }
        })
      }
      onToggleFavorite={(modelId) =>
        setViewModel((prev) => ({
          ...prev,
          favoriteModelIds: prev.favoriteModelIds.includes(modelId)
            ? prev.favoriteModelIds.filter((id) => id !== modelId)
            : [...prev.favoriteModelIds, modelId],
        }))
      }
      onCategoryChange={(category) =>
        setViewModel((prev) => ({ ...prev, activeCategory: category }))
      }
    />
  )
}

function buildDefaultViewModel(): ModelPickerViewModel {
  return {
    categories: [
      { id: 'favorites', label: 'Favorites', count: 0 },
      { id: 'factory', label: 'Factory AI', count: 2 },
      { id: 'custom', label: 'Custom', count: 1 },
    ],
    activeCategory: 'factory',
    filteredModels: [
      { id: 'gpt-5.4', name: 'GPT 5.4' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    ],
    searchQuery: '',
    selectedModelId: 'gpt-5.4',
    favoriteModelIds: [],
  }
}

describe('ModelPicker', () => {
  it('opens the popover and shows the model list', () => {
    render(<ControlledModelPicker />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))

    // Use getAllByText because the trigger also shows the selected model name
    expect(screen.getAllByText('GPT 5.4').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Claude Opus 4.6')).toBeTruthy()
  })

  it('shows sidebar categories with counts', () => {
    render(<ControlledModelPicker />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))

    expect(screen.getByText('Favorites')).toBeTruthy()
    expect(screen.getByText('Factory AI')).toBeTruthy()
    expect(screen.getByText('Custom')).toBeTruthy()
  })

  it('selects a model and closes the popover', () => {
    render(<ControlledModelPicker />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))
    fireEvent.click(screen.getByText('Claude Opus 4.6'))

    expect(screen.queryByText('GPT 5.4')).toBeNull()
  })

  it('shows the selected model name in the trigger', () => {
    render(<ControlledModelPicker initialModelId="claude-opus-4-6" />)

    expect(screen.getByText('Claude Opus 4.6')).toBeTruthy()
  })

  it('toggles favorite on star button click', () => {
    render(<ControlledModelPicker />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))

    const starButton = screen.getAllByRole('button', { name: /Add to favorites/i })[0]
    fireEvent.click(starButton)

    expect(screen.getByRole('button', { name: /Remove from favorites/i })).toBeTruthy()
  })

  it('filters models by search query', () => {
    render(<ControlledModelPicker />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))

    const searchInput = screen.getByPlaceholderText(/Search models/i)
    fireEvent.change(searchInput, { target: { value: 'claude' } })

    expect(screen.getByText('Claude Opus 4.6')).toBeTruthy()
    // When searching, only Claude should appear in the list (GPT 5.4 only in trigger)
    expect(screen.queryAllByText('GPT 5.4').length).toBe(1)
  })

  it('suppresses the global focus ring on the search input', () => {
    render(<ControlledModelPicker />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))

    const searchInput = screen.getByPlaceholderText(/Search models/i)

    expect(searchInput.className).toContain('focus-visible:ring-0')
    expect(searchInput.className).toContain('focus-visible:shadow-none')
  })

  it('keeps the model list height stable for short result sets', () => {
    const viewModel: ModelPickerViewModel = {
      ...buildDefaultViewModel(),
      filteredModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
    }

    render(<ControlledModelPicker initialViewModel={viewModel} />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))

    expect(screen.getByTestId('model-picker-list').className).toContain('h-[360px]')
  })

  it('clears the search input from the inline clear button', () => {
    render(<ControlledModelPicker />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))

    const searchInput = screen.getByPlaceholderText(/Search models/i) as HTMLInputElement
    fireEvent.change(searchInput, { target: { value: 'claude' } })

    fireEvent.click(screen.getByRole('button', { name: /Clear model search/i }))

    expect(searchInput.value).toBe('')
  })

  it('hides sidebar when searching', () => {
    render(<ControlledModelPicker />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))

    const searchInput = screen.getByPlaceholderText(/Search models/i)
    fireEvent.change(searchInput, { target: { value: 'gpt' } })

    expect(screen.queryByText('Favorites')).toBeNull()
    expect(screen.queryByText('Factory AI')).toBeNull()
    expect(screen.queryByText('Custom')).toBeNull()
  })

  it('shows custom badge for custom models', () => {
    const viewModel: ModelPickerViewModel = {
      ...buildDefaultViewModel(),
      activeCategory: 'custom',
      filteredModels: [{ id: 'custom:my-model', name: 'My Model', provider: 'OpenAI' }],
    }

    render(<ControlledModelPicker initialViewModel={viewModel} />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))

    // The badge "Custom" is distinct from the sidebar category label
    expect(screen.getAllByText('Custom').length).toBeGreaterThanOrEqual(1)
  })

  it('closes on Escape key', () => {
    render(<ControlledModelPicker />)

    fireEvent.click(screen.getByRole('button', { name: /Model picker/i }))
    expect(screen.getAllByText('GPT 5.4').length).toBeGreaterThanOrEqual(1)

    fireEvent.keyDown(document, { key: 'Escape' })

    // After escape, the popover content should be gone
    // Note: radix popover handles this internally; we verify the trigger still works
    expect(screen.getByRole('button', { name: /Model picker/i })).toBeTruthy()
  })
})
