import type { Virtualizer } from '@tanstack/react-virtual'

import {
  clearTranscriptSizeProfile,
  getTranscriptSizeProfile,
  recordTranscriptRowSizeProfile,
  setTranscriptSizeProfilingEnabled,
} from '../transcriptSizeProfile'

describe('transcriptSizeProfile', () => {
  afterEach(() => {
    clearTranscriptSizeProfile()
    setTranscriptSizeProfilingEnabled(false)
  })

  it('falls back to a remaining latest context after clearing the current latest context', () => {
    setTranscriptSizeProfilingEnabled(true)
    recordProfileRow('context-a', 'row-a')
    recordProfileRow('context-b', 'row-b')

    clearTranscriptSizeProfile('context-b')

    expect(getTranscriptSizeProfile()?.contextKey).toBe('context-a')
  })
})

function recordProfileRow(contextKey: string, key: string) {
  const element = {
    dataset: {
      transcriptRowKind: 'message',
    },
  } as HTMLElement

  recordTranscriptRowSizeProfile({
    contextKey,
    element,
    estimate: 100,
    index: 0,
    key,
    measured: 120,
    virtualizer: {
      isScrolling: false,
      scrollDirection: null,
      scrollOffset: 0,
    } as Virtualizer<HTMLDivElement, HTMLDivElement>,
  })
}
