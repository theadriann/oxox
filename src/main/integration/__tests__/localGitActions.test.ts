import { describe, expect, it, vi } from 'vitest'

import { getLocalGitDiff } from '../git/localGitActions'

describe('local git actions', () => {
  it('builds daemon-compatible git diff data for local workspace sessions', async () => {
    const runGit = vi.fn(async (args: string[]) => {
      switch (args.join(' ')) {
        case 'rev-parse --show-toplevel':
          return '/workspace/oxox\n'
        case 'rev-parse --abbrev-ref HEAD':
          return 'feature/oxo-22\n'
        case 'config --get remote.origin.url':
          return 'https://github.com/theadriann/oxox.git\n'
        case 'diff main...HEAD':
          return 'diff --git a/src/App.tsx b/src/App.tsx\n'
        case 'diff':
          return 'diff --git a/src/main.ts b/src/main.ts\n'
        case 'diff --numstat main...HEAD':
          return '2\t1\tsrc/App.tsx\n'
        case 'diff --numstat':
          return '3\t0\tsrc/main.ts\n'
        case 'log --pretty=format:%H%x00%s main..HEAD':
          return 'abc123\u0000Add git workflow support\n'
        default:
          throw new Error(`Unexpected git command: ${args.join(' ')}`)
      }
    })

    await expect(
      getLocalGitDiff({
        workspacePath: '/workspace/oxox',
        sessionId: 'session-local',
        baseBranch: 'main',
        runGit,
        runCli: vi.fn(async (command: string, args: string[]) => {
          if (command === 'gh' && args.join(' ') === '--version') {
            return 'gh version 2.0.0\n'
          }

          throw new Error(`Unexpected cli command: ${command} ${args.join(' ')}`)
        }),
      }),
    ).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        branch: 'feature/oxo-22',
        baseBranch: 'main',
        diff: 'diff --git a/src/App.tsx b/src/App.tsx\n\ndiff --git a/src/main.ts b/src/main.ts',
        files: [
          { path: 'src/App.tsx', additions: 2, deletions: 1, status: 'modified' },
          { path: 'src/main.ts', additions: 3, deletions: 0, status: 'modified' },
        ],
        totalAdditions: 5,
        totalDeletions: 1,
        commits: [{ hash: 'abc123', message: 'Add git workflow support' }],
        canCreatePullRequest: true,
      }),
    })
  })

  it('marks pull request creation unavailable when the GitHub CLI is missing locally', async () => {
    const runGit = vi.fn(async (args: string[]) => {
      switch (args.join(' ')) {
        case 'rev-parse --show-toplevel':
          return '/workspace/oxox\n'
        case 'rev-parse --abbrev-ref HEAD':
          return 'feature/oxo-52\n'
        default:
          return ''
      }
    })

    await expect(
      getLocalGitDiff({
        workspacePath: '/workspace/oxox',
        sessionId: 'session-local',
        baseBranch: 'main',
        runGit,
        runCli: vi.fn(async () => {
          throw new Error('gh not found')
        }),
      }),
    ).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        canCommit: true,
        canPush: true,
        canCreatePullRequest: false,
        createPullRequestUnavailableMessage:
          'Install and authenticate GitHub CLI (`gh`) to create pull requests from local sessions.',
      }),
    })
  })

  it('returns an unavailable response when the local workspace is not a git repository', async () => {
    const runGit = vi.fn(async (args: string[]) => {
      if (args.join(' ') === 'rev-parse --show-toplevel') {
        throw new Error('fatal: not a git repository')
      }

      return ''
    })

    await expect(
      getLocalGitDiff({
        workspacePath: '/workspace/not-git',
        sessionId: 'session-local',
        runGit,
      }),
    ).resolves.toEqual({
      success: false,
      unavailableReason: 'not_git_repository',
      unavailableMessage: 'The selected session workspace is not a git repository.',
    })
  })

  it('returns git_not_available when the local git command is missing', async () => {
    const error = new Error('spawn git ENOENT') as NodeJS.ErrnoException
    error.code = 'ENOENT'

    await expect(
      getLocalGitDiff({
        workspacePath: '/workspace/oxox',
        sessionId: 'session-local',
        runGit: vi.fn(async () => {
          throw error
        }),
      }),
    ).resolves.toEqual({
      success: false,
      unavailableReason: 'git_not_available',
      unavailableMessage: 'Install Git to inspect changes for this local session.',
    })
  })
})
