import { useValue } from '@legendapp/state/react'
import {
  ArrowRight,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleDot,
  CornerDownLeft,
  FileText,
  Folder,
  Layers,
  MessageSquareText,
  Search,
  TerminalSquare,
  X,
} from 'lucide-react'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { SessionSearchTarget, SessionTranscript } from '../../../../shared/ipc/contracts'
import type { SessionPreview } from '../../state/sessions/session.model'
import {
  DATE_PRESETS,
  OPERATOR_SUGGESTIONS,
  RESULT_TYPE_LABELS,
  type ResultType,
  SEARCH_SCOPES,
  type SearchResultItem,
  SOURCE_FILTERS,
  STATUS_FILTERS,
  shortenWorkspacePath,
} from '../../state/workflows/full-page-search/full-page-search.helpers'
import {
  FullPageSearchController,
  type ProjectOption,
} from '../../state/workflows/full-page-search/full-page-search.model'
import type { SearchSessionsGateway } from '../../state/workflows/session-search/session-search.model'
import { buildHistoricalTimeline } from '../transcript/buildHistoricalTimeline'
import { TranscriptRenderer } from '../transcript/TranscriptRenderer'
import { Kbd } from '../ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

export interface FullPageSearchProps {
  sessions: SessionPreview[]
  searchSessions?: SearchSessionsGateway
  getSessionTranscript?: (sessionId: string) => Promise<SessionTranscript>
  onSelectSession: (sessionId: string, target?: SessionSearchTarget) => void
}

export function FullPageSearch({
  sessions,
  searchSessions,
  getSessionTranscript,
  onSelectSession,
}: FullPageSearchProps) {
  const controllerRef = useRef<FullPageSearchController | null>(null)
  controllerRef.current ??= new FullPageSearchController(searchSessions)
  const controller = controllerRef.current

  useEffect(() => () => controller.dispose(), [controller])

  const inputRef = useRef<HTMLInputElement | null>(null)
  const vm = useValue(() => controller.buildViewModel(sessions))
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(() => new Set())
  const [transcriptPanel, setTranscriptPanel] = useState<SearchTranscriptState | null>(null)
  const [transcriptScrollKey, setTranscriptScrollKey] = useState(0)
  const inspectorItem = vm.inspectorItem
  const inspectorItemId = inspectorItem?.id ?? null
  const inspectorSessionId = inspectorItem?.session.id ?? null

  useEffect(() => {
    if (!inspectorItemId || !inspectorSessionId || !getSessionTranscript) {
      setTranscriptPanel(null)
      return
    }

    let isCancelled = false
    setTranscriptPanel({
      itemId: inspectorItemId,
      sessionId: inspectorSessionId,
      status: 'loading',
    })

    getSessionTranscript(inspectorSessionId)
      .then((transcript) => {
        if (isCancelled) {
          return
        }

        setTranscriptPanel({
          itemId: inspectorItemId,
          sessionId: inspectorSessionId,
          status: 'ready',
          transcript,
        })
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return
        }

        setTranscriptPanel({
          error: error instanceof Error ? error.message : 'Transcript preview unavailable.',
          itemId: inspectorItemId,
          sessionId: inspectorSessionId,
          status: 'error',
        })
      })

    return () => {
      isCancelled = true
    }
  }, [getSessionTranscript, inspectorItemId, inspectorSessionId])

  const openItem = (item: SearchResultItem) => {
    onSelectSession(item.session.id, item.target)
  }

  const previewItem = (itemId: string | null) => {
    controller.previewItem(itemId)

    if (itemId) {
      setTranscriptScrollKey((current) => current + 1)
    }
  }

  const toggleSessionExpanded = (sessionId: string) => {
    setExpandedSessionIds((current) => {
      const next = new Set(current)

      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }

      return next
    })
  }

  const moveSelection = (delta: number) => {
    const nextItem = controller.moveSelection(vm.visibleItems, delta)

    if (nextItem) {
      scrollResultRowIntoView(nextItem.id)
    }
  }

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSelection(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(-1)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()

      if (controller.flushPendingSearch()) {
        return
      }

      if (vm.selectedItem) {
        openItem(vm.selectedItem)
      }
      return
    }

    if (event.key === 'Backspace' && vm.inputText.length === 0 && vm.chips.length > 0) {
      event.preventDefault()
      controller.removeLastChip()
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-fd-panel/30 px-3 pt-2 sm:px-5">
      <div className="mx-auto flex h-full w-full max-w-[1760px] min-h-0 flex-col gap-3 pb-3">
        <section className="flex flex-col gap-2.5">
          <label
            className="flex min-h-12 cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-fd-border-default bg-fd-surface px-3 py-1.5 transition focus-within:border-fd-border-strong"
            htmlFor="full-page-search-input"
          >
            <Search className="size-4 shrink-0 text-fd-tertiary" />
            {vm.chips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1 rounded-md border border-fd-ember-400/40 bg-fd-ember-400/10 px-1.5 py-0.5 text-xs text-fd-primary"
              >
                <span className="font-medium text-fd-ember-300">{chip.key}:</span>
                <span>{chip.value}</span>
                <button
                  aria-label={`Remove filter ${chip.key}:${chip.value}`}
                  className="rounded-sm text-fd-tertiary transition hover:text-fd-primary"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    controller.removeChip(chip.id)
                    inputRef.current?.focus()
                  }}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              aria-label="Search sessions, messages, tools, files, outputs"
              className="h-8 min-w-40 flex-1 bg-transparent text-sm text-fd-primary outline-none placeholder:text-fd-tertiary focus-visible:shadow-none focus-visible:outline-none"
              id="full-page-search-input"
              placeholder={
                vm.chips.length > 0
                  ? 'Refine query...'
                  : 'Search sessions, messages, tools, files...'
              }
              value={vm.inputText}
              onChange={(event) => controller.setInputText(event.target.value)}
              onKeyDown={handleInputKeyDown}
            />
            <span className="hidden shrink-0 items-center gap-1 text-[11px] text-fd-tertiary lg:inline-flex">
              <Kbd className="bg-white/5 text-fd-tertiary">↑↓</Kbd>
              <span>navigate</span>
              <Kbd className="bg-white/5 text-fd-tertiary">↵</Kbd>
              <span>open</span>
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              aria-label="Result scopes"
              className="flex flex-wrap items-center gap-1"
              role="tablist"
            >
              {SEARCH_SCOPES.map((scopeOption) => {
                const isActive = vm.scope === scopeOption.id
                const count = vm.scopeCounts[scopeOption.id]

                return (
                  <button
                    key={scopeOption.id}
                    aria-selected={isActive}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      isActive
                        ? 'bg-fd-ember-400/15 text-fd-primary ring-1 ring-fd-ember-400/40'
                        : 'text-fd-secondary hover:bg-white/[0.04] hover:text-fd-primary'
                    }`}
                    role="tab"
                    type="button"
                    onClick={() => controller.setScope(scopeOption.id)}
                  >
                    {scopeOption.label}
                    {count > 0 ? (
                      <span className="ml-1.5 tabular-nums text-fd-tertiary">{count}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                icon={<Folder className="size-3" />}
                label="Project"
                value={summarizeSelection(vm.selectedProjects, 'Any')}
                isActive={vm.selectedProjects.length > 0}
                contentClassName="w-80"
              >
                <ProjectOptionList
                  projects={vm.projects}
                  searchQuery={vm.projectSearchQuery}
                  selected={vm.selectedProjects}
                  onSearchChange={controller.setProjectSearchQuery}
                  onToggle={controller.toggleProject}
                />
              </FilterChip>
              <FilterChip
                icon={<CalendarDays className="size-3" />}
                label="Date"
                value={
                  DATE_PRESETS.find((preset) => preset.id === vm.datePreset)?.label ?? 'Any time'
                }
                isActive={vm.datePreset !== 'any'}
              >
                <div className="grid gap-0.5">
                  {DATE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={`rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-white/[0.05] ${
                        vm.datePreset === preset.id ? 'text-fd-primary' : 'text-fd-secondary'
                      }`}
                      type="button"
                      onClick={() => controller.setDatePreset(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </FilterChip>
              <FilterChip
                icon={<CircleDot className="size-3" />}
                label="Status"
                value={summarizeSelection(vm.selectedStatuses, 'Any')}
                isActive={vm.selectedStatuses.length > 0}
              >
                <FilterOptionList
                  options={[...STATUS_FILTERS]}
                  selected={vm.selectedStatuses}
                  onToggle={controller.toggleStatus}
                />
              </FilterChip>
              <FilterChip
                icon={<Layers className="size-3" />}
                label="Source"
                value={summarizeSelection(vm.selectedSources, 'Any')}
                isActive={vm.selectedSources.length > 0}
              >
                <FilterOptionList
                  options={SOURCE_FILTERS.map((source) => source.id)}
                  optionLabels={Object.fromEntries(
                    SOURCE_FILTERS.map((source) => [source.id, source.label]),
                  )}
                  selected={vm.selectedSources}
                  onToggle={controller.toggleSource}
                />
              </FilterChip>
            </div>
          </div>
        </section>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(340px,40rem)_minmax(0,1fr)]">
          <section
            aria-label="Search results"
            className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-fd-border-default bg-fd-panel/80"
          >
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {vm.error ? (
                <div className="rounded-lg border border-fd-ember-400/30 bg-fd-ember-500/10 px-3 py-2 text-sm text-fd-ember-300">
                  {vm.error}
                </div>
              ) : null}
              {!vm.error && vm.isSearching ? (
                <div className="px-3 py-8 text-center text-sm text-fd-secondary">
                  Searching across indexed sessions...
                </div>
              ) : null}
              {vm.showEmptyState ? (
                <SearchEmptyState
                  hasSearched={vm.hasSearched}
                  onAddOperator={(example) => {
                    controller.addOperatorExample(example)
                    inputRef.current?.focus()
                  }}
                />
              ) : null}
              {!vm.error && !vm.isSearching && vm.visibleItems.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {vm.hasQuery && vm.scope === 'all'
                    ? groupItemsBySession(vm.visibleItems).map((section) => (
                        <SessionResultGroup
                          key={section.session.id}
                          isExpanded={expandedSessionIds.has(section.session.id)}
                          highlightQuery={vm.query}
                          section={section}
                          selectedItemId={vm.selectedItem?.id ?? null}
                          onHover={previewItem}
                          onOpen={openItem}
                          onSelect={controller.selectItem}
                          onToggleExpanded={toggleSessionExpanded}
                        />
                      ))
                    : vm.groupedSections.map((section) => (
                        <section key={section.type} className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 px-2 pt-1">
                            <ResultTypeIcon type={section.type} />
                            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fd-tertiary">
                              {RESULT_TYPE_LABELS[section.type]}
                            </h3>
                            <span className="text-[10px] tabular-nums text-fd-tertiary">
                              {section.items.length}
                            </span>
                            <div className="h-px flex-1 bg-fd-border-subtle" />
                          </div>
                          {section.items.map((item) => (
                            <ResultRow
                              key={item.id}
                              highlightQuery={vm.query}
                              isSelected={vm.selectedItem?.id === item.id}
                              item={item}
                              onHover={previewItem}
                              onOpen={() => openItem(item)}
                              onSelect={() => controller.selectItem(item.id)}
                            />
                          ))}
                        </section>
                      ))}
                  {vm.canLoadMore ? (
                    <button
                      className="rounded-xl border border-fd-border-subtle bg-fd-surface/70 px-4 py-2 text-sm font-medium text-fd-secondary transition hover:border-fd-border-strong hover:text-fd-primary disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={vm.isSearching}
                      type="button"
                      onClick={controller.loadMoreResults}
                    >
                      {vm.isSearching ? 'Loading more results...' : 'Load more results'}
                      <span className="ml-2 text-xs font-normal text-fd-tertiary">
                        Showing {vm.visibleItems.length}
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          <aside
            aria-label="Transcript preview"
            className="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-fd-border-default bg-fd-panel/85 lg:flex"
          >
            {vm.inspectorItem ? (
              <TranscriptSearchInspector
                highlightQuery={vm.query}
                item={vm.inspectorItem}
                relatedMatches={vm.relatedMatches}
                transcriptScrollKey={transcriptScrollKey}
                transcriptPanel={transcriptPanel}
                onOpen={openItem}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <FileText className="size-7 text-fd-tertiary" />
                <p className="text-sm font-medium text-fd-primary">Nothing selected</p>
                <p className="text-xs leading-5 text-fd-tertiary">
                  Hover or arrow through results to preview details here before opening a session.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}

interface SessionResultSection {
  items: SearchResultItem[]
  session: SessionPreview
}

interface SearchTranscriptState {
  itemId: string
  sessionId: string
  status: 'loading' | 'ready' | 'error'
  transcript?: SessionTranscript
  error?: string
}

function SessionResultGroup({
  highlightQuery,
  isExpanded,
  section,
  selectedItemId,
  onHover,
  onOpen,
  onSelect,
  onToggleExpanded,
}: {
  highlightQuery: string
  isExpanded: boolean
  section: SessionResultSection
  selectedItemId: string | null
  onHover: (itemId: string | null) => void
  onOpen: (item: SearchResultItem) => void
  onSelect: (itemId: string) => void
  onToggleExpanded: (sessionId: string) => void
}) {
  const primaryItem = section.items[0]
  const contentItems = section.items.filter((item) => !isSessionMetadataOnly(item))
  const visibleItems = isExpanded ? contentItems : contentItems.slice(0, 3)
  const hiddenCount = contentItems.length - visibleItems.length
  const isSelected = primaryItem ? selectedItemId === primaryItem.id : false

  return (
    <section className="overflow-hidden rounded-lg border border-fd-border-subtle bg-fd-surface/25">
      <button
        aria-current={isSelected}
        className={`group flex w-full items-center gap-2 border-b border-fd-border-subtle px-2.5 py-1.5 text-left transition ${
          isSelected ? 'bg-fd-ember-400/[0.08]' : 'bg-white/[0.018] hover:bg-white/[0.04]'
        }`}
        data-search-result-id={primaryItem?.id}
        type="button"
        onClick={() => {
          if (primaryItem) {
            onOpen(primaryItem)
          }
        }}
        onFocus={() => {
          if (primaryItem) {
            onSelect(primaryItem.id)
          }
        }}
        onMouseEnter={() => {
          if (primaryItem) {
            onHover(primaryItem.id)
          }
        }}
      >
        <ResultTypeIcon type={primaryItem?.type ?? 'session'} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-fd-primary">
              <HighlightedText query={highlightQuery} value={section.session.title} />
            </span>
            <span className="shrink-0 text-[10px] text-fd-tertiary">
              {section.session.projectLabel}
            </span>
            {section.session.lastActivityAt ? (
              <span className="shrink-0 text-[10px] text-fd-tertiary">
                {formatRelativeDate(section.session.lastActivityAt)}
              </span>
            ) : null}
          </span>
          {section.session.projectWorkspacePath ? (
            <code className="block truncate font-mono text-[10px] leading-4 text-fd-tertiary">
              {shortenWorkspacePath(section.session.projectWorkspacePath)}
            </code>
          ) : null}
        </span>
        <span className="shrink-0 rounded-full border border-fd-border-subtle bg-fd-panel px-1.5 py-0.5 text-[10px] tabular-nums text-fd-tertiary">
          {section.items.length} {section.items.length === 1 ? 'hit' : 'hits'}
        </span>
      </button>
      {visibleItems.length > 0 || contentItems.length > 3 ? (
        <div className="flex flex-col gap-0.5 p-1">
          {visibleItems.map((item) => (
            <ResultRow
              key={item.id}
              compact
              highlightQuery={highlightQuery}
              isSelected={selectedItemId === item.id}
              item={item}
              onHover={onHover}
              onOpen={() => onOpen(item)}
              onSelect={() => onSelect(item.id)}
            />
          ))}
          {contentItems.length > 3 ? (
            <button
              className="mx-1 rounded-md border border-fd-border-subtle bg-fd-panel/70 px-2.5 py-1 text-left text-[11px] font-medium text-fd-secondary transition hover:border-fd-border-strong hover:text-fd-primary"
              type="button"
              onClick={() => onToggleExpanded(section.session.id)}
            >
              {isExpanded
                ? 'Show fewer matches'
                : `View all ${contentItems.length} message matches`}
              {!isExpanded ? (
                <span className="ml-1 font-normal text-fd-tertiary">
                  ({hiddenCount} more in this session)
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function SearchEmptyState({
  hasSearched,
  onAddOperator,
}: {
  hasSearched: boolean
  onAddOperator: (example: string) => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <Search className="size-8 text-fd-tertiary" />
      <div>
        <p className="text-sm font-medium text-fd-primary">
          {hasSearched ? 'No results found' : 'Search everything Droid remembers'}
        </p>
        <p className="mt-1 text-xs text-fd-tertiary">
          {hasSearched
            ? 'Try broader text, fewer filters, or a different scope.'
            : 'Type to search instantly, or narrow with operators and filter chips.'}
        </p>
      </div>
      <div className="flex max-w-xl flex-wrap items-center justify-center gap-1.5">
        {OPERATOR_SUGGESTIONS.slice(0, 8).map((suggestion) => (
          <button
            key={suggestion.key}
            className="rounded-md border border-fd-border-subtle bg-fd-surface px-2 py-1 font-mono text-[11px] text-fd-secondary transition hover:border-fd-border-strong hover:text-fd-primary"
            title={suggestion.hint}
            type="button"
            onClick={() => onAddOperator(suggestion.example)}
          >
            {suggestion.example}
          </button>
        ))}
      </div>
    </div>
  )
}

function FilterChip({
  children,
  contentClassName,
  icon,
  isActive,
  label,
  value,
}: {
  children: ReactNode
  contentClassName?: string
  icon: ReactNode
  isActive: boolean
  label: string
  value: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition ${
            isActive
              ? 'border-fd-ember-400/40 bg-fd-ember-400/10 text-fd-primary'
              : 'border-fd-border-subtle bg-fd-surface text-fd-secondary hover:border-fd-border-strong hover:text-fd-primary'
          }`}
          type="button"
        >
          <span className="text-fd-tertiary">{icon}</span>
          <span className="text-fd-tertiary">{label}:</span>
          <span className="max-w-32 truncate font-medium">{value}</span>
          <ChevronDown className="size-3 text-fd-tertiary" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={`border border-fd-border-default bg-fd-panel p-1.5 ${contentClassName ?? 'w-56'}`}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

function ProjectOptionList({
  projects,
  searchQuery,
  selected,
  onSearchChange,
  onToggle,
}: {
  projects: ProjectOption[]
  searchQuery: string
  selected: string[]
  onSearchChange: (query: string) => void
  onToggle: (projectLabel: string) => void
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-fd-border-subtle px-2 pb-1.5 pt-0.5">
        <Search className="size-3.5 shrink-0 text-fd-tertiary" />
        <input
          aria-label="Search projects"
          className="h-6 w-full bg-transparent text-xs text-fd-primary outline-none placeholder:text-fd-tertiary focus-visible:shadow-none focus-visible:outline-none"
          placeholder="Search projects..."
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {searchQuery.length > 0 ? (
          <button
            aria-label="Clear project search"
            className="rounded-sm text-fd-tertiary transition hover:text-fd-primary"
            type="button"
            onClick={() => onSearchChange('')}
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>
      {projects.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-fd-tertiary">
          {searchQuery.length > 0 ? 'No matching projects.' : 'No projects indexed yet.'}
        </p>
      ) : (
        <div className="mt-1 grid max-h-72 gap-0.5 overflow-y-auto overflow-x-hidden">
          {projects.map((project) => (
            <label
              key={project.label}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-fd-secondary transition hover:bg-white/[0.05] hover:text-fd-primary"
            >
              <input
                checked={selected.includes(project.label)}
                className="size-3.5 shrink-0 accent-fd-ember-400"
                type="checkbox"
                onChange={() => onToggle(project.label)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{project.label}</span>
                {project.workspacePath ? (
                  <span
                    className="block truncate font-mono text-[10px] leading-4 text-fd-tertiary"
                    title={project.workspacePath}
                  >
                    {shortenWorkspacePath(project.workspacePath)}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterOptionList({
  emptyLabel,
  optionLabels,
  options,
  selected,
  onToggle,
}: {
  emptyLabel?: string
  optionLabels?: Record<string, string>
  options: string[]
  selected: string[]
  onToggle: (option: string) => void
}) {
  if (options.length === 0) {
    return <p className="px-2 py-1.5 text-xs text-fd-tertiary">{emptyLabel ?? 'No options.'}</p>
  }

  return (
    <div className="grid max-h-64 gap-0.5 overflow-y-auto">
      {options.map((option) => (
        <label
          key={option}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-fd-secondary transition hover:bg-white/[0.05] hover:text-fd-primary"
        >
          <input
            checked={selected.includes(option)}
            className="size-3.5 accent-fd-ember-400"
            type="checkbox"
            onChange={() => onToggle(option)}
          />
          <span className="min-w-0 truncate capitalize">{optionLabels?.[option] ?? option}</span>
        </label>
      ))}
    </div>
  )
}

function ResultRow({
  compact = false,
  highlightQuery,
  isSelected,
  item,
  onHover,
  onOpen,
  onSelect,
}: {
  compact?: boolean
  highlightQuery: string
  isSelected: boolean
  item: SearchResultItem
  onHover: (itemId: string | null) => void
  onOpen: () => void
  onSelect: () => void
}) {
  const metadataOnly = isSessionMetadataOnly(item)
  const rowPadding = compact ? 'px-2 py-1.5' : metadataOnly ? 'px-2.5 py-1.5' : 'px-2.5 py-2'

  return (
    <button
      aria-current={isSelected}
      className={`group flex w-full items-start gap-2 rounded-md border ${rowPadding} text-left transition ${
        isSelected
          ? 'border-fd-ember-400/40 bg-fd-ember-400/[0.08]'
          : 'border-transparent hover:border-fd-border-subtle hover:bg-white/[0.03]'
      }`}
      data-search-result-id={item.id}
      type="button"
      onClick={onOpen}
      onFocus={onSelect}
      onMouseEnter={() => onHover(item.id)}
    >
      <span className="mt-0.5 shrink-0 opacity-80">
        <ResultTypeIcon type={item.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-fd-secondary">
            {RESULT_TYPE_LABELS[item.type]}
          </span>
          <span className="min-w-0 truncate text-[11px] text-fd-tertiary">
            {metadataOnly ? item.session.projectLabel : item.session.title}
          </span>
          {!metadataOnly && item.session.lastActivityAt ? (
            <span className="shrink-0 text-[10px] text-fd-tertiary">
              {formatRelativeDate(item.session.lastActivityAt)}
            </span>
          ) : null}
        </span>
        {metadataOnly ? (
          <span className="mt-0.5 block truncate text-[13px] font-semibold text-fd-primary">
            <HighlightedText query={highlightQuery} value={item.session.title} />
          </span>
        ) : null}
        {item.reason?.snippet ? (
          <span
            className={`mt-0.5 block text-fd-secondary ${
              compact ? 'line-clamp-2 text-[12px] leading-5' : 'line-clamp-3 text-[13px] leading-5'
            }`}
          >
            <HighlightedText query={highlightQuery} value={item.reason.snippet} />
          </span>
        ) : null}
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-fd-tertiary">
          <span className="capitalize">{item.session.status}</span>
          {item.reason ? <span className="truncate">{describeResultMatch(item)}</span> : null}
        </span>
      </span>
      <ArrowRight
        className={`mt-1 size-3 shrink-0 transition ${
          isSelected ? 'text-fd-primary' : 'text-transparent group-hover:text-fd-tertiary'
        }`}
      />
    </button>
  )
}

function TranscriptSearchInspector({
  highlightQuery,
  item,
  relatedMatches,
  transcriptScrollKey,
  transcriptPanel,
  onOpen,
}: {
  highlightQuery: string
  item: SearchResultItem
  relatedMatches: SearchResultItem[]
  transcriptScrollKey: number
  transcriptPanel: SearchTranscriptState | null
  onOpen: (item: SearchResultItem) => void
}) {
  const itemReason = item.reason
  const itemTarget = item.target
  const searchTarget = useMemo(
    () =>
      createSearchTargetFromParts({
        messageId: itemTarget?.messageId ?? itemReason?.messageId,
        sessionId: item.session.id,
        sourceId: itemTarget?.sourceId ?? itemReason?.sourceId,
        sourceKind: itemTarget?.sourceKind ?? itemReason?.sourceKind,
        toolCallId: itemTarget?.toolCallId ?? itemReason?.toolCallId,
      }),
    [
      item.session.id,
      itemReason?.messageId,
      itemReason?.sourceId,
      itemReason?.sourceKind,
      itemReason?.toolCallId,
      itemTarget?.messageId,
      itemTarget?.sourceId,
      itemTarget?.sourceKind,
      itemTarget?.toolCallId,
    ],
  )
  const timelineItems = transcriptPanel?.transcript
    ? buildHistoricalTimeline(transcriptPanel.transcript.entries)
    : []
  const transcriptScrollContextKey = `search-transcript:${item.session.id}:${item.id}:${transcriptScrollKey}`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-fd-border-subtle bg-fd-surface/35 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-fd-tertiary">
              <span className="rounded-md border border-fd-border-subtle bg-fd-panel px-1.5 py-0.5">
                {RESULT_TYPE_LABELS[item.type]}
              </span>
              <span className="truncate">{describeResultMatch(item)}</span>
            </div>
            <h2 className="line-clamp-2 text-[15px] font-semibold leading-5 text-fd-primary">
              <HighlightedText query={highlightQuery} value={item.session.title} />
            </h2>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-fd-tertiary">
              <span>{item.session.projectLabel}</span>
              <span className="capitalize">{item.session.status}</span>
              {item.session.lastActivityAt ? (
                <span>{formatRelativeDate(item.session.lastActivityAt)}</span>
              ) : null}
              <span>{Math.round(item.score)} relevance</span>
            </div>
          </div>
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-fd-ember-400/15 px-2.5 py-1.5 text-xs font-medium text-fd-primary ring-1 ring-fd-ember-400/40 transition hover:bg-fd-ember-400/25"
            type="button"
            onClick={() => onOpen(item)}
          >
            {item.target ? 'Open match' : 'Open session'}
            <CornerDownLeft className="size-3" />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
        <div className="border-b border-fd-border-subtle bg-fd-panel/50 p-3">
          <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
            <div className="rounded-lg border border-fd-ember-400/20 bg-fd-surface/80 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-fd-tertiary">
                Match
              </p>
              <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-[13px] leading-6 text-fd-secondary">
                <HighlightedText
                  query={highlightQuery}
                  value={item.reason?.snippet || item.session.title}
                />
              </p>
            </div>

            <div className="grid gap-2 rounded-lg border border-fd-border-subtle bg-fd-surface/45 p-3 text-xs">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <InspectorField label="Project" value={item.session.projectLabel} />
                <InspectorField label="Status" value={item.session.status} />
                <InspectorField label="Transport" value={item.session.transport ?? 'unknown'} />
                <InspectorField
                  label="Last activity"
                  value={
                    item.session.lastActivityAt
                      ? formatFullDate(item.session.lastActivityAt)
                      : 'Unknown'
                  }
                />
                {item.reason ? (
                  <>
                    <InspectorField
                      label="Source"
                      value={formatSourceKind(item.reason.sourceKind)}
                    />
                    <InspectorField label="Field" value={formatReasonField(item.reason.field)} />
                  </>
                ) : null}
              </dl>
              {item.session.projectWorkspacePath ? (
                <code className="block truncate border-t border-fd-border-subtle pt-2 font-mono text-[11px] leading-4 text-fd-tertiary">
                  {item.session.projectWorkspacePath}
                </code>
              ) : null}
            </div>
          </div>

          {relatedMatches.length > 0 ? (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {relatedMatches.slice(0, 10).map((relatedItem) => (
                <button
                  key={relatedItem.id}
                  className="min-w-40 rounded-md border border-fd-border-subtle bg-fd-surface/55 px-2 py-1.5 text-left transition hover:border-fd-border-strong hover:bg-white/[0.04]"
                  type="button"
                  onClick={() => onOpen(relatedItem)}
                >
                  <span className="flex items-center gap-1 text-[10px] font-medium text-fd-tertiary">
                    <ResultTypeIcon type={relatedItem.type} />
                    {RESULT_TYPE_LABELS[relatedItem.type]}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-fd-secondary">
                    <HighlightedText
                      query={highlightQuery}
                      value={relatedItem.reason?.snippet ?? describeResultMatch(relatedItem)}
                    />
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 bg-fd-panel/30">
          {transcriptPanel?.itemId === item.id && transcriptPanel.status === 'ready' ? (
            <TranscriptRenderer
              items={timelineItems}
              isLive={false}
              isLoading={false}
              searchTarget={searchTarget}
              scrollContextKey={transcriptScrollContextKey}
              scrollPersistenceEnabled={false}
            />
          ) : transcriptPanel?.itemId === item.id && transcriptPanel.status === 'error' ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-fd-tertiary">
              {transcriptPanel.error ?? 'Transcript preview unavailable.'}
            </div>
          ) : (
            <TranscriptRenderer
              items={[]}
              isLive={false}
              isLoading={Boolean(transcriptPanel && transcriptPanel.itemId === item.id)}
              searchTarget={searchTarget}
              scrollContextKey={`${transcriptScrollContextKey}:loading`}
              scrollPersistenceEnabled={false}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function InspectorField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-fd-tertiary">
        {label}
      </dt>
      <dd className="mt-0.5 truncate capitalize text-fd-secondary">{value}</dd>
    </div>
  )
}

function ResultTypeIcon({ type }: { type: ResultType }) {
  const className = 'size-3.5 text-fd-tertiary'

  switch (type) {
    case 'user-message':
    case 'assistant-message':
    case 'message':
      return <MessageSquareText className={className} />
    case 'tool':
      return <TerminalSquare className={className} />
    case 'file':
      return <FileText className={className} />
    case 'summary':
      return <Layers className={className} />
    case 'todo':
      return <CheckSquare className={className} />
    case 'detail':
      return <FileText className={className} />
    case 'session':
      return <Folder className={className} />
  }
}

function groupItemsBySession(items: SearchResultItem[]): SessionResultSection[] {
  const sections = new Map<string, SessionResultSection>()

  for (const item of items) {
    const existing = sections.get(item.session.id)

    if (existing) {
      existing.items.push(item)
      continue
    }

    sections.set(item.session.id, {
      items: [item],
      session: item.session,
    })
  }

  return [...sections.values()]
}

function createSearchTargetFromParts(parts: {
  sessionId: string
  sourceKind?: SessionSearchTarget['sourceKind']
  sourceId?: string
  messageId?: string | null
  toolCallId?: string | null
}): SessionSearchTarget | null {
  if (!parts.sourceKind || !parts.sourceId) {
    return null
  }

  return {
    messageId: parts.messageId,
    sessionId: parts.sessionId,
    sourceId: parts.sourceId,
    sourceKind: parts.sourceKind,
    toolCallId: parts.toolCallId,
  }
}

function isSessionMetadataOnly(item: SearchResultItem): boolean {
  return item.type === 'session' && !item.reason?.snippet
}

function describeResultMatch(item: SearchResultItem): string {
  const reason = item.reason

  if (!reason) {
    return 'Session metadata match'
  }

  const source = formatSourceKind(reason.sourceKind)
  const field = formatReasonField(reason.field)

  if (reason.sourceKind === 'tool_result' && reason.field === 'content') {
    return 'Tool output matched transcript text'
  }

  if (reason.sourceKind === 'tool_call' && reason.field === 'command') {
    return 'Tool call matched command'
  }

  if (reason.sourceKind === 'tool_call' && reason.field === 'tool') {
    return 'Tool call matched tool name'
  }

  if (reason.sourceKind === 'block' && reason.field === 'content') {
    if (item.type === 'user-message') {
      return 'User message matched transcript text'
    }

    if (item.type === 'assistant-message') {
      return 'Assistant message matched transcript text'
    }

    return 'Message matched transcript text'
  }

  if (reason.sourceKind === 'file_snapshot') {
    return `File snapshot matched ${field}`
  }

  return `${source} matched ${field}`
}

function formatSourceKind(
  sourceKind: NonNullable<SearchResultItem['reason']>['sourceKind'],
): string {
  switch (sourceKind) {
    case 'block':
      return 'Message'
    case 'tool_call':
      return 'Tool call'
    case 'tool_result':
      return 'Tool output'
    case 'file_snapshot':
      return 'File snapshot'
    case 'compaction':
      return 'Summary'
    case 'settings':
      return 'Settings'
    case 'todo':
      return 'Todo'
    case 'session':
    case undefined:
      return 'Session'
  }
}

function formatReasonField(field: NonNullable<SearchResultItem['reason']>['field']): string {
  switch (field) {
    case 'content':
      return 'transcript text'
    case 'path':
      return 'workspace path'
    case 'file':
      return 'file path'
    case 'command':
      return 'command'
    case 'tool':
      return 'tool name'
    case 'issue':
      return 'issue key'
    case 'error':
      return 'error text'
    case 'id':
      return 'session id'
    case 'title':
      return 'session title'
    case 'project':
      return 'project'
    case 'status':
      return 'status'
    case 'source':
    case 'kind':
      return 'source type'
    case 'model':
      return 'model'
    case 'reasoning':
      return 'reasoning'
    case 'transport':
      return 'transport'
    case 'favorite':
      return 'favorite state'
    case 'extension':
      return 'file extension'
  }
}

function HighlightedText({ query, value }: { query: string; value: string }) {
  const terms = getHighlightTerms(query)

  if (terms.length === 0) {
    return value
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'giu')
  const parts = value.split(pattern)
  let characterOffset = 0

  return (
    <>
      {parts.map((part) => {
        const key = `${characterOffset}:${part}`
        characterOffset += part.length

        return terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
          <mark
            key={key}
            className="rounded bg-fd-ember-400/20 px-0.5 text-fd-primary ring-1 ring-fd-ember-400/25"
          >
            {part}
          </mark>
        ) : (
          part
        )
      })}
    </>
  )
}

function getHighlightTerms(rawQuery: string): string[] {
  return [
    ...new Set(
      rawQuery
        .replaceAll('"', ' ')
        .split(/\s+OR\s+|[\s,]+/iu)
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => token.replace(/^[a-z]+:/iu, ''))
        .filter((token) => token.length >= 3),
    ),
  ].slice(0, 8)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function scrollResultRowIntoView(itemId: string): void {
  for (const element of document.querySelectorAll<HTMLElement>('[data-search-result-id]')) {
    if (element.dataset.searchResultId === itemId) {
      element.scrollIntoView?.({ block: 'nearest' })
      return
    }
  }
}

function summarizeSelection(values: string[], fallback: string): string {
  if (values.length === 0) {
    return fallback
  }

  if (values.length === 1) {
    return values[0]
  }

  return `${values[0]} +${values.length - 1}`
}

function formatRelativeDate(value: string): string {
  const timestamp = Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return ''
  }

  const deltaMs = Date.now() - timestamp
  const minutes = Math.round(deltaMs / 60_000)

  if (minutes < 1) {
    return 'just now'
  }

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)

  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.round(hours / 24)

  if (days < 30) {
    return `${days}d ago`
  }

  return formatFullDate(value)
}

function formatFullDate(value: string): string {
  const timestamp = Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp))
}
