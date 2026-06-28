import { type Observable, observable } from '@legendapp/state'
import type { FoundationBootstrap } from '../../../../shared/ipc/contracts'

export const PLACEHOLDER_FOUNDATION: FoundationBootstrap = {
  database: {
    exists: false,
    journalMode: 'wal',
    path: '',
    tableNames: [],
  },
  droidCli: {
    available: true,
    path: null,
    version: null,
    searchedLocations: [],
    error: null,
  },
  daemon: {
    status: 'disconnected',
    connectedPort: null,
    lastError: null,
    lastConnectedAt: null,
    lastSyncAt: null,
    nextRetryDelayMs: null,
  },
  projects: [],
  sessions: [],
  syncMetadata: [],
  sessionFolders: [],
  sessionFolderAssignments: [],
  sessionReindexProgress: {
    phase: 'idle',
    totalCount: 0,
    visitedCount: 0,
    processedCount: 0,
    skippedCount: 0,
    unreadableCount: 0,
    deletedCount: 0,
    startedAt: null,
    updatedAt: null,
    completedAt: null,
    error: null,
  },
  factoryModels: [],
  factoryDefaultSettings: {},
}

export interface FoundationState {
  foundation: FoundationBootstrap
  foundationLoadError: string | null
  hasLoadedFoundation: boolean
  isReindexingSessions: boolean
  sessionReindexError: string | null
}

export function createDefaultFoundationState(): FoundationState {
  return {
    foundation: PLACEHOLDER_FOUNDATION,
    foundationLoadError: null,
    hasLoadedFoundation: false,
    isReindexingSessions: false,
    sessionReindexError: null,
  }
}

export function createFoundationState$(): Observable<FoundationState> {
  return observable(createDefaultFoundationState())
}
