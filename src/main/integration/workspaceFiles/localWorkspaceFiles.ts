import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'

import type {
  WorkspaceFileContentEncoding,
  WorkspaceFileContentResponse,
  WorkspaceFilesListResponse,
  WorkspaceFilesSearchResponse,
} from '../../../shared/ipc/contracts'

const DEFAULT_MAX_RESULTS = 60
const MAX_VISITED_ENTRIES = 2000
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release',
])

interface LocalWorkspaceFilesRequest {
  workspacePath: string
  showHidden?: boolean
}

interface LocalWorkspaceFileContentRequest extends LocalWorkspaceFilesRequest {
  filePath: string
  encoding?: WorkspaceFileContentEncoding
}

interface LocalWorkspaceFilesSearchRequest extends LocalWorkspaceFilesRequest {
  query: string
  maxResults?: number
}

interface WorkspacePathEntry {
  path: string
  isDirectory: boolean
}

export async function listLocalWorkspaceFiles(
  request: LocalWorkspaceFilesRequest,
): Promise<WorkspaceFilesListResponse> {
  const entries = await collectWorkspacePaths(request)
  return {
    files: entries
      .toSorted(compareBrowseEntries)
      .slice(0, DEFAULT_MAX_RESULTS)
      .map((entry) => entry.path),
  }
}

export async function searchLocalWorkspaceFiles(
  request: LocalWorkspaceFilesSearchRequest,
): Promise<WorkspaceFilesSearchResponse> {
  const entries = await collectWorkspacePaths(request)
  const normalizedQuery = request.query.trim().toLowerCase()
  const matchingEntries = normalizedQuery
    ? entries
        .filter((entry) => entry.path.toLowerCase().includes(normalizedQuery))
        .sort((left, right) => compareSearchEntries(left, right, normalizedQuery))
    : entries.toSorted(compareBrowseEntries)

  return {
    files: matchingEntries
      .slice(0, request.maxResults ?? DEFAULT_MAX_RESULTS)
      .map((entry) => entry.path),
    totalFiles: entries.length,
  }
}

export async function getLocalWorkspaceFileContent(
  request: LocalWorkspaceFileContentRequest,
): Promise<WorkspaceFileContentResponse> {
  const workspacePath = resolve(request.workspacePath)
  const filePath = resolveWorkspaceFilePath(workspacePath, request.filePath)
  const fileStats = await stat(filePath)

  if (!fileStats.isFile()) {
    throw new Error('Workspace path is not a file.')
  }

  const bytes = await readFile(filePath)
  const encoding = request.encoding ?? 'utf8'

  if (encoding === 'base64') {
    return {
      content: bytes.toString('base64'),
      byteLength: bytes.byteLength,
      encoding,
      mimeType: getMimeType(filePath),
      isBinary: true,
    }
  }

  return {
    content: bytes.toString('utf8'),
    byteLength: bytes.byteLength,
    encoding,
    mimeType: getMimeType(filePath),
    isBinary: isProbablyBinary(bytes),
  }
}

async function collectWorkspacePaths({
  workspacePath,
  showHidden = false,
}: LocalWorkspaceFilesRequest): Promise<WorkspacePathEntry[]> {
  const rootPath = resolve(workspacePath)
  const results: WorkspacePathEntry[] = []
  let visitedEntries = 0

  async function visit(directoryPath: string): Promise<void> {
    if (visitedEntries >= MAX_VISITED_ENTRIES) {
      return
    }

    const entries = await readdir(directoryPath, { withFileTypes: true })

    for (const entry of entries.sort(compareDirectoryEntries)) {
      if (visitedEntries >= MAX_VISITED_ENTRIES || shouldSkipEntry(entry.name, showHidden)) {
        continue
      }

      visitedEntries += 1
      const absolutePath = resolve(directoryPath, entry.name)
      const relativePath = toWorkspaceRelativePath(rootPath, absolutePath)

      if (entry.isDirectory()) {
        results.push({ path: relativePath, isDirectory: true })
        await visit(absolutePath)
      } else if (entry.isFile()) {
        results.push({ path: relativePath, isDirectory: false })
      }
    }
  }

  await visit(rootPath)
  return results
}

function compareSearchEntries(
  left: WorkspacePathEntry,
  right: WorkspacePathEntry,
  query: string,
): number {
  const leftScore = getSearchRelevanceScore(left, query)
  const rightScore = getSearchRelevanceScore(right, query)

  if (leftScore !== rightScore) {
    return leftScore - rightScore
  }

  const leftPrefixDepth = getPrefixMatchDepth(left.path, query)
  const rightPrefixDepth = getPrefixMatchDepth(right.path, query)

  if (leftPrefixDepth !== rightPrefixDepth) {
    return leftPrefixDepth - rightPrefixDepth
  }

  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1
  }

  const leftDepth = getPathDepth(left.path)
  const rightDepth = getPathDepth(right.path)

  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth
  }

  return left.path.localeCompare(right.path)
}

function compareBrowseEntries(left: WorkspacePathEntry, right: WorkspacePathEntry): number {
  const leftDepth = getPathDepth(left.path)
  const rightDepth = getPathDepth(right.path)

  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth
  }

  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1
  }

  return left.path.localeCompare(right.path)
}

function getPrefixMatchDepth(path: string, query: string): number {
  if (!query.includes('/') || !path.toLowerCase().startsWith(query)) {
    return Number.POSITIVE_INFINITY
  }

  return getPathDepth(path.slice(query.length))
}

function getPathDepth(path: string): number {
  if (!path) {
    return 0
  }

  return path.split('/').length - 1
}

function getSearchRelevanceScore(entry: WorkspacePathEntry, query: string): number {
  const normalizedPath = entry.path.toLowerCase()
  const segments = normalizedPath.split('/')
  const baseName = segments.at(-1) ?? normalizedPath
  const baseNameWithoutExtension = entry.isDirectory
    ? baseName
    : baseName.slice(0, baseName.length - extname(baseName).length)

  if (normalizedPath === query || baseName === query || baseNameWithoutExtension === query) {
    return 0
  }

  if (segments.includes(query)) {
    return 1
  }

  if (baseName.startsWith(query) || baseNameWithoutExtension.startsWith(query)) {
    return 2
  }

  if (segments.some((segment) => segment.startsWith(query))) {
    return 3
  }

  if (normalizedPath.startsWith(query)) {
    return 4
  }

  if (baseName.includes(query)) {
    return 5
  }

  return 6
}

function shouldSkipEntry(name: string, showHidden: boolean): boolean {
  if (SKIPPED_DIRECTORIES.has(name)) {
    return true
  }

  return !showHidden && name.startsWith('.')
}

function compareDirectoryEntries(
  left: { isDirectory: () => boolean; name: string },
  right: { isDirectory: () => boolean; name: string },
): number {
  if (left.isDirectory() !== right.isDirectory()) {
    return left.isDirectory() ? -1 : 1
  }

  return left.name.localeCompare(right.name)
}

function resolveWorkspaceFilePath(workspacePath: string, filePath: string): string {
  const resolvedPath = resolve(workspacePath, filePath)
  const relativePath = relative(workspacePath, resolvedPath)

  if (
    relativePath.startsWith('..') ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`)
  ) {
    throw new Error('Workspace file path is outside the workspace.')
  }

  return resolvedPath
}

function toWorkspaceRelativePath(workspacePath: string, filePath: string): string {
  return relative(workspacePath, filePath).split(sep).join('/')
}

function isProbablyBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, 8000).includes(0)
}

function getMimeType(filePath: string): string | null {
  switch (extname(filePath).toLowerCase()) {
    case '.tsx':
      return 'text/typescript-jsx'
    case '.ts':
      return 'text/typescript'
    case '.jsx':
      return 'text/javascript-jsx'
    case '.js':
      return 'text/javascript'
    case '.json':
      return 'application/json'
    case '.md':
      return 'text/markdown'
    case '.txt':
      return 'text/plain'
    default:
      return null
  }
}
