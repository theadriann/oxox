import { describe, expect, it } from 'vitest'
import type { FoundationBootstrap, LiveSessionSnapshot } from '../../../../shared/ipc/contracts'
import { createMemoryPersistencePort } from '../../platform/persistence'
import type { ComposerPreferences } from '../composerPreferences'
import {
  deriveComposerPreferences,
  deriveDefaultComposerPreferences,
  persistComposerPreferences,
  readPersistedComposerPreferences,
} from '../composerPreferences'

function createBootstrap(overrides: Partial<FoundationBootstrap> = {}): FoundationBootstrap {
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
    factoryModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
    factoryDefaultSettings: { model: 'gpt-5.4', interactionMode: 'auto' },
    ...overrides,
  }
}

describe('readPersistedComposerPreferences', () => {
  it('returns empty object when storage has no key', () => {
    expect(readPersistedComposerPreferences(createMemoryPersistencePort())).toEqual({})
  })

  it('parses valid stored preferences', () => {
    const persistence = createMemoryPersistencePort()
    persistComposerPreferences(persistence, {
      'session-1': { modelId: 'claude-3.7', interactionMode: 'spec', autonomyLevel: 'medium' },
    })

    expect(readPersistedComposerPreferences(persistence)).toEqual({
      'session-1': { modelId: 'claude-3.7', interactionMode: 'spec', autonomyLevel: 'medium' },
    })
  })

  it('skips entries with missing required fields', () => {
    const persistence = createMemoryPersistencePort({
      'oxox.session.composer': {
        'session-1': { modelId: 'claude-3.7' },
      },
    })

    expect(readPersistedComposerPreferences(persistence)).toEqual({})
  })
})

describe('deriveDefaultComposerPreferences', () => {
  it('falls back to factory defaults', () => {
    const bootstrap = createBootstrap()
    const prefs = deriveDefaultComposerPreferences(
      bootstrap.factoryDefaultSettings,
      bootstrap.factoryModels,
    )

    expect(prefs).toEqual({
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      reasoningEffort: '',
      autonomyLevel: 'medium',
    })
  })

  it('uses first factory model when no default model', () => {
    const bootstrap = createBootstrap({
      factoryDefaultSettings: {},
      factoryModels: [
        {
          id: 'gpt-5.4',
          name: 'GPT 5.4',
          supportedReasoningEfforts: ['medium', 'high'],
          defaultReasoningEffort: 'medium',
        },
      ],
    })
    const prefs = deriveDefaultComposerPreferences(
      bootstrap.factoryDefaultSettings,
      bootstrap.factoryModels,
    )

    expect(prefs.modelId).toBe('gpt-5.4')
    expect(prefs.reasoningEffort).toBe('medium')
  })
})

describe('deriveComposerPreferences', () => {
  it('returns persisted preferences when available', () => {
    const persisted: Record<string, ComposerPreferences> = {
      'session-1': {
        modelId: 'claude-3.7',
        interactionMode: 'spec',
        reasoningEffort: 'high',
        autonomyLevel: 'high',
      },
    }

    const prefs = deriveComposerPreferences(
      'session-1',
      null,
      persisted,
      createBootstrap().factoryDefaultSettings,
      createBootstrap().factoryModels,
    )

    expect(prefs).toEqual({
      modelId: 'claude-3.7',
      interactionMode: 'spec',
      reasoningEffort: 'high',
      autonomyLevel: 'high',
    })
  })

  it('derives from snapshot settings when no persisted prefs', () => {
    const snapshot = {
      settings: { modelId: 'gpt-5.4-mini', interactionMode: 'spec', reasoningEffort: 'low' },
      availableModels: [
        {
          id: 'gpt-5.4-mini',
          name: 'Mini',
          supportedReasoningEfforts: ['low', 'medium'],
          defaultReasoningEffort: 'low',
        },
      ],
    } as unknown as LiveSessionSnapshot

    const prefs = deriveComposerPreferences(
      'session-1',
      snapshot,
      {},
      { model: 'gpt-5.4', interactionMode: 'auto' },
      [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
    )

    expect(prefs.modelId).toBe('gpt-5.4-mini')
    expect(prefs.interactionMode).toBe('spec')
    expect(prefs.reasoningEffort).toBe('low')
  })
})
