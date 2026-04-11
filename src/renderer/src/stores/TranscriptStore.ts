import { makeAutoObservable, runInAction } from 'mobx'

import type { SessionTranscript } from '../../../shared/ipc/contracts'

type TranscriptLoader = (sessionId: string) => Promise<SessionTranscript>
const UNAVAILABLE_TRANSCRIPT_LOADER: TranscriptLoader = async () => {
  throw new Error('Transcript bridge unavailable.')
}

export class TranscriptStore {
  private readonly transcriptLoader: TranscriptLoader

  private readonly transcriptsBySession = new Map<string, SessionTranscript>()
  private readonly refreshErrorsBySession = new Map<string, string>()
  private readonly refreshingSessionIds = new Set<string>()

  constructor(transcriptLoader: TranscriptLoader = UNAVAILABLE_TRANSCRIPT_LOADER) {
    this.transcriptLoader = transcriptLoader
    makeAutoObservable(this, { transcriptLoader: false }, { autoBind: true })
  }

  transcriptForSession(sessionId: string): SessionTranscript | null {
    return this.transcriptsBySession.get(sessionId) ?? null
  }

  refreshErrorForSession(sessionId: string): string | null {
    return this.refreshErrorsBySession.get(sessionId) ?? null
  }

  isRefreshingSession(sessionId: string): boolean {
    return this.refreshingSessionIds.has(sessionId)
  }

  async openSession(sessionId: string): Promise<void> {
    if (!sessionId) {
      return
    }

    this.refreshErrorsBySession.delete(sessionId)
    this.refreshingSessionIds.add(sessionId)

    try {
      const transcript = await this.transcriptLoader(sessionId)
      runInAction(() => {
        this.transcriptsBySession.set(sessionId, transcript)
        this.refreshErrorsBySession.delete(sessionId)
      })
    } catch (error) {
      runInAction(() => {
        this.refreshErrorsBySession.set(
          sessionId,
          error instanceof Error ? error.message : 'Unable to refresh transcript.',
        )
      })
    } finally {
      runInAction(() => {
        this.refreshingSessionIds.delete(sessionId)
      })
    }
  }
}
