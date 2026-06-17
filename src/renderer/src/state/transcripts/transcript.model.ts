import { batch, type Observable } from '@legendapp/state'
import type {
  SessionTranscript,
  SessionTranscriptScrollState,
} from '../../../../shared/ipc/contracts'
import { createTranscriptState$, type TranscriptState } from './transcript.state'

type TranscriptLoader = (sessionId: string) => Promise<SessionTranscript>
type TranscriptScrollStateLoader = (
  sessionId: string,
) => Promise<SessionTranscriptScrollState | null>
type TranscriptScrollStateSaver = (state: SessionTranscriptScrollState) => Promise<void>

const UNAVAILABLE_TRANSCRIPT_LOADER: TranscriptLoader = async () => {
  throw new Error('Transcript bridge unavailable.')
}

export class TranscriptStore {
  private readonly transcriptLoader: TranscriptLoader
  private readonly transcriptScrollStateLoader?: TranscriptScrollStateLoader
  private readonly transcriptScrollStateSaver?: TranscriptScrollStateSaver
  private readonly pendingScrollStateLoads = new Set<string>()

  readonly state$: Observable<TranscriptState> = createTranscriptState$()

  constructor(
    transcriptLoader: TranscriptLoader = UNAVAILABLE_TRANSCRIPT_LOADER,
    transcriptScrollStateLoader?: TranscriptScrollStateLoader,
    transcriptScrollStateSaver?: TranscriptScrollStateSaver,
  ) {
    this.transcriptLoader = transcriptLoader
    this.transcriptScrollStateLoader = transcriptScrollStateLoader
    this.transcriptScrollStateSaver = transcriptScrollStateSaver
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

  scrollStateForSession = (sessionId: string): SessionTranscriptScrollState | null | undefined => {
    return this.state$.scrollStatesBySession[sessionId].get()
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

  loadScrollState = async (sessionId: string): Promise<void> => {
    if (!sessionId || this.pendingScrollStateLoads.has(sessionId)) {
      return
    }

    if (!this.transcriptScrollStateLoader) {
      this.state$.scrollStatesBySession[sessionId].set(null)
      return
    }

    this.pendingScrollStateLoads.add(sessionId)

    try {
      const state = await this.transcriptScrollStateLoader(sessionId)
      this.state$.scrollStatesBySession[sessionId].set(state)
    } catch {
      this.state$.scrollStatesBySession[sessionId].set(null)
    } finally {
      this.pendingScrollStateLoads.delete(sessionId)
    }
  }

  saveScrollState = (state: SessionTranscriptScrollState): void => {
    this.state$.scrollStatesBySession[state.sessionId].set(state)
    void this.transcriptScrollStateSaver?.(state).catch(() => undefined)
  }
}
