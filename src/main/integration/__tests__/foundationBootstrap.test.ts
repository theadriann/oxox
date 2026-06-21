import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createFoundationBootstrapState,
  parseDaemonDefaultSettingsBootstrap,
  parseDroidExecHelpBootstrap,
  readFactorySettingsBootstrap,
  readFoundationBootstrap,
} from '../foundation/bootstrap'

const cleanupPaths: string[] = []

describe('foundation bootstrap', () => {
  afterEach(() => {
    while (cleanupPaths.length > 0) {
      const path = cleanupPaths.pop()

      if (path) {
        rmSync(path, { force: true, recursive: true })
      }
    }
  })

  it('maps custom models and session defaults without exposing sensitive fields', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-settings-'))
    const settingsPath = join(tempDirectory, 'settings.json')
    cleanupPaths.push(tempDirectory)

    writeFileSync(
      settingsPath,
      JSON.stringify({
        customModels: [
          {
            id: 'claude-3.7',
            displayName: 'Claude 3.7 Sonnet',
            provider: 'anthropic',
            maxContextLimit: 180000,
            apiKey: 'super-secret',
            baseUrl: 'https://internal.example.com',
          },
          {
            id: '',
            displayName: 'Invalid model',
            provider: 'openai',
          },
        ],
        sessionDefaultSettings: {
          model: 'claude-3.7',
          interactionMode: 'spec',
          autonomyMode: 'auto-high',
          autonomyLevel: 'high',
          specModeModelId: 'claude-opus-4.1',
          specModeReasoningEffort: 'high',
          enabledToolIds: ['read-cli', 'glob-cli'],
          disabledToolIds: ['execute-cli'],
          apiKey: 'still-secret',
        },
        compactionTokenLimit: 300000,
      }),
    )

    const bootstrap = readFactorySettingsBootstrap(settingsPath)

    expect(bootstrap).toEqual({
      factoryModels: [
        {
          id: 'claude-3.7',
          name: 'Claude 3.7 Sonnet',
          provider: 'anthropic',
          maxContextLimit: 180000,
        },
      ],
      factoryDefaultSettings: {
        model: 'claude-3.7',
        interactionMode: 'spec',
        autonomyMode: 'auto-high',
        autonomyLevel: 'high',
        specModeModelId: 'claude-opus-4.1',
        specModeReasoningEffort: 'high',
        enabledToolIds: ['read-cli', 'glob-cli'],
        disabledToolIds: ['execute-cli'],
        compactionTokenLimit: 300000,
      },
    })
    expect(bootstrap.factoryModels[0]).not.toHaveProperty('apiKey')
    expect(bootstrap.factoryModels[0]).not.toHaveProperty('baseUrl')
  })

  it('returns empty defaults when the settings file is missing', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-settings-'))
    cleanupPaths.push(tempDirectory)

    expect(readFactorySettingsBootstrap(join(tempDirectory, 'missing-settings.json'))).toEqual({
      factoryModels: [],
      factoryDefaultSettings: {},
    })
  })

  it('returns empty defaults when the settings file is malformed', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-settings-'))
    const settingsPath = join(tempDirectory, 'settings.json')
    cleanupPaths.push(tempDirectory)

    writeFileSync(settingsPath, '{not-valid-json')

    expect(readFactorySettingsBootstrap(settingsPath)).toEqual({
      factoryModels: [],
      factoryDefaultSettings: {},
    })
  })

  it('reads top-level compactionTokenLimit without session default settings', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-settings-'))
    const settingsPath = join(tempDirectory, 'settings.json')
    cleanupPaths.push(tempDirectory)

    writeFileSync(
      settingsPath,
      JSON.stringify({
        compactionTokenLimit: 0,
      }),
    )

    expect(readFactorySettingsBootstrap(settingsPath)).toEqual({
      factoryModels: [],
      factoryDefaultSettings: {
        compactionTokenLimit: 0,
      },
    })
  })

  it('extracts models and the default model from droid exec help output', () => {
    expect(
      parseDroidExecHelpBootstrap(`
Usage: droid exec [options] [prompt]

Available Models:
  claude-opus-4-6                         Claude Opus 4.6 (default)
  gpt-5.4                                 GPT-5.4

Custom Models:
  custom:claude-opus-4-6                  [Claude] Claude 4.6 Opus
  custom:gpt-5.4(high)                    [OpenAI] GPT 5.4 (High)

Model details:
  - Claude Opus 4.6: supports reasoning: Yes; supported: [off, low, medium, high, max]; default: high
  - GPT-5.4: supports reasoning: Yes; supported: [low, medium, high, xhigh]; default: medium
`),
    ).toEqual({
      factoryModels: [
        {
          id: 'claude-opus-4-6',
          name: 'Claude Opus 4.6',
          supportedReasoningEfforts: ['off', 'low', 'medium', 'high', 'max'],
          defaultReasoningEffort: 'high',
        },
        {
          id: 'gpt-5.4',
          name: 'GPT-5.4',
          supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
          defaultReasoningEffort: 'medium',
        },
        {
          id: 'custom:claude-opus-4-6',
          name: 'Claude 4.6 Opus',
          provider: 'Claude',
          supportedReasoningEfforts: ['off', 'low', 'medium', 'high', 'max'],
          defaultReasoningEffort: 'high',
        },
        {
          id: 'custom:gpt-5.4(high)',
          name: 'GPT 5.4 (High)',
          provider: 'OpenAI',
          supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
          defaultReasoningEffort: 'medium',
        },
      ],
      factoryDefaultSettings: {
        model: 'claude-opus-4-6',
      },
    })
  })

  it('maps daemon default-settings results into factory bootstrap defaults', () => {
    expect(
      parseDaemonDefaultSettingsBootstrap({
        modelId: 'claude-opus-4-6',
        interactionMode: 'spec',
        autonomyLevel: 'high',
        reasoningEffort: 'medium',
        specModeModelId: 'claude-sonnet-4-6',
        specModeReasoningEffort: 'high',
        compactionTokenLimit: 300000,
        compactionTokenLimitPerModel: {
          'claude-opus-4-6': 250000,
        },
        compactionModel: 'current-model',
        compactionThresholdCheckEnabled: true,
        runInWorktree: true,
        worktreeDirectory: '/Users/test/worktrees',
        subagentModelSettings: {
          lightModel: 'claude-haiku-4-6',
        },
        missionSettings: {
          workerModel: 'claude-sonnet-4-6',
        },
        missionOrchestratorModel: 'claude-opus-4-6',
        missionOrchestratorReasoningEffort: 'max',
        availableModels: [
          {
            id: 'claude-opus-4-6',
            displayName: 'Claude Opus 4.6',
            shortDisplayName: 'Opus',
            modelProvider: 'anthropic',
            supportedReasoningEfforts: ['low', 'medium', 'high'],
            defaultReasoningEffort: 'medium',
          },
        ],
      }),
    ).toEqual({
      factoryModels: [
        {
          id: 'claude-opus-4-6',
          name: 'Claude Opus 4.6',
          provider: 'anthropic',
          supportedReasoningEfforts: ['low', 'medium', 'high'],
          defaultReasoningEffort: 'medium',
        },
      ],
      factoryDefaultSettings: {
        model: 'claude-opus-4-6',
        interactionMode: 'spec',
        autonomyLevel: 'high',
        reasoningEffort: 'medium',
        specModeModelId: 'claude-sonnet-4-6',
        specModeReasoningEffort: 'high',
        compactionTokenLimit: 300000,
        compactionTokenLimitPerModel: {
          'claude-opus-4-6': 250000,
        },
        compactionModel: 'current-model',
        compactionThresholdCheckEnabled: true,
        runInWorktree: true,
        worktreeDirectory: '/Users/test/worktrees',
        subagentModelSettings: {
          lightModel: 'claude-haiku-4-6',
        },
        missionSettings: {
          workerModel: 'claude-sonnet-4-6',
        },
        missionOrchestratorModel: 'claude-opus-4-6',
        missionOrchestratorReasoningEffort: 'max',
      },
    })
  })

  it('uses settings defaults when the settings model exists in Droid CLI models', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-bootstrap-'))
    const settingsPath = join(tempDirectory, 'settings.json')
    cleanupPaths.push(tempDirectory)

    writeFileSync(
      settingsPath,
      JSON.stringify({
        customModels: [{ id: 'legacy-model', displayName: 'Legacy Model' }],
        sessionDefaultSettings: {
          model: 'custom:gpt-5.4(high)',
          interactionMode: 'spec',
          reasoningEffort: 'high',
          autonomyLevel: 'high',
        },
      }),
    )

    expect(
      readFoundationBootstrap({
        settingsPath,
        droidPath: '/Users/test/.local/bin/droid',
        readDroidExecHelp: vi.fn().mockReturnValue(`
Usage: droid exec [options] [prompt]

Available Models:
  claude-opus-4-6                         Claude Opus 4.6 (default)
  gpt-5.4                                 GPT-5.4

Custom Models:
  custom:gpt-5.4(high)                    [OpenAI] GPT 5.4 (High)

Model details:
  - GPT-5.4: supports reasoning: Yes; supported: [low, medium, high, xhigh]; default: medium
`),
      }),
    ).toEqual({
      factoryModels: [
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
        {
          id: 'gpt-5.4',
          name: 'GPT-5.4',
          supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
          defaultReasoningEffort: 'medium',
        },
        {
          id: 'custom:gpt-5.4(high)',
          name: 'GPT 5.4 (High)',
          provider: 'OpenAI',
          supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
          defaultReasoningEffort: 'medium',
        },
      ],
      factoryDefaultSettings: {
        model: 'custom:gpt-5.4(high)',
        interactionMode: 'spec',
        reasoningEffort: 'high',
        autonomyLevel: 'high',
      },
    })
  })

  it('merges settings-derived maxContextLimit and compactionTokenLimit into CLI bootstrap', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-bootstrap-'))
    const settingsPath = join(tempDirectory, 'settings.json')
    cleanupPaths.push(tempDirectory)

    writeFileSync(
      settingsPath,
      JSON.stringify({
        customModels: [
          {
            id: 'claude-opus-4-6',
            displayName: 'Claude Opus 4.6',
            maxContextLimit: 180000,
          },
        ],
        compactionTokenLimit: 300000,
      }),
    )

    expect(
      readFoundationBootstrap({
        settingsPath,
        droidPath: '/Users/test/.local/bin/droid',
        readDroidExecHelp: vi.fn().mockReturnValue(`
Usage: droid exec [options] [prompt]

Available Models:
  claude-opus-4-6                         Claude Opus 4.6 (default)
  gpt-5.4                                 GPT-5.4

Model details:
`),
      }),
    ).toEqual({
      factoryModels: [
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', maxContextLimit: 180000 },
        { id: 'gpt-5.4', name: 'GPT-5.4' },
      ],
      factoryDefaultSettings: {
        model: 'claude-opus-4-6',
        compactionTokenLimit: 300000,
      },
    })
  })

  it('falls back to settings-derived models when CLI discovery is unavailable', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-bootstrap-'))
    const settingsPath = join(tempDirectory, 'settings.json')
    cleanupPaths.push(tempDirectory)

    writeFileSync(
      settingsPath,
      JSON.stringify({
        customModels: [
          {
            id: 'claude-3.7',
            displayName: 'Claude 3.7 Sonnet',
            provider: 'anthropic',
            supportedReasoningEfforts: ['low', 'medium', 'high'],
            defaultReasoningEffort: 'high',
          },
        ],
      }),
    )

    expect(
      readFoundationBootstrap({
        settingsPath,
        droidPath: '/Users/test/.local/bin/droid',
        readDroidExecHelp: vi.fn().mockReturnValue(null),
      }),
    ).toEqual({
      factoryModels: [
        {
          id: 'claude-3.7',
          name: 'Claude 3.7 Sonnet',
          provider: 'anthropic',
          supportedReasoningEfforts: ['low', 'medium', 'high'],
          defaultReasoningEffort: 'high',
        },
      ],
      factoryDefaultSettings: {},
    })
  })

  it('uses the CLI default model when settings do not specify one', () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-bootstrap-'))
    cleanupPaths.push(tempDirectory)

    expect(
      readFoundationBootstrap({
        settingsPath: join(tempDirectory, 'missing-settings.json'),
        droidPath: '/Users/test/.local/bin/droid',
        readDroidExecHelp: vi.fn().mockReturnValue(`
Usage: droid exec [options] [prompt]

Available Models:
  claude-opus-4-6                         Claude Opus 4.6 (default)
  gpt-5.4                                 GPT-5.4

Model details:
`),
      }),
    ).toEqual({
      factoryModels: [
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
        { id: 'gpt-5.4', name: 'GPT-5.4' },
      ],
      factoryDefaultSettings: {
        model: 'claude-opus-4-6',
      },
    })
  })

  it('starts from settings and asynchronously refreshes to CLI-derived models', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-bootstrap-'))
    const settingsPath = join(tempDirectory, 'settings.json')
    cleanupPaths.push(tempDirectory)

    writeFileSync(
      settingsPath,
      JSON.stringify({
        customModels: [{ id: 'legacy-model', displayName: 'Legacy Model' }],
        sessionDefaultSettings: {
          model: 'legacy-model',
          interactionMode: 'auto',
        },
      }),
    )

    const onChange = vi.fn()
    const bootstrapState = createFoundationBootstrapState({
      settingsPath,
      droidPath: '/Users/test/.local/bin/droid',
      onChange,
      readDroidExecHelp: vi.fn().mockResolvedValue(`
Usage: droid exec [options] [prompt]

Available Models:
  claude-opus-4-6                         Claude Opus 4.6 (default)

Model details:
`),
    })

    expect(bootstrapState.getSnapshot()).toEqual({
      factoryModels: [{ id: 'legacy-model', name: 'Legacy Model', provider: undefined }],
      factoryDefaultSettings: {
        model: 'legacy-model',
        interactionMode: 'auto',
      },
    })

    await bootstrapState.refreshFromDroidCli()

    expect(bootstrapState.getSnapshot()).toEqual({
      factoryModels: [{ id: 'claude-opus-4-6', name: 'Claude Opus 4.6' }],
      factoryDefaultSettings: {
        model: 'claude-opus-4-6',
      },
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('preserves settings-derived compactionTokenLimit and overlapping model maxContextLimit on refresh', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-bootstrap-'))
    const settingsPath = join(tempDirectory, 'settings.json')
    cleanupPaths.push(tempDirectory)

    writeFileSync(
      settingsPath,
      JSON.stringify({
        customModels: [
          {
            id: 'claude-opus-4-6',
            displayName: 'Local Claude',
            maxContextLimit: 180000,
          },
        ],
        compactionTokenLimit: 300000,
      }),
    )

    const onChange = vi.fn()
    const bootstrapState = createFoundationBootstrapState({
      settingsPath,
      droidPath: '/Users/test/.local/bin/droid',
      onChange,
      readDroidExecHelp: vi.fn().mockResolvedValue(`
Usage: droid exec [options] [prompt]

Available Models:
  claude-opus-4-6                         Claude Opus 4.6 (default)

Model details:
`),
    })

    expect(bootstrapState.getSnapshot()).toEqual({
      factoryModels: [
        {
          id: 'claude-opus-4-6',
          name: 'Local Claude',
          maxContextLimit: 180000,
          provider: undefined,
        },
      ],
      factoryDefaultSettings: {
        compactionTokenLimit: 300000,
      },
    })

    await bootstrapState.refreshFromDroidCli()

    expect(bootstrapState.getSnapshot()).toEqual({
      factoryModels: [{ id: 'claude-opus-4-6', name: 'Claude Opus 4.6', maxContextLimit: 180000 }],
      factoryDefaultSettings: {
        model: 'claude-opus-4-6',
        compactionTokenLimit: 300000,
      },
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('prefers daemon default settings over CLI/settings bootstrap and can fall back to local discovery', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'oxox-bootstrap-'))
    const settingsPath = join(tempDirectory, 'settings.json')
    cleanupPaths.push(tempDirectory)

    writeFileSync(
      settingsPath,
      JSON.stringify({
        customModels: [{ id: 'settings-model', displayName: 'Settings Model' }],
        sessionDefaultSettings: {
          model: 'settings-model',
          interactionMode: 'auto',
        },
      }),
    )

    const onChange = vi.fn()
    const bootstrapState = createFoundationBootstrapState({
      settingsPath,
      droidPath: '/Users/test/.local/bin/droid',
      onChange,
      readDroidExecHelp: vi.fn().mockResolvedValue(`
Usage: droid exec [options] [prompt]

Available Models:
  cli-model                               CLI Model (default)

Model details:
`),
      readDaemonDefaultSettings: vi.fn().mockResolvedValue({
        modelId: 'daemon-model',
        interactionMode: 'spec',
        reasoningEffort: 'high',
        availableModels: [
          {
            id: 'daemon-model',
            displayName: 'Daemon Model',
            shortDisplayName: 'Daemon',
            modelProvider: 'openai',
            supportedReasoningEfforts: ['medium', 'high'],
            defaultReasoningEffort: 'medium',
          },
        ],
      }),
    })

    await bootstrapState.refreshFromDroidCli()

    expect(bootstrapState.getSnapshot()).toEqual({
      factoryModels: [{ id: 'cli-model', name: 'CLI Model' }],
      factoryDefaultSettings: {
        model: 'cli-model',
      },
    })

    await bootstrapState.refreshFromDaemonDefaults()

    expect(bootstrapState.getSnapshot()).toEqual({
      factoryModels: [
        {
          id: 'daemon-model',
          name: 'Daemon Model',
          provider: 'openai',
          supportedReasoningEfforts: ['medium', 'high'],
          defaultReasoningEffort: 'medium',
        },
      ],
      factoryDefaultSettings: {
        model: 'daemon-model',
        interactionMode: 'spec',
        reasoningEffort: 'high',
      },
    })

    bootstrapState.clearDaemonDefaultSettings()

    expect(bootstrapState.getSnapshot()).toEqual({
      factoryModels: [{ id: 'cli-model', name: 'CLI Model' }],
      factoryDefaultSettings: {
        model: 'cli-model',
      },
    })
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('notifies when expanded daemon defaults change', async () => {
    const onChange = vi.fn()
    const readDaemonDefaultSettings = vi
      .fn()
      .mockResolvedValueOnce({
        modelId: 'daemon-model',
        compactionModel: 'current-model',
        runInWorktree: false,
      })
      .mockResolvedValueOnce({
        modelId: 'daemon-model',
        compactionModel: 'claude-opus-4-6',
        runInWorktree: true,
      })
    const bootstrapState = createFoundationBootstrapState({
      settingsPath: '/tmp/missing-settings.json',
      droidPath: '/Users/test/.local/bin/droid',
      onChange,
      readDaemonDefaultSettings,
    })

    await bootstrapState.refreshFromDaemonDefaults()
    await bootstrapState.refreshFromDaemonDefaults()

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(bootstrapState.getSnapshot().factoryDefaultSettings).toEqual({
      model: 'daemon-model',
      compactionModel: 'claude-opus-4-6',
      runInWorktree: true,
    })
  })
})
