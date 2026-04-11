import { access, readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

import type {
  LocalPluginManifest,
  PluginCapabilityKind,
  PluginSandboxPermission,
} from '../../../shared/plugins/contracts'
import type {
  PluginRegistry,
  RegisteredPlugin,
  RegisteredPluginSource,
} from '../../app/PluginRegistry'

export const PLUGIN_MANIFEST_FILE = 'oxox-plugin.json'

export interface PluginLoadIssue {
  code:
    | 'entry-point-missing'
    | 'entry-point-outside-plugin-root'
    | 'manifest-invalid'
    | 'manifest-invalid-json'
    | 'registry-error'
  message: string
  pluginPath: string
}

export interface PluginLoadReport {
  loadedPlugins: RegisteredPlugin[]
  issues: PluginLoadIssue[]
}

export interface LoadLocalPluginsFromRootOptions {
  pluginRegistry: PluginRegistry
  pluginsRoot: string
}

export async function loadLocalPluginsFromRoot({
  pluginRegistry,
  pluginsRoot,
}: LoadLocalPluginsFromRootOptions): Promise<PluginLoadReport> {
  let entries: Awaited<ReturnType<typeof readdir>>

  try {
    entries = await readdir(pluginsRoot, { withFileTypes: true })
  } catch (error) {
    if (isMissingPathError(error)) {
      return createEmptyPluginLoadReport()
    }

    throw error
  }

  const loadedPlugins: RegisteredPlugin[] = []
  const issues: PluginLoadIssue[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const pluginPath = join(pluginsRoot, entry.name)
    const manifestPath = join(pluginPath, PLUGIN_MANIFEST_FILE)

    let manifestText: string

    try {
      manifestText = await readFile(manifestPath, 'utf8')
    } catch {
      issues.push({
        code: 'manifest-invalid',
        message: `Plugin manifest missing at ${manifestPath}.`,
        pluginPath,
      })
      continue
    }

    let manifestValue: unknown

    try {
      manifestValue = JSON.parse(manifestText)
    } catch {
      issues.push({
        code: 'manifest-invalid-json',
        message: `Plugin manifest at ${manifestPath} is not valid JSON.`,
        pluginPath,
      })
      continue
    }

    const manifest = parseLocalPluginManifest(manifestValue)

    if (!manifest) {
      issues.push({
        code: 'manifest-invalid',
        message: `Plugin manifest at ${manifestPath} has an invalid shape.`,
        pluginPath,
      })
      continue
    }

    const entryPointPath = resolve(pluginPath, manifest.entryPoint)

    if (!isPathInsideDirectory(pluginPath, entryPointPath)) {
      issues.push({
        code: 'entry-point-outside-plugin-root',
        message: `Plugin "${manifest.id}" entry point must stay within its plugin directory.`,
        pluginPath,
      })
      continue
    }

    try {
      await access(entryPointPath)
    } catch {
      issues.push({
        code: 'entry-point-missing',
        message: `Plugin "${manifest.id}" entry point was not found at ${entryPointPath}.`,
        pluginPath,
      })
      continue
    }

    const source: RegisteredPluginSource = {
      pluginPath,
      manifestPath,
      entryPointPath,
    }

    try {
      loadedPlugins.push(pluginRegistry.register(manifest, source))
    } catch (error) {
      issues.push({
        code: 'registry-error',
        message: error instanceof Error ? error.message : 'Unknown plugin registry failure.',
        pluginPath,
      })
    }
  }

  return {
    loadedPlugins,
    issues,
  }
}

function createEmptyPluginLoadReport(): PluginLoadReport {
  return {
    loadedPlugins: [],
    issues: [],
  }
}

function parseLocalPluginManifest(value: unknown): LocalPluginManifest | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.version !== 'string' ||
    typeof value.entryPoint !== 'string' ||
    !Array.isArray(value.capabilities) ||
    !isLocalPluginSandbox(value.sandbox)
  ) {
    return null
  }

  const capabilities = value.capabilities
    .map(parsePluginCapability)
    .filter(
      (capability): capability is LocalPluginManifest['capabilities'][number] =>
        capability !== null,
    )

  if (capabilities.length !== value.capabilities.length) {
    return null
  }

  return {
    id: value.id,
    displayName: value.displayName,
    version: value.version,
    entryPoint: value.entryPoint,
    capabilities,
    sandbox: value.sandbox,
  }
}

function parsePluginCapability(value: unknown): LocalPluginManifest['capabilities'][number] | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    !isPluginCapabilityKind(value.kind) ||
    typeof value.name !== 'string' ||
    typeof value.displayName !== 'string'
  ) {
    return null
  }

  return {
    kind: value.kind,
    name: value.name,
    displayName: value.displayName,
  }
}

function isLocalPluginSandbox(value: unknown): value is LocalPluginManifest['sandbox'] {
  return (
    isRecord(value) &&
    value.kind === 'node-process' &&
    Array.isArray(value.permissions) &&
    value.permissions.every(isPluginSandboxPermission)
  )
}

function isPluginCapabilityKind(value: unknown): value is PluginCapabilityKind {
  return value === 'app-action' || value === 'foundation-reader' || value === 'session-action'
}

function isPluginSandboxPermission(value: unknown): value is PluginSandboxPermission {
  return value === 'app:read' || value === 'foundation:read' || value === 'session:read'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isPathInsideDirectory(directoryPath: string, candidatePath: string): boolean {
  const relativePath = relative(directoryPath, candidatePath)

  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('/'))
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
