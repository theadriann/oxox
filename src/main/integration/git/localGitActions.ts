import { spawn } from 'node:child_process'

import type {
  CreatePullRequestRequest,
  CreatePullRequestResponse,
  GitActionResponse,
  GitCommitRequest,
  GitDiffData,
  GitDiffFile,
  GitDiffRequest,
  GitDiffResponse,
  GitPushRequest,
} from '../../../shared/ipc/contracts'

const DEFAULT_BASE_BRANCH = 'main'
const GIT_COMMAND_TIMEOUT_MS = 30_000

export type RunGitCommand = (args: string[]) => Promise<string>
export type RunCliCommand = (command: string, args: string[]) => Promise<string>

interface LocalGitRequestContext {
  workspacePath: string
  runGit?: RunGitCommand
  runCli?: RunCliCommand
}

export interface LocalGitDiffRequest extends GitDiffRequest, LocalGitRequestContext {}
export interface LocalGitCommitRequest extends GitCommitRequest, LocalGitRequestContext {}
export interface LocalGitPushRequest extends GitPushRequest, LocalGitRequestContext {}
export interface LocalCreatePullRequestRequest extends CreatePullRequestRequest {
  workspacePath: string
}

export async function getLocalGitDiff({
  workspacePath,
  baseBranch = DEFAULT_BASE_BRANCH,
  statsOnly,
  runGit = createGitRunner(workspacePath),
  runCli: runCliCommand = (command, args) => runCli(command, args, workspacePath),
}: LocalGitDiffRequest): Promise<GitDiffResponse> {
  try {
    await runGit(['rev-parse', '--show-toplevel'])
  } catch (error) {
    if (isCommandMissing(error)) {
      return {
        success: false,
        unavailableReason: 'git_not_available',
        unavailableMessage: 'Install Git to inspect changes for this local session.',
      }
    }

    return {
      success: false,
      unavailableReason: 'not_git_repository',
      unavailableMessage: 'The selected session workspace is not a git repository.',
    }
  }

  try {
    const [branch, remoteUrl, committedDiff, unstagedDiff, committedNumstat, unstagedNumstat, log] =
      await Promise.all([
        runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
        runGitAllowingEmpty(runGit, ['config', '--get', 'remote.origin.url']),
        statsOnly
          ? Promise.resolve('')
          : runGitAllowingEmpty(runGit, ['diff', `${baseBranch}...HEAD`]),
        statsOnly ? Promise.resolve('') : runGitAllowingEmpty(runGit, ['diff']),
        runGitAllowingEmpty(runGit, ['diff', '--numstat', `${baseBranch}...HEAD`]),
        runGitAllowingEmpty(runGit, ['diff', '--numstat']),
        runGitAllowingEmpty(runGit, ['log', '--pretty=format:%H%x00%s', `${baseBranch}..HEAD`]),
      ])
    const committedFiles = parseNumstat(committedNumstat)
    const unstagedFiles = parseNumstat(unstagedNumstat)
    const files = mergeFiles(committedFiles, unstagedFiles)
    const canCreatePullRequest = await isCliAvailable(runCliCommand, 'gh')
    const data: GitDiffData = {
      diff: [committedDiff.trimEnd(), unstagedDiff.trimEnd()].filter(Boolean).join('\n\n'),
      branch: branch.trim(),
      baseBranch,
      files,
      totalAdditions: files.reduce((total, file) => total + file.additions, 0),
      totalDeletions: files.reduce((total, file) => total + file.deletions, 0),
      remoteUrl: remoteUrl.trim() || null,
      commits: parseCommits(log),
      committedDiff,
      committedFiles,
      committedTotalAdditions: committedFiles.reduce((total, file) => total + file.additions, 0),
      committedTotalDeletions: committedFiles.reduce((total, file) => total + file.deletions, 0),
      unstagedDiff,
      unstagedFiles,
      unstagedTotalAdditions: unstagedFiles.reduce((total, file) => total + file.additions, 0),
      unstagedTotalDeletions: unstagedFiles.reduce((total, file) => total + file.deletions, 0),
      canCommit: true,
      canPush: true,
      canCreatePullRequest,
      createPullRequestUnavailableMessage: canCreatePullRequest
        ? null
        : 'Install and authenticate GitHub CLI (`gh`) to create pull requests from local sessions.',
    }

    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      unavailableReason: 'unknown',
      unavailableMessage: error instanceof Error ? error.message : 'Unable to read local git diff.',
    }
  }
}

function isCommandMissing(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

async function isCliAvailable(runCliCommand: RunCliCommand, command: string): Promise<boolean> {
  try {
    await runCliCommand(command, ['--version'])
    return true
  } catch {
    return false
  }
}

export async function commitLocalGitChanges({
  workspacePath,
  message,
  runGit = createGitRunner(workspacePath),
}: LocalGitCommitRequest): Promise<GitActionResponse> {
  await runGit(['add', '-A'])
  await runGit(['commit', '-m', message])
  return { success: true }
}

export async function pushLocalGitBranch({
  workspacePath,
  runGit = createGitRunner(workspacePath),
}: LocalGitPushRequest): Promise<GitActionResponse> {
  await runGit(['push', '-u', 'origin', 'HEAD'])
  return { success: true }
}

export async function createLocalGitPullRequest({
  workspacePath,
  title,
  body,
  baseBranch,
  draft,
}: LocalCreatePullRequestRequest): Promise<CreatePullRequestResponse> {
  const args = ['pr', 'create', '--title', title, '--base', baseBranch]

  if (body) {
    args.push('--body', body)
  }

  if (draft) {
    args.push('--draft')
  }

  const url = (await runCli('gh', args, workspacePath)).trim()
  const metadata = await runCli(
    'gh',
    ['pr', 'view', url, '--json', 'number,title,url,state,isDraft'],
    workspacePath,
  )
  const parsed = JSON.parse(metadata) as {
    number: number
    title: string
    url: string
    state: string
    isDraft: boolean
  }

  return {
    number: parsed.number,
    title: parsed.title,
    url: parsed.url,
    state: parsed.state,
    draft: parsed.isDraft,
  }
}

function createGitRunner(workspacePath: string): RunGitCommand {
  return (args) => runCli('git', args, workspacePath)
}

async function runGitAllowingEmpty(runGit: RunGitCommand, args: string[]): Promise<string> {
  try {
    return await runGit(args)
  } catch {
    return ''
  }
}

function runCli(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${command} ${args.join(' ')} timed out.`))
    }, GIT_COMMAND_TIMEOUT_MS)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)

      if (code === 0) {
        resolve(stdout)
        return
      }

      reject(new Error(stderr.trim() || `${command} ${args.join(' ')} failed with exit ${code}.`))
    })
  })
}

function parseNumstat(output: string): GitDiffFile[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [additions = '0', deletions = '0', path = ''] = line.split('\t')
      return {
        path,
        additions: parseStatValue(additions),
        deletions: parseStatValue(deletions),
        status: 'modified',
      }
    })
}

function parseStatValue(value: string): number {
  if (value === '-') {
    return 0
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function mergeFiles(...fileGroups: GitDiffFile[][]): GitDiffFile[] {
  const filesByPath = new Map<string, GitDiffFile>()

  for (const file of fileGroups.flat()) {
    const existing = filesByPath.get(file.path)
    filesByPath.set(file.path, {
      path: file.path,
      status: file.status,
      additions: (existing?.additions ?? 0) + file.additions,
      deletions: (existing?.deletions ?? 0) + file.deletions,
    })
  }

  return [...filesByPath.values()].sort((left, right) => left.path.localeCompare(right.path))
}

function parseCommits(output: string): Array<{ hash: string; message: string }> {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash = '', message = ''] = line.split('\u0000')
      return { hash, message }
    })
}
