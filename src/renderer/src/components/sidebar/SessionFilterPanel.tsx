import { Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { memo, useCallback, useMemo, useRef, useState } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import type {
  FilteredSessionGroupsResult,
  SidebarDateRange,
  SidebarFilters,
  SidebarProjectOption,
} from './sessionFiltering'

interface SessionFilterPanelProps {
  filters: SidebarFilters
  query: string
  filteredSidebar: FilteredSessionGroupsResult
  isFilterPanelOpen: boolean
  onQueryChange: (event: ChangeEvent<HTMLInputElement>) => void
  onClearQuery: () => void
  onToggleFilterPanel: () => void
  onFocusSearch: () => void
  onUpdateFilters: (nextFilters: Partial<SidebarFilters>) => void
  onToggleTag: (tag: string) => void
  onClearAll: () => void
}

export function SessionFilterPanel({
  filters,
  query,
  filteredSidebar,
  isFilterPanelOpen,
  onQueryChange,
  onClearQuery,
  onToggleFilterPanel,
  onFocusSearch,
  onUpdateFilters,
  onToggleTag,
  onClearAll,
}: SessionFilterPanelProps) {
  return (
    <>
      <SearchBar
        query={query}
        isFilterPanelOpen={isFilterPanelOpen}
        activeFilterCount={filteredSidebar.activeFilterCount}
        onQueryChange={onQueryChange}
        onClearQuery={onClearQuery}
        onToggleFilterPanel={onToggleFilterPanel}
        onFocusSearch={onFocusSearch}
      />

      {isFilterPanelOpen ? (
        <InlineFilterBar
          filters={filters}
          filteredSidebar={filteredSidebar}
          onUpdateFilters={onUpdateFilters}
          onToggleTag={onToggleTag}
          onClearAll={onClearAll}
        />
      ) : null}

      {!isFilterPanelOpen && filteredSidebar.activeFilterCount > 0 ? (
        <FilterChipBar
          filters={filters}
          availableProjects={filteredSidebar.availableProjects}
          onUpdateFilters={onUpdateFilters}
          onToggleTag={onToggleTag}
          onClearAll={onClearAll}
        />
      ) : null}
    </>
  )
}

const SearchBar = memo(function SearchBar({
  query,
  isFilterPanelOpen,
  activeFilterCount,
  onQueryChange,
  onClearQuery,
  onToggleFilterPanel,
  onFocusSearch,
}: {
  query: string
  isFilterPanelOpen: boolean
  activeFilterCount: number
  onQueryChange: (event: ChangeEvent<HTMLInputElement>) => void
  onClearQuery: () => void
  onToggleFilterPanel: () => void
  onFocusSearch: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 border-b border-fd-border-subtle px-2 py-1.5">
      <label className="relative min-w-0 flex-1" htmlFor="session-sidebar-search">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fd-tertiary" />
        <input
          id="session-sidebar-search"
          aria-label="Search sessions"
          className="h-7 w-full rounded-md border border-fd-border-default bg-fd-panel pl-7 pr-2 text-xs text-fd-primary outline-none transition-colors placeholder:text-fd-tertiary focus:border-fd-ember-400"
          placeholder='Search... title:"foo" project:bar'
          type="search"
          value={query}
          onChange={onQueryChange}
          onFocus={onFocusSearch}
        />
      </label>

      <button
        aria-expanded={isFilterPanelOpen}
        aria-label="Toggle advanced filters"
        className={`relative inline-flex size-7 shrink-0 items-center justify-center rounded-md border text-fd-secondary transition-colors hover:text-fd-primary ${
          isFilterPanelOpen
            ? 'border-fd-ember-400/40 bg-fd-ember-500/10 text-fd-ember-400'
            : 'border-fd-border-default bg-fd-panel'
        }`}
        type="button"
        onClick={onToggleFilterPanel}
      >
        <SlidersHorizontal className="size-3" />
        {activeFilterCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-fd-ember-400 text-[8px] font-bold text-fd-inverse">
            {activeFilterCount}
          </span>
        ) : null}
      </button>

      {query.length > 0 ? (
        <button
          aria-label="Clear search query"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fd-tertiary transition-colors hover:text-fd-primary"
          type="button"
          onClick={onClearQuery}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  )
})

const InlineFilterBar = memo(function InlineFilterBar({
  filters,
  filteredSidebar,
  onUpdateFilters,
  onToggleTag,
  onClearAll,
}: {
  filters: SidebarFilters
  filteredSidebar: FilteredSessionGroupsResult
  onUpdateFilters: (next: Partial<SidebarFilters>) => void
  onToggleTag: (tag: string) => void
  onClearAll: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-fd-border-subtle px-2 py-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-fd-tertiary">
          Filters
        </p>
        {filteredSidebar.activeFilterCount > 0 ? (
          <button
            className="text-[10px] text-fd-tertiary transition-colors hover:text-fd-primary"
            type="button"
            onClick={onClearAll}
          >
            Clear all
          </button>
        ) : null}
      </div>

      <ProjectCombobox
        projects={filteredSidebar.availableProjects}
        value={filters.projectKey}
        onChange={(value) => onUpdateFilters({ projectKey: value })}
      />

      <div className="flex gap-1.5">
        <Select
          value={filters.dateRange}
          onValueChange={(value) => onUpdateFilters({ dateRange: value as SidebarDateRange })}
        >
          <SelectTrigger
            size="sm"
            className="flex-1 border-fd-border-default bg-fd-panel text-[11px] text-fd-primary"
            aria-label="Filter sessions by date range"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any time</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7d</SelectItem>
            <SelectItem value="30d">Last 30d</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(value) => onUpdateFilters({ status: value as SidebarFilters['status'] })}
        >
          <SelectTrigger
            size="sm"
            className="flex-1 border-fd-border-default bg-fd-panel text-[11px] text-fd-primary"
            aria-label="Filter sessions by status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="waiting">Waiting</SelectItem>
            <SelectItem value="idle">Idle</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="disconnected">Disconnected</SelectItem>
            <SelectItem value="reconnecting">Reconnecting</SelectItem>
            <SelectItem value="orphaned">Orphaned</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredSidebar.availableTags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {filteredSidebar.availableTags.map((tag) => (
            <button
              key={tag}
              className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                filters.tags.includes(tag)
                  ? 'bg-fd-ember-500/20 text-fd-ember-400'
                  : 'bg-fd-panel text-fd-tertiary hover:text-fd-primary'
              }`}
              type="button"
              onClick={() => onToggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
})

const FilterChipBar = memo(function FilterChipBar({
  filters,
  availableProjects,
  onUpdateFilters,
  onToggleTag,
  onClearAll,
}: {
  filters: SidebarFilters
  availableProjects: SidebarProjectOption[]
  onUpdateFilters: (next: Partial<SidebarFilters>) => void
  onToggleTag: (tag: string) => void
  onClearAll: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-fd-border-subtle px-2 py-1.5">
      {filters.projectKey !== 'all' ? (
        <FilterChip
          label={
            availableProjects.find((project) => project.value === filters.projectKey)?.label ??
            filters.projectKey
          }
          onRemove={() => onUpdateFilters({ projectKey: 'all' })}
        />
      ) : null}
      {filters.status !== 'all' ? (
        <FilterChip label={filters.status} onRemove={() => onUpdateFilters({ status: 'all' })} />
      ) : null}
      {filters.dateRange !== 'all' ? (
        <FilterChip
          label={filters.dateRange}
          onRemove={() => onUpdateFilters({ dateRange: 'all' })}
        />
      ) : null}
      {filters.tags.map((tag) => (
        <FilterChip key={tag} label={tag} onRemove={() => onToggleTag(tag)} />
      ))}
      <button
        className="text-[10px] text-fd-tertiary transition-colors hover:text-fd-primary"
        type="button"
        onClick={onClearAll}
      >
        Clear all
      </button>
    </div>
  )
})

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-fd-ember-400/30 bg-fd-ember-500/10 px-2 py-0.5 text-[10px] text-fd-ember-400">
      {label}
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-full transition-colors hover:text-fd-primary"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
      >
        <X className="size-2.5" />
      </button>
    </span>
  )
}

function ProjectCombobox({
  projects,
  value,
  onChange,
}: {
  projects: SidebarProjectOption[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const lowerSearch = search.toLowerCase()
  const filtered = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.label.toLowerCase().includes(lowerSearch) ||
          (project.workspacePath ?? '').toLowerCase().includes(lowerSearch),
      ),
    [projects, lowerSearch],
  )

  const selectedLabel =
    value === 'all'
      ? 'All projects'
      : (projects.find((project) => project.value === value)?.label ?? value)

  const handleOpen = useCallback(() => {
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    setSearch('')
  }, [])

  const handleSelect = useCallback(
    (nextValue: string) => {
      onChange(nextValue)
      handleClose()
    },
    [onChange, handleClose],
  )

  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-7 w-full items-center justify-between rounded-md border border-fd-border-default bg-fd-panel px-2 text-[11px] text-fd-primary transition-colors hover:border-fd-border-strong"
        aria-label="Filter sessions by project"
        onClick={handleOpen}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className="size-3 shrink-0 text-fd-tertiary" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-fd-border-default bg-fd-surface shadow-md">
          <div className="border-b border-fd-border-subtle px-2 py-1.5">
            <input
              ref={inputRef}
              className="h-6 w-full bg-transparent text-[11px] text-fd-primary outline-none placeholder:text-fd-tertiary"
              placeholder="Search projects..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') handleClose()
              }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              type="button"
              className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] transition-colors hover:bg-white/[0.05] ${
                value === 'all' ? 'text-fd-ember-400' : 'text-fd-primary'
              }`}
              onClick={() => handleSelect('all')}
            >
              {value === 'all' ? (
                <Check className="size-3 shrink-0" />
              ) : (
                <span className="size-3" />
              )}
              All projects ({projects.length})
            </button>
            {filtered.map((project) => (
              <button
                key={project.value}
                type="button"
                className={`flex w-full items-center gap-2 px-2 py-1 text-left transition-colors hover:bg-white/[0.05] ${
                  value === project.value ? 'text-fd-ember-400' : 'text-fd-primary'
                }`}
                onClick={() => handleSelect(project.value)}
              >
                {value === project.value ? (
                  <Check className="size-3 shrink-0" />
                ) : (
                  <span className="size-3" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[11px]">{project.label}</span>
                  {project.workspacePath ? (
                    <span className="block truncate text-[10px] text-fd-tertiary/70">
                      {project.workspacePath}
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-center text-[11px] text-fd-tertiary">
                No matching projects
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
