// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GitDiffPanel } from '../GitDiffPanel'

describe('GitDiffPanel', () => {
  it('renders git diff stats and actions', () => {
    const onRefresh = vi.fn()
    const onCommit = vi.fn()
    const onPush = vi.fn()
    const onCreatePullRequest = vi.fn()

    render(
      <GitDiffPanel
        diff={{
          success: true,
          data: {
            diff: 'diff --git a/src/App.tsx b/src/App.tsx',
            branch: 'feature/oxo-22',
            baseBranch: 'main',
            files: [{ path: 'src/App.tsx', additions: 2, deletions: 1, status: 'modified' }],
            totalAdditions: 2,
            totalDeletions: 1,
            remoteUrl: 'https://github.com/theadriann/oxox.git',
            commits: [{ hash: 'abc123', message: 'Add git workflow support' }],
            committedDiff: '',
            committedFiles: [],
            committedTotalAdditions: 0,
            committedTotalDeletions: 0,
            unstagedDiff: '',
            unstagedFiles: [],
            unstagedTotalAdditions: 0,
            unstagedTotalDeletions: 0,
          },
        }}
        isActionRunning={false}
        isLoading={false}
        selectedSessionId="session-daemon"
        onCommit={onCommit}
        onCreatePullRequest={onCreatePullRequest}
        onPush={onPush}
        onRefresh={onRefresh}
      />,
    )

    expect(screen.getByText('Git Diff')).toBeDefined()
    expect(screen.getByText('feature/oxo-22')).toBeDefined()
    expect(screen.getByText('+2')).toBeDefined()
    expect(screen.getByText('-1')).toBeDefined()
    expect(screen.getByText('src/App.tsx')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh git diff' }))
    fireEvent.click(screen.getByRole('button', { name: 'Commit changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Push branch' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create pull request' }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onPush).toHaveBeenCalledTimes(1)
    expect(onCreatePullRequest).toHaveBeenCalledTimes(1)
  })

  it('uses transport-neutral empty state copy for local and daemon sessions', () => {
    render(
      <GitDiffPanel
        diff={null}
        isActionRunning={false}
        isLoading={false}
        selectedSessionId={null}
        onCommit={vi.fn()}
        onCreatePullRequest={vi.fn()}
        onPush={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        'Select a session with a git workspace to inspect changes and create a pull request.',
      ),
    ).toBeDefined()
    expect(screen.queryByText(/daemon-backed/i)).toBeNull()
  })

  it('disables pull request creation when the selected session cannot create pull requests', () => {
    const onCreatePullRequest = vi.fn()

    render(
      <GitDiffPanel
        diff={{
          success: true,
          data: {
            diff: '',
            branch: 'feature/oxo-52',
            baseBranch: 'main',
            files: [],
            totalAdditions: 0,
            totalDeletions: 0,
            remoteUrl: null,
            commits: [],
            committedDiff: '',
            committedFiles: [],
            committedTotalAdditions: 0,
            committedTotalDeletions: 0,
            unstagedDiff: '',
            unstagedFiles: [],
            unstagedTotalAdditions: 0,
            unstagedTotalDeletions: 0,
            canCommit: true,
            canPush: true,
            canCreatePullRequest: false,
            createPullRequestUnavailableMessage:
              'Install and authenticate GitHub CLI (`gh`) to create pull requests from local sessions.',
          },
        }}
        isActionRunning={false}
        isLoading={false}
        selectedSessionId="session-local"
        onCommit={vi.fn()}
        onCreatePullRequest={onCreatePullRequest}
        onPush={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    const createPullRequestButton = screen.getByRole('button', { name: 'Create pull request' })
    expect(createPullRequestButton).toHaveProperty('disabled', true)
    expect(
      screen.getByText(
        'Install and authenticate GitHub CLI (`gh`) to create pull requests from local sessions.',
      ),
    ).toBeDefined()

    fireEvent.click(createPullRequestButton)
    expect(onCreatePullRequest).not.toHaveBeenCalled()
  })
})
