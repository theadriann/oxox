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
  factoryModels: [],
  factoryDefaultSettings: {},
}

export interface FoundationState {
  foundation: FoundationBootstrap
  foundationLoadError: string | null
  hasLoadedFoundation: boolean
}

export function createDefaultFoundationState(): FoundationState {
  return {
    foundation: PLACEHOLDER_FOUNDATION,
    foundationLoadError: null,
    hasLoadedFoundation: false,
  }
}

export function createFoundationState$(): Observable<FoundationState> {
  return observable(createDefaultFoundationState())
}
