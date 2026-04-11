// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { ProjectSessionGroup } from '../../../stores/SessionStore'
import { TooltipProvider } from '../../ui/tooltip'
import { ProjectGroup } from '../ProjectGroup'
import { SessionSidebarStore } from '../SessionSidebarStore'

function createProjectGroup(overrides: Partial<ProjectSessionGroup> = {}): ProjectSessionGroup {
  return {
    key: 'project-alpha',
    label: 'project-alpha',
    workspacePath: '/tmp/project-alpha',
    latestActivityAt: Date.parse('2026-03-25T00:00:00.000Z'),
    sessions: [],
    ...overrides,
  }
}

describe('ProjectGroup', () => {
  it('supports project-level new-session and rename actions', async () => {
    const store = new SessionSidebarStore()
    const onNewSession = vi.fn()
    const onSetProjectDisplayName = vi.fn()

    render(
      <TooltipProvider>
        <ProjectGroup
          group={createProjectGroup()}
          collapsed={false}
          isEditing={false}
          store={store}
          onToggleProject={vi.fn()}
          onNewSession={onNewSession}
          onSetProjectDisplayName={onSetProjectDisplayName}
          onArchiveProject={vi.fn()}
        />
      </TooltipProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: /create session in project-alpha/i }))
    expect(onNewSession).toHaveBeenCalledWith('/tmp/project-alpha')

    await userEvent.click(screen.getByRole('button', { name: /more actions for project-alpha/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /rename workspace/i }))

    expect(store.editingProjectKey).toBe('project-alpha')
  })
})
