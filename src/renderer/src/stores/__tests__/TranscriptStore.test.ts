import type { SessionTranscript } from '../../../../shared/ipc/contracts'
import { TranscriptStore } from '../TranscriptStore'

function createTranscript(
  sessionId: string,
  suffix: string,
  occurredAt = '2026-03-25T01:00:00.000Z',
): SessionTranscript {
  return {
    sessionId,
    sourcePath: `/tmp/${sessionId}.jsonl`,
    loadedAt: occurredAt,
    entries: [
      {
        kind: 'message',
        id: `${sessionId}-${suffix}`,
        occurredAt,
        role: 'assistant',
        markdown: `Transcript ${suffix}`,
      },
    ],
  }
}

describe('TranscriptStore', () => {
  it('shows cached transcript immediately while a background refresh is in flight', async () => {
    let resolveRefresh: ((value: SessionTranscript) => void) | null = null
    const loadTranscript = vi
      .fn()
      .mockResolvedValueOnce(createTranscript('session-1', 'cached'))
      .mockImplementationOnce(
        () =>
          new Promise<SessionTranscript>((resolve) => {
            resolveRefresh = resolve
          }),
      )

    const store = new TranscriptStore(loadTranscript)

    await store.openSession('session-1')

    const refreshPromise = store.openSession('session-1')

    expect(store.transcriptForSession('session-1')).toMatchObject({
      entries: [expect.objectContaining({ markdown: 'Transcript cached' })],
    })
    expect(store.isRefreshingSession('session-1')).toBe(true)

    resolveRefresh?.(createTranscript('session-1', 'fresh', '2026-03-25T01:01:00.000Z'))
    await refreshPromise

    expect(store.transcriptForSession('session-1')).toMatchObject({
      entries: [expect.objectContaining({ markdown: 'Transcript fresh' })],
    })
    expect(store.refreshErrorForSession('session-1')).toBeNull()
  })

  it('preserves cached transcript content when a refresh fails', async () => {
    const loadTranscript = vi
      .fn()
      .mockResolvedValueOnce(createTranscript('session-2', 'cached'))
      .mockRejectedValueOnce(new Error('Unable to refresh transcript'))

    const store = new TranscriptStore(loadTranscript)

    await store.openSession('session-2')
    await store.openSession('session-2')

    expect(store.transcriptForSession('session-2')).toMatchObject({
      entries: [expect.objectContaining({ markdown: 'Transcript cached' })],
    })
    expect(store.refreshErrorForSession('session-2')).toBe('Unable to refresh transcript')
    expect(store.isRefreshingSession('session-2')).toBe(false)
  })

  it('does not read from an ambient bridge when no transcript loader is provided', async () => {
    const store = new TranscriptStore()

    await store.openSession('session-3')

    expect(store.transcriptForSession('session-3')).toBeNull()
    expect(store.refreshErrorForSession('session-3')).toBe('Transcript bridge unavailable.')
  })
})
