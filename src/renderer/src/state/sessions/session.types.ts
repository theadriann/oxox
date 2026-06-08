export type SessionStatus = 'active' | 'waiting' | 'completed'

export type ExtendedSessionStatus =
  | SessionStatus
  | 'idle'
  | 'disconnected'
  | 'reconnecting'
  | 'orphaned'
  | 'error'

export interface SessionPreview {
  id: string
  title: string
  projectKey: string
  projectLabel: string
  defaultProjectLabel?: string
  projectWorkspacePath: string | null
  modelId?: string | null
  parentSessionId: string | null
  derivationType: string | null
  hasUserMessage: boolean
  status: ExtendedSessionStatus
  transport: string | null
  createdAt: string
  updatedAt: string
  lastActivityAt: string | null
  lastActivityTimestamp: number
}

export interface ProjectSessionGroup {
  key: string
  label: string
  workspacePath: string | null
  latestActivityAt: number
  sessions: SessionPreview[]
}

export interface PersistedSessionPreferences {
  pinnedSessionIds?: string[]
  projectDisplayNames?: Record<string, string>
  archivedSessionIds?: string[]
  archivedProjectKeys?: string[]
}

export interface SessionState {
  sessions: SessionPreview[]
  sessionsById: Record<string, SessionPreview>
  selectedSessionId: string
  hasHydratedSessions: boolean
  missingSelectedSession: boolean
  isDraftSelectionActive: boolean
  pinnedSessionIds: string[]
  projectDisplayNames: Record<string, string>
  archivedSessionIds: string[]
  archivedProjectKeys: string[]
}
