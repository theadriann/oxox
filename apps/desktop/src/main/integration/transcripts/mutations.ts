import {
  createReadStream,
  createWriteStream,
  promises as fsPromises,
  readdirSync,
  readFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const TRANSCRIPT_EXTENSION = '.jsonl'

export function findSessionTranscriptPath(sessionsRoot: string, sessionId: string): string | null {
  const fileName = `${sessionId}${TRANSCRIPT_EXTENSION}`

  for (const entry of safeReadDir(sessionsRoot)) {
    if (!entry.isDirectory()) {
      continue
    }

    const nestedPath = join(sessionsRoot, entry.name, fileName)
    if (safePathExists(nestedPath)) {
      return nestedPath
    }
  }

  const rootPath = join(sessionsRoot, fileName)
  return safePathExists(rootPath) ? rootPath : null
}

export async function renameSessionTitleInTranscript(
  sourcePath: string,
  title: string,
): Promise<void> {
  const tempPath = `${sourcePath}.rename-${process.pid}-${Date.now()}`
  const input = createReadStream(sourcePath, { encoding: 'utf8' })
  const output = createWriteStream(tempPath, { encoding: 'utf8' })
  const lines = createInterface({
    input,
    crlfDelay: Number.POSITIVE_INFINITY,
  })

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

        record.sessionTitle = title
        record.isSessionTitleManuallySet = true
        nextLine = JSON.stringify(record)
      }

      output.write(`${nextLine}\n`)
    }

    if (!firstNonEmptyLineSeen) {
      throw new Error('Transcript is empty.')
    }

    await new Promise<void>((resolve, reject) => {
      output.end((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
    await fsPromises.rename(tempPath, sourcePath)
  } catch (error) {
    input.destroy()
    output.destroy()
    await fsPromises.rm(tempPath, { force: true })
    throw error
  }
}

function safeReadDir(directoryPath: string) {
  try {
    return readdirSync(directoryPath, { withFileTypes: true })
  } catch (error) {
    if (isMissingPathError(error)) {
      return []
    }

    throw error
  }
}

function safePathExists(filePath: string): boolean {
  try {
    readFileSync(filePath, 'utf8')
    return true
  } catch (error) {
    if (isMissingPathError(error)) {
      return false
    }

    throw error
  }
}

function isMissingPathError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT',
  )
}
