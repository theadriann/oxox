import type { LiveSessionMessageImageSource } from '../../../../shared/ipc/contracts'
import type { PlatformApiClient } from '../../platform/apiClient'
import type { ComposerPreferences } from './composer-preferences.persistence'

export type ComposerStatus =
  | 'idle'
  | 'active'
  | 'waiting'
  | 'completed'
  | 'reconnecting'
  | 'orphaned'
  | 'error'

export type ComposerSessionGateway = PlatformApiClient['session']

export interface ComposerImageAttachment extends LiveSessionMessageImageSource {
  id: string
  name: string
  size: number
}

export interface ComposerSubmitPayload {
  text: string
  modelId: string
  interactionMode: string
  reasoningEffort?: string
  autonomyLevel: string
  images?: LiveSessionMessageImageSource[]
}

export interface ComposerSessionDraftSnapshot {
  draft: string
  imageAttachments: ComposerImageAttachment[]
}

export interface ComposerState {
  draft: string
  imageAttachments: ComposerImageAttachment[]
  draftsBySessionId: Record<string, ComposerSessionDraftSnapshot>
  error: string | null
  preferencesBySessionId: Record<string, ComposerPreferences>
  pendingDraftWorkspacePath: string | null
  pendingDraftPreferences: ComposerPreferences | null
  sendingSessionId: string | null
  isPendingDraftSubmitting: boolean
  attachingSessionId: string | null
  interruptingSessionId: string | null
}
