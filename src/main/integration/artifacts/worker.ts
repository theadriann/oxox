import { parentPort, workerData } from 'node:worker_threads'

import { createDatabaseService } from '../database/service'

import type { ArtifactScannerSyncOptions } from './scanner'
import { createArtifactScanner } from './scanner'

interface ArtifactScannerWorkerData {
  userDataPath: string
  sessionsRoot: string
}

interface SyncRequestMessage {
  id: number
  type: 'sync'
  options?: Pick<ArtifactScannerSyncOptions, 'force'>
}

const data = workerData as ArtifactScannerWorkerData
const database = createDatabaseService({
  userDataPath: data.userDataPath,
})
const scanner = createArtifactScanner({
  database,
  sessionsRoot: data.sessionsRoot,
})

parentPort?.on('message', async (message: SyncRequestMessage) => {
  if (message.type !== 'sync') {
    return
  }

  try {
    parentPort.postMessage({
      id: message.id,
      ok: true,
      report: await scanner.sync({
        ...message.options,
        onProgress: (progress) => {
          parentPort.postMessage({
            id: message.id,
            progress,
            type: 'progress',
          })
        },
      }),
      type: 'result',
    })
  } catch (error) {
    parentPort.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      type: 'result',
    })
  }
})

process.on('exit', () => {
  database.close()
})
