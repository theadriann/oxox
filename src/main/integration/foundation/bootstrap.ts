import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
}

export interface FoundationBootstrapState {
  getSnapshot: () => Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>
  refreshFromDroidCli: () => Promise<void>
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
}: CreateFoundationBootstrapStateOptions): FoundationBootstrapState {
  let snapshot = readFactorySettingsBootstrap(settingsPath)

  return {
    getSnapshot: () => snapshot,
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

        if (!bootstrapChanged(snapshot, nextSnapshot)) {
          return
        }

        snapshot = nextSnapshot
        onChange?.()
      } catch {
        return
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
  const defaultModel = availableModels.find((model) => model.isDefault)?.id

  return {
    factoryModels: [...availableModels, ...customModels].map(
      ({ isDefault: _ignored, ...model }) => model,
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
      },
    ]
  })
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
  const compactionTokenLimit = toOptionalNumber(value.compactionTokenLimit)

  return {
    ...(model ? { model } : {}),
    ...(interactionMode ? { interactionMode } : {}),
    ...(typeof compactionTokenLimit === 'number' ? { compactionTokenLimit } : {}),
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

function mergeSettingsBootstrapIntoCliBootstrap(
  settingsBootstrap: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>,
  cliBootstrap: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>,
): Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'> {
  const settingsModelsById = new Map(
    settingsBootstrap.factoryModels.map((model) => [model.id, model] as const),
  )

  return {
    factoryModels: cliBootstrap.factoryModels.map((model) => {
      const settingsModel = settingsModelsById.get(model.id)

      return {
        ...model,
        ...(typeof settingsModel?.maxContextLimit === 'number'
          ? { maxContextLimit: settingsModel.maxContextLimit }
          : {}),
      }
    }),
    factoryDefaultSettings: {
      ...cliBootstrap.factoryDefaultSettings,
      ...(typeof settingsBootstrap.factoryDefaultSettings.compactionTokenLimit === 'number'
        ? {
            compactionTokenLimit: settingsBootstrap.factoryDefaultSettings.compactionTokenLimit,
          }
        : {}),
    },
  }
}

function bootstrapChanged(
  previous: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>,
  next: Pick<FoundationBootstrap, 'factoryModels' | 'factoryDefaultSettings'>,
): boolean {
  return (
    previous.factoryDefaultSettings.model !== next.factoryDefaultSettings.model ||
    previous.factoryDefaultSettings.interactionMode !==
      next.factoryDefaultSettings.interactionMode ||
    previous.factoryDefaultSettings.compactionTokenLimit !==
      next.factoryDefaultSettings.compactionTokenLimit ||
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
