import { batch, type Observable } from '@legendapp/state'
import type { SessionTranscript } from '../../../../shared/ipc/contracts'
import { createTranscriptState$, type TranscriptState } from './transcript.state'

type TranscriptLoader = (sessionId: string) => Promise<SessionTranscript>
const UNAVAILABLE_TRANSCRIPT_LOADER: TranscriptLoader = async () => {
  throw new Error('Transcript bridge unavailable.')
}

export class TranscriptStore {
  private readonly transcriptLoader: TranscriptLoader

  readonly state$: Observable<TranscriptState> = createTranscriptState$()

  constructor(transcriptLoader: TranscriptLoader = UNAVAILABLE_TRANSCRIPT_LOADER) {
    this.transcriptLoader = transcriptLoader
  }

  transcriptForSession = (sessionId: string): SessionTranscript | null => {
    return this.state$.transcriptsBySession[sessionId].get() ?? null
  }

  transcriptEntriesForSessionPeek = (sessionId: string): SessionTranscript['entries'] => {
    return this.state$.transcriptsBySession[sessionId].peek()?.entries ?? []
  }

  transcriptRevisionForSession = (sessionId: string): number => {
    return this.state$.transcriptRevisionsBySession[sessionId].get() ?? 0
  }

  refreshErrorForSession = (sessionId: string): string | null => {
    return this.state$.refreshErrorsBySession[sessionId].get() ?? null
  }

  isRefreshingSession = (sessionId: string): boolean => {
    return this.state$.refreshingSessionIds.get().includes(sessionId)
  }

  openSession = async (sessionId: string): Promise<void> => {
    if (!sessionId) {
      return
    }

    batch(() => {
      this.state$.refreshErrorsBySession[sessionId].delete()
      if (!this.state$.refreshingSessionIds.peek().includes(sessionId)) {
        this.state$.refreshingSessionIds.set([
          ...this.state$.refreshingSessionIds.peek(),
          sessionId,
        ])
      }
    })

    try {
      const transcript = await this.transcriptLoader(sessionId)
      batch(() => {
        this.state$.transcriptsBySession[sessionId].set(transcript)
        this.state$.transcriptRevisionsBySession[sessionId].set(
          (this.state$.transcriptRevisionsBySession[sessionId].peek() ?? 0) + 1,
        )
        this.state$.refreshErrorsBySession[sessionId].delete()
      })
    } catch (error) {
      batch(() => {
        this.state$.refreshErrorsBySession[sessionId].set(
          error instanceof Error ? error.message : 'Unable to refresh transcript.',
        )
      })
    } finally {
      batch(() => {
        this.state$.refreshingSessionIds.set(
          this.state$.refreshingSessionIds.peek().filter((id) => id !== sessionId),
        )
      })
    }
  }
}
