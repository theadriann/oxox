// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  configureTranscriptPerformanceLogger,
  flushTranscriptPerformanceEvents,
  logTranscriptPerformanceEvent,
} from '../transcriptPerformance'

describe('transcript performance diagnostics', () => {
  afterEach(() => {
    window.localStorage.clear()
    configureTranscriptPerformanceLogger(undefined)
    flushTranscriptPerformanceEvents()
    vi.useRealTimers()
  })

  it('buffers renderer events only when opt-in logging is enabled', () => {
    vi.useFakeTimers()
    const sink = vi.fn()
    configureTranscriptPerformanceLogger(sink)

    logTranscriptPerformanceEvent({
      name: 'ignored_event',
    })

    expect(sink).not.toHaveBeenCalled()

    window.localStorage.setItem('oxox.transcriptPerfLogging', '1')
    logTranscriptPerformanceEvent({
      name: 'live_session_event_batch_flushed',
      sessionId: 'session-live-1',
      details: {
        eventCount: 2,
      },
    })

    vi.advanceTimersByTime(1000)

    expect(sink).toHaveBeenCalledWith([
      expect.objectContaining({
        source: 'renderer',
        name: 'live_session_event_batch_flushed',
        sessionId: 'session-live-1',
        details: {
          eventCount: 2,
        },
      }),
    ])
  })
})
