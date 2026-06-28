import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { TranscriptPerformanceEvent } from '../../shared/ipc/contracts'

export interface TranscriptPerformanceLogWriter {
  enabled: boolean
  log: (events: TranscriptPerformanceEvent[]) => void
  path: string
}

export interface CreateTranscriptPerformanceLogWriterOptions {
  enabled?: boolean
  now?: () => string
  userDataPath: string
}

export function createTranscriptPerformanceLogWriter({
  enabled = process.env.OXOX_TRANSCRIPT_PERF_LOG === '1',
  now = () => new Date().toISOString(),
  userDataPath,
}: CreateTranscriptPerformanceLogWriterOptions): TranscriptPerformanceLogWriter {
  const diagnosticsPath = join(userDataPath, 'diagnostics')
  const logPath = join(diagnosticsPath, 'transcript-performance.jsonl')

  return {
    enabled,
    path: logPath,
    log: (events) => {
      if (!enabled || events.length === 0) {
        return
      }

      mkdirSync(diagnosticsPath, { recursive: true })
      const receivedAt = now()
      const lines = events.map((event) =>
        JSON.stringify({
          ...event,
          receivedAt,
        }),
      )
      appendFileSync(logPath, `${lines.join('\n')}\n`, 'utf8')
    },
  }
}
