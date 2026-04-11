import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { LiveSessionModel } from '../../../../shared/ipc/contracts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'

export interface ModelSelectorProps {
  models: LiveSessionModel[]
  selectedModelId: string
  disabled: boolean
  onModelChange: (modelId: string) => void
}

interface ModelGroup {
  provider: string
  models: LiveSessionModel[]
}

function groupModelsByProvider(models: LiveSessionModel[]): ModelGroup[] {
  const map = new Map<string, LiveSessionModel[]>()

  for (const model of models) {
    const provider = model.provider ?? resolveProviderFromName(model.name)
    const bucket = map.get(provider)
    if (bucket) {
      bucket.push(model)
    } else {
      map.set(provider, [model])
    }
  }

  return Array.from(map.entries()).map(([provider, group]) => ({
    provider,
    models: group,
  }))
}

function resolveProviderFromName(name: string): string {
  const lower = name.toLowerCase()
  if (
    lower.includes('claude') ||
    lower.includes('sonnet') ||
    lower.includes('opus') ||
    lower.includes('haiku')
  )
    return 'Anthropic'
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4'))
    return 'OpenAI'
  if (lower.includes('gemini') || lower.includes('gemma')) return 'Google'
  if (lower.includes('qwen')) return 'Alibaba'
  if (lower.includes('deepseek')) return 'DeepSeek'
  if (lower.includes('mistral') || lower.includes('mixtral')) return 'Mistral'
  if (lower.includes('llama') || lower.includes('meta')) return 'Meta'
  if (lower.includes('kimi') || lower.includes('moonshot')) return 'Moonshot'
  if (lower.includes('minimax')) return 'MiniMax'
  if (lower.includes('openrouter')) return 'OpenRouter'
  return 'Other'
}

function isCustomModel(model: LiveSessionModel): boolean {
  return model.id.startsWith('custom:') || Boolean(model.provider)
}

export function ModelSelector({
  models,
  selectedModelId,
  disabled,
  onModelChange,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedModel = models.find((m) => m.id === selectedModelId)

  const filteredGroups = useMemo(() => {
    const query = search.toLowerCase().trim()
    const filtered = query
      ? models.filter(
          (m) =>
            m.name.toLowerCase().includes(query) ||
            m.id.toLowerCase().includes(query) ||
            (m.provider ?? '').toLowerCase().includes(query),
        )
      : models
    return groupModelsByProvider(filtered)
  }, [models, search])

  const totalFiltered = useMemo(
    () => filteredGroups.reduce((sum, g) => sum + g.models.length, 0),
    [filteredGroups],
  )

  const handleSelect = useCallback(
    (modelId: string) => {
      onModelChange(modelId)
      setOpen(false)
      setSearch('')
    },
    [onModelChange],
  )

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) {
      setSearch('')
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          aria-label="Model selector"
          type="button"
          disabled={disabled}
          className="flex h-7 min-w-0 max-w-[200px] items-center gap-1 rounded-[min(var(--radius-md),10px)] border border-input bg-transparent px-2 text-[11px] text-fd-tertiary outline-none transition-colors select-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent"
        >
          <span className="truncate font-mono">
            {selectedModel?.name ?? selectedModelId ?? 'Select model...'}
          </span>
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <DialogHeader className="gap-0">
          <div className="flex items-center justify-between px-4 pt-4 pb-1">
            <DialogTitle className="text-sm font-semibold text-fd-primary">
              Select model
            </DialogTitle>
            <DialogDescription asChild>
              <span className="text-[11px] text-fd-tertiary">
                {totalFiltered} model{totalFiltered !== 1 ? 's' : ''} available
              </span>
            </DialogDescription>
          </div>

          <div className="mx-4 mt-2 mb-0 flex items-center gap-2 rounded-md border border-fd-border-subtle bg-fd-surface px-2.5 py-1.5">
            <SearchIcon className="size-3.5 shrink-0 text-fd-tertiary" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by name, ID, or provider..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-5 w-full bg-transparent text-xs text-fd-primary outline-none placeholder:text-fd-tertiary"
            />
          </div>
        </DialogHeader>

        <div className="max-h-[360px] overflow-y-auto px-2 pt-2 pb-2">
          {filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-xs text-fd-tertiary">
              No models match your search
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.provider} className="mb-1">
                <div className="px-2 pt-2 pb-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
                    {group.provider}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.models.map((model) => {
                    const isSelected = model.id === selectedModelId
                    const isCustom = isCustomModel(model)
                    return (
                      <button
                        key={model.id}
                        type="button"
                        className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors ${
                          isSelected
                            ? 'bg-fd-ember-400/10 text-fd-primary'
                            : 'text-fd-secondary hover:bg-fd-surface hover:text-fd-primary'
                        }`}
                        onClick={() => handleSelect(model.id)}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[13px] leading-tight">{model.name}</span>
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
                          {isSelected ? (
                            <CheckIcon className="size-4 shrink-0 text-fd-ember-400" />
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
