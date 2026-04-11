import { spawn, spawnSync } from 'node:child_process'
import type { Readable } from 'node:stream'

import type { DatabaseService, SessionRuntimeRecord } from '../database/service'
import type { ReadableLike, SessionChildProcess, SpawnProcessRequest } from './types'

export function reconcilePersistedRuntimeStates(
  runtimes: SessionRuntimeRecord[],
  options: {
    database: DatabaseService
    isDroidProcess: (processId: number) => boolean
    isProcessAlive: (processId: number) => boolean
    now: () => string
  },
): void {
  for (const runtime of runtimes) {
    if (!runtime.processId) {
      continue
    }

    const isLiveRuntime = runtime.status !== 'completed' && runtime.status !== 'error'
    if (!isLiveRuntime) {
      continue
    }

    const processAlive =
      options.isProcessAlive(runtime.processId) && options.isDroidProcess(runtime.processId)

    options.database.upsertSessionRuntime({
      sessionId: runtime.sessionId,
      transport: runtime.transport,
      status: processAlive ? 'orphaned' : 'disconnected',
      processId: processAlive ? runtime.processId : null,
      viewerCount: 0,
      lastEventAt: runtime.lastEventAt,
      updatedAt: options.now(),
    })
  }
}

export function defaultIsProcessAlive(processId: number): boolean {
  if (!Number.isInteger(processId) || processId <= 0) {
    return false
  }

  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

export function defaultIsDroidProcess(processId: number): boolean {
  const result = spawnSync('ps', ['-p', String(processId), '-o', 'command='], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    return false
  }

  return result.stdout.trim().includes('droid')
}

export async function consumeReadable(
  readable: ReadableLike,
  onChunk: (text: string) => void,
): Promise<void> {
  if ('getReader' in readable) {
    const reader = readable.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done || value === undefined) {
          return
        }

        onChunk(decoder.decode(value, { stream: true }))
      }
    } finally {
      reader.releaseLock()
    }
  }

  await new Promise<void>((resolve, reject) => {
    const stream = readable as Readable
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => onChunk(chunk))
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
}

export function waitForExit(child: SessionChildProcess): Promise<number | null> {
  if (child.exited) {
    return child.exited
  }

  return new Promise((resolve) => {
    child.once?.('exit', resolve)
  })
}

export function createNodeChildProcess(request: SpawnProcessRequest): SessionChildProcess {
  const child = spawn(request.command, request.args, {
    cwd: request.cwd,
    env: request.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  return Object.assign(child, {
    exited: new Promise<number | null>((resolve) => {
      child.once('exit', resolve)
    }),
  })
}
