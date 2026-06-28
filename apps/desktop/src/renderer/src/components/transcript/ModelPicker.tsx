import { Check, ChevronDown, Search, Star, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { LiveSessionModel } from '../../../../shared/ipc/contracts'
import type { ModelPickerViewModel } from '../../state/model-picker/model-picker.model'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

export interface ModelPickerProps {
  models: LiveSessionModel[]
  selectedModelId: string
  disabled: boolean
  onModelChange: (modelId: string) => void
  viewModel: ModelPickerViewModel
  onSearchChange: (query: string) => void
  onToggleFavorite: (modelId: string) => void
  onCategoryChange: (category: string) => void
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  favorites: <Star className="size-3.5" />,
}

const CATEGORY_LABELS: Record<string, string> = {
  favorites: 'Favorites',
  factory: 'Factory AI',
  custom: 'Custom',
}

export function ModelPicker({
  models,
  selectedModelId,
  disabled,
  onModelChange,
  viewModel,
  onSearchChange,
  onToggleFavorite,
  onCategoryChange,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const selectedModel = models.find((m) => m.id === selectedModelId)

  const isSearching = viewModel.searchQuery.length > 0

  const filteredModels = viewModel.filteredModels

  const handleSelect = useCallback(
    (modelId: string) => {
      onModelChange(modelId)
      setOpen(false)
      onSearchChange('')
    },
    [onModelChange, onSearchChange],
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) {
        onSearchChange('')
      }
    },
    [onSearchChange],
  )

  const handleCategoryClick = useCallback(
    (category: string) => {
      onCategoryChange(category)
    },
    [onCategoryChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        onSearchChange('')
        return
      }
    },
    [onSearchChange],
  )

  useEffect(() => {
    if (open && inputRef.current) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          aria-label="Model picker"
          type="button"
          disabled={disabled}
          className="flex h-7 min-w-0 max-w-[320px] items-center gap-1 rounded-[min(var(--radius-md),10px)] border border-input bg-transparent px-2 text-[11px] text-fd-tertiary outline-none transition-colors select-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent"
        >
          <span className="truncate font-mono">
            {selectedModel?.name ?? selectedModelId ?? 'Select model...'}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[520px] overflow-hidden p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div className="flex" role="application" onKeyDown={handleKeyDown}>
          {/* Sidebar */}
          {!isSearching && (
            <div className="w-[140px] shrink-0 border-r border-fd-border-subtle bg-fd-surface/50 p-2">
              <div className="flex flex-col gap-0.5">
                {viewModel.categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryClick(cat.id)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      viewModel.activeCategory === cat.id
                        ? 'bg-fd-ember-400/10 text-fd-primary font-medium'
                        : 'text-fd-secondary hover:bg-fd-surface hover:text-fd-primary'
                    }`}
                  >
                    {CATEGORY_ICONS[cat.id] ?? (
                      <span className="flex size-3.5 items-center justify-center text-[10px]">
                        {cat.label.charAt(0)}
                      </span>
                    )}
                    <span className="flex-1">{CATEGORY_LABELS[cat.id] ?? cat.label}</span>
                    <span className="text-[10px] text-fd-tertiary tabular-nums">{cat.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main content */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Search header */}
            <div className="flex items-center gap-2 border-b border-fd-border-subtle px-3 py-2">
              <Search className="size-3.5 shrink-0 text-fd-tertiary" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search models..."
                value={viewModel.searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-5 w-full bg-transparent text-xs text-fd-primary outline-none placeholder:text-fd-tertiary focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:shadow-none"
              />
              {isSearching ? (
                <button
                  type="button"
                  aria-label="Clear model search"
                  className="flex size-5 shrink-0 items-center justify-center rounded text-fd-tertiary transition-colors hover:bg-fd-surface hover:text-fd-primary"
                  onClick={() => onSearchChange('')}
                >
                  <X className="size-3" />
                </button>
              ) : null}
              {isSearching && (
                <span className="text-[10px] text-fd-tertiary tabular-nums">
                  {filteredModels.length}
                </span>
              )}
            </div>

            {/* Model list */}
            <div
              ref={listRef}
              data-testid="model-picker-list"
              className="h-[360px] overflow-y-auto px-1 py-1"
            >
              {filteredModels.length === 0 ? (
                <div className="py-8 text-center text-xs text-fd-tertiary">
                  No models match your search
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {filteredModels.map((model) => {
                    const isSelected = model.id === selectedModelId
                    const isFav = viewModel.favoriteModelIds.includes(model.id)
                    const isCustom = model.id.startsWith('custom:')

                    return (
                      <div
                        key={model.id}
                        role="button"
                        tabIndex={0}
                        className={`group flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                          isSelected
                            ? 'bg-fd-ember-400/10 text-fd-primary'
                            : 'text-fd-secondary hover:bg-fd-surface hover:text-fd-primary'
                        }`}
                        onClick={() => handleSelect(model.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSelect(model.id)
                        }}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-[13px] leading-tight break-words">
                            {model.name}
                          </span>
                          <span className="truncate font-mono text-[10px] leading-tight text-fd-tertiary">
                            {model.id}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {isCustom ? (
                            <span className="rounded bg-fd-border-subtle px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-fd-tertiary">
                              Custom
                            </span>
                          ) : null}

                          <button
                            type="button"
                            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                            className={`flex size-6 items-center justify-center rounded transition-colors ${
                              isFav
                                ? 'text-fd-ember-400'
                                : 'text-fd-tertiary opacity-0 group-hover:opacity-100 hover:text-fd-primary'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleFavorite(model.id)
                            }}
                          >
                            <Star className="size-3.5" fill={isFav ? 'currentColor' : 'none'} />
                          </button>

                          {isSelected ? (
                            <Check className="size-4 shrink-0 text-fd-ember-400" />
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
