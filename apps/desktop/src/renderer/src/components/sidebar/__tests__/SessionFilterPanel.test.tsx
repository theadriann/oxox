// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SessionFilterPanel } from '../SessionFilterPanel'
import { DEFAULT_SIDEBAR_FILTERS, type FilteredSessionGroupsResult } from '../sessionFiltering'

function createFilteredSidebarResult(): FilteredSessionGroupsResult {
  return {
    groups: [],
    pinnedSessions: [],
    activeFilterCount: 3,
    availableProjects: [
      {
        value: 'project-alpha',
        label: 'project-alpha',
        workspacePath: '/tmp/project-alpha',
      },
    ],
    availableTags: ['alpha'],
    hasMatches: true,
    isFiltering: true,
  }
}

describe('SessionFilterPanel', () => {
  it('shows active filters and forwards clear-all actions', async () => {
    const onClearAll = vi.fn()

    render(
      <SessionFilterPanel
        filters={{
          ...DEFAULT_SIDEBAR_FILTERS,
          query: 'alpha',
          status: 'active',
          tags: ['alpha'],
        }}
        query="alpha"
        filteredSidebar={createFilteredSidebarResult()}
        isFilterPanelOpen={true}
        onQueryChange={vi.fn()}
        onClearQuery={vi.fn()}
        onToggleFilterPanel={vi.fn()}
        onFocusSearch={vi.fn()}
        onUpdateFilters={vi.fn()}
        onToggleTag={vi.fn()}
        onClearAll={onClearAll}
      />,
    )

    expect(screen.getByRole('button', { name: /toggle advanced filters/i })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }))

    expect(onClearAll).toHaveBeenCalled()
  })
})
