import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'

import type {
  WorkspaceDirectoriesListRequest,
  WorkspaceDirectoriesListResponse,
} from '../../../shared/ipc/contracts'

export async function listLocalWorkspaceDirectories(
  request: WorkspaceDirectoriesListRequest,
): Promise<WorkspaceDirectoriesListResponse> {
  const homePath = homedir()
  const currentPath = resolveWorkspaceDirectoryPath(request.path, homePath)
  const currentStats = await stat(currentPath)

  if (!currentStats.isDirectory()) {
    throw new Error('Workspace path is not a directory.')
  }

  const entries = await readdir(currentPath, { withFileTypes: true })
  const visibleDirectories = entries
    .filter((entry) => entry.isDirectory() && (request.showHidden || !entry.name.startsWith('.')))
    .map((entry) => ({
      name: entry.name,
      path: resolve(currentPath, entry.name),
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name))
  const parentPath = dirname(currentPath)

  return {
    currentPath,
    parentPath: parentPath === currentPath ? null : parentPath,
    homePath,
    entries: visibleDirectories,
  }
}

function resolveWorkspaceDirectoryPath(path: string | null | undefined, homePath: string): string {
  const trimmedPath = path?.trim()

  if (!trimmedPath) {
    return homePath
  }

  if (trimmedPath === '~' || trimmedPath.startsWith('~/')) {
    return resolve(homePath, trimmedPath.slice(1))
  }

  return resolve(trimmedPath)
}
