import { describe, expect, it } from 'vitest'

import type { FoundationBootstrap } from '../contracts'
import { diffFoundationBootstraps } from '../foundationUpdates'

function createBootstrap(
  factoryDefaultSettings: FoundationBootstrap['factoryDefaultSettings'],
): FoundationBootstrap {
  return {
    database: { exists: true, journalMode: 'wal', path: '/tmp/oxox.db', tableNames: [] },
    droidCli: { available: true, path: null, version: '1.0', searchedLocations: [], error: null },
    daemon: {
      status: 'connected',
      connectedPort: 1234,
      lastError: null,
      lastConnectedAt: null,
      lastSyncAt: null,
      nextRetryDelayMs: null,
    },
    projects: [],
    sessions: [],
    syncMetadata: [],
    factoryModels: [],
    factoryDefaultSettings,
  }
}

describe('diffFoundationBootstraps', () => {
  it('reports changes to expanded factory default settings', () => {
    const previous = createBootstrap({
      model: 'gpt-5.4',
      compactionModel: 'current-model',
      runInWorktree: false,
      worktreeDirectory: '/tmp/worktrees',
      subagentModelSettings: { lightModel: 'gpt-5.4-mini' },
    })
    const next = createBootstrap({
      model: 'gpt-5.4',
      compactionModel: 'claude-opus-4-6',
      runInWorktree: true,
      worktreeDirectory: '/Users/test/worktrees',
      subagentModelSettings: { lightModel: 'claude-haiku-4-6' },
    })

    expect(diffFoundationBootstraps(previous, next)).toEqual({
      factoryDefaultSettings: next.factoryDefaultSettings,
    })
  })
})
