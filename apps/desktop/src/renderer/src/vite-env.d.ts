/// <reference types="vite/client" />

import type { OxoxBridge } from '../../shared/ipc/contracts'
import type { DebugTranscriptRequest } from './components/debug/DebugLab'

declare global {
  interface Window {
    oxoxDebug?: {
      close: () => void
      help: () => string[]
      open: () => void
      renderBakedTranscript: (request?: Omit<DebugTranscriptRequest, 'entries' | 'items'>) => void
      renderTranscript: (request?: DebugTranscriptRequest) => void
    }
    oxox: OxoxBridge
  }
}
