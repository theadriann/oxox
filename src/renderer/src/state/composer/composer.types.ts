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

export interface ComposerState {
  draft: string
  error: string | null
  preferencesBySessionId: Record<string, ComposerPreferences>
  pendingDraftWorkspacePath: string | null
  pendingDraftPreferences: ComposerPreferences | null
  sendingSessionId: string | null
  isPendingDraftSubmitting: boolean
  attachingSessionId: string | null
  interruptingSessionId: string | null
}
