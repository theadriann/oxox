/// <reference types="vite/client" />

import type { OxoxBridge } from '../../shared/ipc/contracts'
import type { DebugTranscriptRequest } from './components/debug/DebugLab'
import type { TranscriptScrollDebugEvent } from './components/transcript/transcriptScrollDebug'
import type { TranscriptSizeProfile } from './components/transcript/transcriptSizeProfile'
import type {
  TranscriptScrollAlign,
  TranscriptScrollTarget,
} from './components/transcript/transcriptScrollTarget'

declare global {
  interface Window {
    oxoxDebug?: {
      clearTranscriptSizeProfile: (contextKey?: string) => void
      clearTranscriptScrollDebugEvents: () => void
      close: () => void
      disableTranscriptSizeProfiling: () => void
      disableTranscriptScrollDebug: () => void
      enableTranscriptSizeProfiling: () => void
      enableTranscriptScrollDebug: () => void
      getTranscriptScrollDebugEvents: () => TranscriptScrollDebugEvent[]
      getTranscriptSizeProfile: (contextKey?: string) => TranscriptSizeProfile | null
      help: () => string[]
      open: () => void
      renderBakedTranscript: (request?: Omit<DebugTranscriptRequest, 'entries' | 'items'>) => void
      renderTranscript: (request?: DebugTranscriptRequest) => void
      scrollTranscriptTo?: (
        target: TranscriptScrollTarget,
        options?: { align?: TranscriptScrollAlign; behavior?: ScrollBehavior },
      ) => void
    }
    oxox: OxoxBridge
  }
}
