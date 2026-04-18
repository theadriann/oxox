import type { SessionTranscript } from '../../../shared/ipc/contracts'
import { batch, bindMethods, observable, readMapValue, writeMapValue } from './legend'

type TranscriptLoader = (sessionId: string) => Promise<SessionTranscript>
const UNAVAILABLE_TRANSCRIPT_LOADER: TranscriptLoader = async () => {
  throw new Error('Transcript bridge unavailable.')
}

export class TranscriptStore {
  private readonly transcriptLoader: TranscriptLoader

  readonly stateNode = observable({
    transcriptsBySession: new Map<string, SessionTranscript>(),
    refreshErrorsBySession: new Map<string, string>(),
    refreshingSessionIds: new Set<string>(),
  })

  constructor(transcriptLoader: TranscriptLoader = UNAVAILABLE_TRANSCRIPT_LOADER) {
    this.transcriptLoader = transcriptLoader
    bindMethods(this)
  }

  transcriptForSession(sessionId: string): SessionTranscript | null {
    return readMapValue(this.stateNode.transcriptsBySession, sessionId) ?? null
  }

  refreshErrorForSession(sessionId: string): string | null {
    return readMapValue(this.stateNode.refreshErrorsBySession, sessionId) ?? null
  }

  isRefreshingSession(sessionId: string): boolean {
    return this.stateNode.refreshingSessionIds.has(sessionId)
  }

  async openSession(sessionId: string): Promise<void> {
    if (!sessionId) {
      return
    }

    batch(() => {
      this.stateNode.refreshErrorsBySession.delete(sessionId)
      this.stateNode.refreshingSessionIds.add(sessionId)
    })

    try {
      const transcript = await this.transcriptLoader(sessionId)
      batch(() => {
        writeMapValue(this.stateNode.transcriptsBySession, sessionId, transcript)
        this.stateNode.refreshErrorsBySession.delete(sessionId)
      })
    } catch (error) {
      batch(() => {
        writeMapValue(
          this.stateNode.refreshErrorsBySession,
          sessionId,
          error instanceof Error ? error.message : 'Unable to refresh transcript.',
        )
      })
    } finally {
      batch(() => {
        this.stateNode.refreshingSessionIds.delete(sessionId)
      })
    }
  }
}
