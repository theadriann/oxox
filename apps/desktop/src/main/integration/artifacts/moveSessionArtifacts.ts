import {
  constants,
  createReadStream,
  createWriteStream,
  existsSync,
  promises as fsPromises,
  realpathSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

import { findSessionTranscriptPath } from '../transcripts/mutations'

const SETTINGS_SUFFIX = '.settings.json'

export interface MoveSessionArtifactsOptions {
  sessionsRoot: string
  sessionId: string
  sourcePath?: string | null
  targetWorkspacePath: string
}

export interface MoveSessionArtifactsResult {
  sourcePath: string
  targetPath: string
  targetWorkspacePath: string
}

export async function moveSessionArtifacts({
  sessionsRoot,
  sessionId,
  sourcePath,
  targetWorkspacePath,
}: MoveSessionArtifactsOptions): Promise<MoveSessionArtifactsResult> {
  const resolvedTargetWorkspacePath = resolveWorkspacePath(targetWorkspacePath)
  assertDirectory(resolvedTargetWorkspacePath)

  const sourceTranscriptPath =
    sourcePath && existsSync(sourcePath)
      ? sourcePath
      : findSessionTranscriptPath(sessionsRoot, sessionId)
  if (!sourceTranscriptPath) {
    throw new Error(`Session transcript not found for ${sessionId}.`)
  }

  const targetDirectory = join(
    sessionsRoot,
    sanitizePathToDirectoryName(resolvedTargetWorkspacePath),
  )
  const targetTranscriptPath = join(targetDirectory, `${sessionId}.jsonl`)
  const sourceSettingsPath = join(dirname(sourceTranscriptPath), `${sessionId}${SETTINGS_SUFFIX}`)
  const targetSettingsPath = join(targetDirectory, `${sessionId}${SETTINGS_SUFFIX}`)

  if (sourceTranscriptPath === targetTranscriptPath) {
    await rewriteTranscriptCwd(sourceTranscriptPath, resolvedTargetWorkspacePath)
    await rewriteSettingsCwd(sourceSettingsPath, resolvedTargetWorkspacePath)
    return {
      sourcePath: sourceTranscriptPath,
      targetPath: targetTranscriptPath,
      targetWorkspacePath: resolvedTargetWorkspacePath,
    }
  }

  if (existsSync(targetTranscriptPath)) {
    throw new Error(`Target session transcript already exists at ${targetTranscriptPath}.`)
  }

  if (existsSync(sourceSettingsPath) && existsSync(targetSettingsPath)) {
    throw new Error(`Target session settings already exists at ${targetSettingsPath}.`)
  }

  await fsPromises.mkdir(targetDirectory, { recursive: true })
  await writeTranscriptWithCwd(
    sourceTranscriptPath,
    targetTranscriptPath,
    resolvedTargetWorkspacePath,
  )

  const hasSettings = existsSync(sourceSettingsPath)

  try {
    if (hasSettings) {
      await fsPromises.copyFile(sourceSettingsPath, targetSettingsPath, constants.COPYFILE_EXCL)
      await rewriteSettingsCwd(targetSettingsPath, resolvedTargetWorkspacePath)
    }

    await fsPromises.unlink(sourceTranscriptPath)
    if (hasSettings) {
      await fsPromises.unlink(sourceSettingsPath)
    }
  } catch (error) {
    await fsPromises.rm(targetTranscriptPath, { force: true })
    await fsPromises.rm(targetSettingsPath, { force: true })
    throw error
  }

  return {
    sourcePath: sourceTranscriptPath,
    targetPath: targetTranscriptPath,
    targetWorkspacePath: resolvedTargetWorkspacePath,
  }
}

function resolveWorkspacePath(workspacePath: string): string {
  const trimmed = workspacePath.trim()
  if (!trimmed) {
    throw new Error('Target project path is required.')
  }

  const expanded =
    trimmed === '~' || trimmed.startsWith('~/') ? join(homedir(), trimmed.slice(1)) : trimmed

  return resolve(expanded)
}

function assertDirectory(workspacePath: string): void {
  let stat: ReturnType<typeof statSync>

  try {
    stat = statSync(workspacePath)
  } catch {
    throw new Error(`Target project path does not exist: ${workspacePath}`)
  }

  if (!stat.isDirectory()) {
    throw new Error(`Target project path is not a directory: ${workspacePath}`)
  }
}

function sanitizePathToDirectoryName(workspacePath: string): string {
  let canonicalPath = workspacePath

  try {
    canonicalPath = statSync(workspacePath).isDirectory()
      ? realpathSync(workspacePath)
      : workspacePath
  } catch {
    canonicalPath = workspacePath
  }

  const normalized = canonicalPath.replace(/[\\/]+$/u, '')

  if (process.platform === 'win32') {
    return `-${normalized.replace(/^([A-Z]):/iu, '$1').replace(/[\\/]+/gu, '-')}`
  }

  return `-${normalized.replace(/^\/+/u, '').replace(/\/+/gu, '-')}`
}

async function rewriteTranscriptCwd(sourcePath: string, workspacePath: string): Promise<void> {
  const tempPath = `${sourcePath}.move-${process.pid}-${Date.now()}`
  await writeTranscriptWithCwd(sourcePath, tempPath, workspacePath)
  await fsPromises.rename(tempPath, sourcePath)
}

async function writeTranscriptWithCwd(
  sourcePath: string,
  targetPath: string,
  workspacePath: string,
): Promise<void> {
  const input = createReadStream(sourcePath, { encoding: 'utf8' })
  const output = createWriteStream(targetPath, { encoding: 'utf8', flags: 'wx' })
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY })
  let firstNonEmptyLineSeen = false

  try {
    for await (const line of lines) {
      let nextLine = line

      if (!firstNonEmptyLineSeen && line.trim().length > 0) {
        firstNonEmptyLineSeen = true
        const record = JSON.parse(line) as Record<string, unknown>

        if (record.type !== 'session_start') {
          throw new Error('Transcript must start with a session_start record.')
        }

        record.cwd = workspacePath
        nextLine = JSON.stringify(record)
      }

      output.write(`${nextLine}\n`)
    }

    if (!firstNonEmptyLineSeen) {
      throw new Error('Transcript is empty.')
    }

    await new Promise<void>((resolvePromise, reject) => {
      output.end((error) => {
        if (error) {
          reject(error)
          return
        }

        resolvePromise()
      })
    })
  } catch (error) {
    input.destroy()
    output.destroy()
    await fsPromises.rm(targetPath, { force: true })
    throw error
  }
}

async function rewriteSettingsCwd(settingsPath: string, workspacePath: string): Promise<void> {
  if (!existsSync(settingsPath)) {
    return
  }

  const parsed = JSON.parse(await fsPromises.readFile(settingsPath, 'utf8')) as Record<
    string,
    unknown
  >
  parsed.cwd = workspacePath
  await fsPromises.writeFile(settingsPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
}
