import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { protocol } from '@factory/droid-sdk'

import type { FoundationBootstrap, LiveSessionModel } from '../../../shared/ipc/contracts'

const EMPTY_FACTORY_SETTINGS_BOOTSTRAP: Pick<
  FoundationBootstrap,
  'factoryModels' | 'factoryDefaultSettings'
> = {
  factoryModels: [],
  factoryDefaultSettings: {},
}

export function readFactorySettingsBootstrap(
  settingsPath = join(homedir(), '.factory', 'settings.json'),
): Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'> {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as unknown

    return {
      factoryModels: parseFactoryModels(parsed),
      factoryDefaultSettings: parseFactoryDefaultSettings(parsed),
    }
  } catch {
    return EMPTY_FACTORY_SETTINGS_BOOTSTRAP
  }
}

export interface ReadFoundationBootstrapOptions {
  settingsPath?: string
  droidPath?: string
  readDroidExecHelp?: (binaryPath: string) => string | null
}

export interface CreateFoundationBootstrapStateOptions {
  settingsPath?: string
  droidPath?: string
  onChange?: () => void
  readDroidExecHelp?: (binaryPath: string) => Promise<string | null>
  readDaemonDefaultSettings?: () => Promise<unknown>
}

export interface FoundationBootstrapState {
  getSnapshot: () => Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>
  refreshFromDroidCli: () => Promise<void>
  refreshFromDaemonDefaults: () => Promise<void>
  clearDaemonDefaultSettings: () => void
}

export function readFoundationBootstrap(
  options: ReadFoundationBootstrapOptions = {},
): Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'> {
  const settingsBootstrap = readFactorySettingsBootstrap(options.settingsPath)

  if (typeof options.droidPath !== 'string') {
    return settingsBootstrap
  }

  const cliBootstrap = parseDroidExecHelpBootstrap(
    (options.readDroidExecHelp ?? readDroidExecHelp)(options.droidPath),
  )

  return isEmptyFoundationBootstrap(cliBootstrap)
    ? settingsBootstrap
    : mergeSettingsBootstrapIntoCliBootstrap(settingsBootstrap, cliBootstrap)
}

export function createFoundationBootstrapState({
  settingsPath,
  droidPath,
  onChange,
  readDroidExecHelp = readDroidExecHelpAsync,
  readDaemonDefaultSettings,
}: CreateFoundationBootstrapStateOptions): FoundationBootstrapState {
  let fallbackSnapshot = readFactorySettingsBootstrap(settingsPath)
  let daemonSnapshot: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'> | null =
    null

  const getSnapshot = (): Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'> =>
    daemonSnapshot ?? fallbackSnapshot

  return {
    getSnapshot,
    refreshFromDroidCli: async () => {
      if (!droidPath) {
        return
      }

      try {
        const helpText = await readDroidExecHelp(droidPath)

        if (!helpText) {
          return
        }

        const nextSnapshot = mergeSettingsBootstrapIntoCliBootstrap(
          readFactorySettingsBootstrap(settingsPath),
          parseDroidExecHelpBootstrap(helpText),
        )

        if (!bootstrapChanged(fallbackSnapshot, nextSnapshot)) {
          return
        }

        const previousSnapshot = getSnapshot()
        fallbackSnapshot = nextSnapshot

        if (!daemonSnapshot && bootstrapChanged(previousSnapshot, getSnapshot())) {
          onChange?.()
        }
      } catch {
        return
      }
    },
    refreshFromDaemonDefaults: async () => {
      if (!readDaemonDefaultSettings) {
        return
      }

      try {
        const nextSnapshot = parseDaemonDefaultSettingsBootstrap(
          await readDaemonDefaultSettings(),
          fallbackSnapshot,
        )

        if (daemonSnapshot && !bootstrapChanged(daemonSnapshot, nextSnapshot)) {
          return
        }

        const previousSnapshot = getSnapshot()
        daemonSnapshot = nextSnapshot

        if (bootstrapChanged(previousSnapshot, getSnapshot())) {
          onChange?.()
        }
      } catch {
        return
      }
    },
    clearDaemonDefaultSettings: () => {
      if (!daemonSnapshot) {
        return
      }

      const previousSnapshot = getSnapshot()
      daemonSnapshot = null

      if (bootstrapChanged(previousSnapshot, getSnapshot())) {
        onChange?.()
      }
    },
  }
}

export function readDroidExecHelp(binaryPath: string): string | null {
  const result = spawnSync(binaryPath, ['exec', '--help'], {
    encoding: 'utf8',
    timeout: 5000,
  })

  if (result.error || result.status !== 0) {
    return null
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
  return output.length > 0 ? output : null
}

export function parseDroidExecHelpBootstrap(
  helpText: string | null | undefined,
): Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'> {
  if (!helpText) {
    return EMPTY_FACTORY_SETTINGS_BOOTSTRAP
  }

  const availableModels = parseDroidHelpModels(
    extractDroidHelpSection(helpText, 'Available Models:'),
  )
  const customModels = parseDroidHelpModels(
    extractDroidHelpSection(helpText, 'Custom Models:'),
    true,
  )
  const modelDetailsByName = parseDroidHelpModelDetails(
    extractDroidHelpSection(helpText, 'Model details:'),
  )
  const defaultModel = availableModels.find((model) => model.isDefault)?.id

  return {
    factoryModels: [...availableModels, ...customModels].map(({ isDefault: _ignored, ...model }) =>
      enrichModelWithDetails(model, modelDetailsByName),
    ),
    factoryDefaultSettings: defaultModel ? { model: defaultModel } : {},
  }
}

function extractDroidHelpSection(helpText: string, heading: string): string[] {
  const lines = helpText.split('\n')
  const startIndex = lines.findIndex((line) => line.trim() === heading)

  if (startIndex === -1) {
    return []
  }

  const sectionLines: string[] = []

  for (const line of lines.slice(startIndex + 1)) {
    if (!line.trim()) {
      if (sectionLines.length > 0) {
        break
      }

      continue
    }

    if (!line.startsWith('  ')) {
      break
    }

    sectionLines.push(line)
  }

  return sectionLines
}

function readDroidExecHelpAsync(binaryPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(binaryPath, ['exec', '--help'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (value: string | null): void => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutHandle)
      resolve(value)
    }

    const timeoutHandle = setTimeout(() => {
      child.kill()
      finish(null)
    }, 5000)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', () => {
      finish(null)
    })
    child.on('close', (code) => {
      if (code !== 0) {
        finish(null)
        return
      }

      const output = `${stdout}\n${stderr}`.trim()
      finish(output.length > 0 ? output : null)
    })
  })
}

function parseDroidHelpModels(
  lines: string[],
  parseProvider = false,
): Array<LiveSessionModel & { isDefault?: boolean }> {
  return lines.flatMap((line) => {
    const match = line.trim().match(/^(\S+)\s{2,}(.+)$/)

    if (!match) {
      return []
    }

    const [, id, rawDescriptor] = match
    const isDefault = rawDescriptor.includes('(default)')
    const descriptor = rawDescriptor.replace(/\s+\(default\)\s*$/, '').trim()
    const providerMatch = parseProvider ? descriptor.match(/^\[([^\]]+)\]\s+(.+)$/) : null
    const provider = providerMatch?.[1]?.trim()
    const name = (providerMatch?.[2] ?? descriptor).trim()

    if (!id || !name) {
      return []
    }

    return [
      {
        id,
        name,
        ...(provider ? { provider } : {}),
        ...(isDefault ? { isDefault: true } : {}),
      },
    ]
  })
}

function parseDroidHelpModelDetails(
  lines: string[],
): Map<string, Pick<LiveSessionModel, 'supportedReasoningEfforts' | 'defaultReasoningEffort'>> {
  const detailsByName = new Map<
    string,
    Pick<LiveSessionModel, 'supportedReasoningEfforts' | 'defaultReasoningEffort'>
  >()

  for (const line of lines) {
    const match = line
      .trim()
      .match(
        /^-\s+(.+?):\s+supports reasoning:\s+(Yes|No)(?:;\s+supported:\s+\[([^\]]*)\])?(?:;\s+default:\s+([^;]+))?/,
      )

    if (!match) {
      continue
    }

    const [, name, supportsReasoning, supportedValues, defaultValue] = match

    if (supportsReasoning !== 'Yes') {
      continue
    }

    const supportedReasoningEfforts = supportedValues
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    detailsByName.set(name.trim(), {
      ...(supportedReasoningEfforts && supportedReasoningEfforts.length > 0
        ? { supportedReasoningEfforts }
        : {}),
      ...(typeof defaultValue === 'string' && defaultValue.trim().length > 0
        ? { defaultReasoningEffort: defaultValue.trim() }
        : {}),
    })
  }

  return detailsByName
}

function enrichModelWithDetails(
  model: LiveSessionModel,
  detailsByName: Map<
    string,
    Pick<LiveSessionModel, 'supportedReasoningEfforts' | 'defaultReasoningEffort'>
  >,
): LiveSessionModel {
  const details =
    detailsByName.get(model.name) ?? findModelDetailsByAlias(model.name, detailsByName)

  if (!details) {
    return model
  }

  return {
    ...model,
    ...(details.supportedReasoningEfforts
      ? { supportedReasoningEfforts: [...details.supportedReasoningEfforts] }
      : {}),
    ...(details.defaultReasoningEffort
      ? { defaultReasoningEffort: details.defaultReasoningEffort }
      : {}),
  }
}

function findModelDetailsByAlias(
  modelName: string,
  detailsByName: Map<
    string,
    Pick<LiveSessionModel, 'supportedReasoningEfforts' | 'defaultReasoningEffort'>
  >,
): Pick<LiveSessionModel, 'supportedReasoningEfforts' | 'defaultReasoningEffort'> | undefined {
  const modelSignature = toModelDetailSignature(modelName)

  for (const [detailsName, details] of detailsByName) {
    if (toModelDetailSignature(detailsName) === modelSignature) {
      return details
    }
  }

  return undefined
}

function toModelDetailSignature(value: string): string {
  return value
    .replace(/^\[[^\]]+\]\s*/, '')
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length > 0 &&
        !['fast', 'high', 'low', 'max', 'medium', 'mode', 'off', 'thinking', 'verbose'].includes(
          token,
        ),
    )
    .sort()
    .join('|')
}

function parseFactoryModels(value: unknown): LiveSessionModel[] {
  if (!isRecord(value) || !Array.isArray(value.customModels)) {
    return []
  }

  return value.customModels.flatMap((model) => {
    if (!isRecord(model)) {
      return []
    }

    const id = toNonEmptyString(model.id)
    const name = toNonEmptyString(model.displayName)

    if (!id || !name) {
      return []
    }

    return [
      {
        id,
        name,
        provider: toOptionalString(model.provider),
        maxContextLimit: toOptionalNumber(model.maxContextLimit),
        ...parseReasoningMetadata(model),
      },
    ]
  })
}

function parseReasoningMetadata(
  model: Record<string, unknown>,
): Pick<LiveSessionModel, 'supportedReasoningEfforts' | 'defaultReasoningEffort'> {
  const supportedReasoningEfforts = toOptionalStringArray(model.supportedReasoningEfforts)
  const defaultReasoningEffort = toNonEmptyString(model.defaultReasoningEffort)

  return {
    ...(supportedReasoningEfforts ? { supportedReasoningEfforts } : {}),
    ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
  }
}

function parseFactoryDefaultSettings(
  value: unknown,
): FoundationBootstrap['factoryDefaultSettings'] {
  if (!isRecord(value)) {
    return {}
  }

  const sessionDefaultSettings = isRecord(value.sessionDefaultSettings)
    ? value.sessionDefaultSettings
    : null
  const model = sessionDefaultSettings ? toNonEmptyString(sessionDefaultSettings.model) : undefined
  const interactionMode = sessionDefaultSettings
    ? toNonEmptyString(sessionDefaultSettings.interactionMode)
    : undefined
  const reasoningEffort = sessionDefaultSettings
    ? toNonEmptyString(sessionDefaultSettings.reasoningEffort)
    : undefined
  const autonomyMode = sessionDefaultSettings
    ? toNonEmptyString(sessionDefaultSettings.autonomyMode)
    : undefined
  const autonomyLevel = sessionDefaultSettings
    ? toNonEmptyString(sessionDefaultSettings.autonomyLevel)
    : undefined
  const specModeModelId = sessionDefaultSettings
    ? toNonEmptyString(sessionDefaultSettings.specModeModelId)
    : undefined
  const specModeReasoningEffort = sessionDefaultSettings
    ? toNonEmptyString(sessionDefaultSettings.specModeReasoningEffort)
    : undefined
  const enabledToolIds = toOptionalStringArray(sessionDefaultSettings?.enabledToolIds)
  const disabledToolIds = toOptionalStringArray(sessionDefaultSettings?.disabledToolIds)
  const compactionTokenLimit = toOptionalNumber(value.compactionTokenLimit)

  return {
    ...(model ? { model } : {}),
    ...(interactionMode ? { interactionMode } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(autonomyMode ? { autonomyMode } : {}),
    ...(autonomyLevel ? { autonomyLevel } : {}),
    ...(specModeModelId ? { specModeModelId } : {}),
    ...(specModeReasoningEffort ? { specModeReasoningEffort } : {}),
    ...(enabledToolIds ? { enabledToolIds } : {}),
    ...(disabledToolIds ? { disabledToolIds } : {}),
    ...(typeof compactionTokenLimit === 'number' ? { compactionTokenLimit } : {}),
  }
}

export function parseDaemonDefaultSettingsBootstrap(
  value: unknown,
  fallbackBootstrap: Pick<
    FoundationBootstrap,
    'factoryModels' | 'factoryDefaultSettings'
  > = EMPTY_FACTORY_SETTINGS_BOOTSTRAP,
): Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'> {
  const parsed = protocol.daemon.DaemonGetDefaultSettingsResultSchema.parse(value)
  const rawCompactionThresholdCheckEnabled = isRecord(value)
    ? value.compactionThresholdCheckEnabled
    : undefined
  const daemonModels =
    parsed.availableModels?.map((model) => ({
      id: model.id,
      name: model.displayName,
      provider: model.modelProvider,
      ...(model.supportedReasoningEfforts.length > 0
        ? { supportedReasoningEfforts: [...model.supportedReasoningEfforts] }
        : {}),
      ...(model.defaultReasoningEffort
        ? { defaultReasoningEffort: model.defaultReasoningEffort }
        : {}),
    })) ?? []
  const models =
    daemonModels.length > 0
      ? mergeModelMetadata(daemonModels, fallbackBootstrap.factoryModels)
      : fallbackBootstrap.factoryModels

  return {
    factoryModels: models,
    factoryDefaultSettings: {
      ...(parsed.modelId ? { model: parsed.modelId } : {}),
      ...(parsed.interactionMode ? { interactionMode: parsed.interactionMode } : {}),
      ...(parsed.autonomyMode ? { autonomyMode: parsed.autonomyMode } : {}),
      ...(parsed.autonomyLevel ? { autonomyLevel: parsed.autonomyLevel } : {}),
      ...(parsed.reasoningEffort ? { reasoningEffort: parsed.reasoningEffort } : {}),
      ...(parsed.specModeModelId ? { specModeModelId: parsed.specModeModelId } : {}),
      ...(parsed.specModeReasoningEffort
        ? { specModeReasoningEffort: parsed.specModeReasoningEffort }
        : {}),
      ...(typeof parsed.compactionTokenLimit === 'number'
        ? { compactionTokenLimit: parsed.compactionTokenLimit }
        : {}),
      ...(parsed.compactionTokenLimitPerModel
        ? { compactionTokenLimitPerModel: { ...parsed.compactionTokenLimitPerModel } }
        : {}),
      ...(typeof parsed.compactionModel !== 'undefined'
        ? { compactionModel: parsed.compactionModel }
        : {}),
      ...(typeof rawCompactionThresholdCheckEnabled === 'boolean'
        ? { compactionThresholdCheckEnabled: rawCompactionThresholdCheckEnabled }
        : {}),
      ...(typeof parsed.runInWorktree === 'boolean' ? { runInWorktree: parsed.runInWorktree } : {}),
      ...(parsed.worktreeDirectory ? { worktreeDirectory: parsed.worktreeDirectory } : {}),
      ...(parsed.subagentModelSettings
        ? { subagentModelSettings: parsed.subagentModelSettings }
        : {}),
      ...(parsed.missionSettings ? { missionSettings: parsed.missionSettings } : {}),
      ...(parsed.missionOrchestratorModel
        ? { missionOrchestratorModel: parsed.missionOrchestratorModel }
        : {}),
      ...(parsed.missionOrchestratorReasoningEffort
        ? { missionOrchestratorReasoningEffort: parsed.missionOrchestratorReasoningEffort }
        : {}),
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function toOptionalString(value: unknown): string | null | undefined {
  const normalized = toNonEmptyString(value)
  return normalized === undefined ? undefined : normalized
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toOptionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? [...value]
    : undefined
}

function mergeSettingsBootstrapIntoCliBootstrap(
  settingsBootstrap: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>,
  cliBootstrap: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>,
): Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'> {
  const factoryModels = mergeModelMetadata(
    cliBootstrap.factoryModels,
    settingsBootstrap.factoryModels,
  )
  const settingsModel = settingsBootstrap.factoryDefaultSettings.model
  const settingsModelExists =
    typeof settingsModel === 'string' && factoryModels.some((model) => model.id === settingsModel)

  return {
    factoryModels,
    factoryDefaultSettings: {
      ...cliBootstrap.factoryDefaultSettings,
      ...(settingsModelExists ? { model: settingsModel } : {}),
      ...(settingsModelExists &&
      typeof settingsBootstrap.factoryDefaultSettings.interactionMode === 'string'
        ? {
            interactionMode: settingsBootstrap.factoryDefaultSettings.interactionMode,
          }
        : {}),
      ...(typeof settingsBootstrap.factoryDefaultSettings.reasoningEffort === 'string'
        ? {
            reasoningEffort: settingsBootstrap.factoryDefaultSettings.reasoningEffort,
          }
        : {}),
      ...(typeof settingsBootstrap.factoryDefaultSettings.autonomyMode === 'string'
        ? {
            autonomyMode: settingsBootstrap.factoryDefaultSettings.autonomyMode,
          }
        : {}),
      ...(typeof settingsBootstrap.factoryDefaultSettings.autonomyLevel === 'string'
        ? {
            autonomyLevel: settingsBootstrap.factoryDefaultSettings.autonomyLevel,
          }
        : {}),
      ...(typeof settingsBootstrap.factoryDefaultSettings.specModeModelId === 'string'
        ? {
            specModeModelId: settingsBootstrap.factoryDefaultSettings.specModeModelId,
          }
        : {}),
      ...(typeof settingsBootstrap.factoryDefaultSettings.specModeReasoningEffort === 'string'
        ? {
            specModeReasoningEffort:
              settingsBootstrap.factoryDefaultSettings.specModeReasoningEffort,
          }
        : {}),
      ...(Array.isArray(settingsBootstrap.factoryDefaultSettings.enabledToolIds)
        ? {
            enabledToolIds: [...settingsBootstrap.factoryDefaultSettings.enabledToolIds],
          }
        : {}),
      ...(Array.isArray(settingsBootstrap.factoryDefaultSettings.disabledToolIds)
        ? {
            disabledToolIds: [...settingsBootstrap.factoryDefaultSettings.disabledToolIds],
          }
        : {}),
      ...(typeof settingsBootstrap.factoryDefaultSettings.compactionTokenLimit === 'number'
        ? {
            compactionTokenLimit: settingsBootstrap.factoryDefaultSettings.compactionTokenLimit,
          }
        : {}),
    },
  }
}

function mergeModelMetadata(
  primaryModels: LiveSessionModel[],
  fallbackModels: LiveSessionModel[],
): LiveSessionModel[] {
  const fallbackModelsById = new Map(fallbackModels.map((model) => [model.id, model] as const))

  return primaryModels.map((model) => {
    const fallbackModel = fallbackModelsById.get(model.id)

    return {
      ...model,
      ...(typeof fallbackModel?.maxContextLimit === 'number'
        ? { maxContextLimit: fallbackModel.maxContextLimit }
        : {}),
      ...(fallbackModel?.supportedReasoningEfforts
        ? { supportedReasoningEfforts: [...fallbackModel.supportedReasoningEfforts] }
        : {}),
      ...(fallbackModel?.defaultReasoningEffort
        ? { defaultReasoningEffort: fallbackModel.defaultReasoningEffort }
        : {}),
    }
  })
}

function bootstrapChanged(
  previous: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>,
  next: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>,
): boolean {
  return (
    JSON.stringify(previous.factoryDefaultSettings) !==
      JSON.stringify(next.factoryDefaultSettings) ||
    JSON.stringify(previous.factoryModels) !== JSON.stringify(next.factoryModels)
  )
}

function isEmptyFoundationBootstrap(
  bootstrap: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>,
): boolean {
  return (
    bootstrap.factoryModels.length === 0 &&
    Object.keys(bootstrap.factoryDefaultSettings).length === 0
  )
}
