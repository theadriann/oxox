import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createTranscriptPerformanceLogWriter } from '../transcriptPerformanceLog'

const cleanupPaths: string[] = []

describe('createTranscriptPerformanceLogWriter', () => {
  afterEach(() => {
    for (const path of cleanupPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true })
    }
  })

  it('writes enabled transcript performance events as jsonl', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-transcript-perf-'))
    cleanupPaths.push(userDataPath)
    const writer = createTranscriptPerformanceLogWriter({
      enabled: true,
      now: () => '2026-05-16T00:00:01.000Z',
      userDataPath,
    })

    writer.log([
      {
        source: 'renderer',
        name: 'live_session_store_apply_event_batch',
        timestamp: '2026-05-16T00:00:00.000Z',
        sessionId: 'session-live-1',
        durationMs: 3.5,
        details: {
          eventCount: 20,
        },
      },
    ])

    const lines = readFileSync(writer.path, 'utf8').trim().split('\n')

    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      source: 'renderer',
      name: 'live_session_store_apply_event_batch',
      sessionId: 'session-live-1',
      durationMs: 3.5,
      receivedAt: '2026-05-16T00:00:01.000Z',
      details: {
        eventCount: 20,
      },
    })
  })
})
