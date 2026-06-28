import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { PluginRegistry } from '../../app/PluginRegistry'
import { loadLocalPluginsFromRoot, PLUGIN_MANIFEST_FILE } from '../plugins/localPluginCatalog'

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'oxox-plugins-'))
  tempDirectories.push(directory)
  return directory
}

describe('loadLocalPluginsFromRoot', () => {
  it('loads valid manifests, resolves entry points, and registers capabilities', async () => {
    const pluginsRoot = await createTempDirectory()
    const pluginPath = join(pluginsRoot, 'plugin-example')
    const entryPointPath = join(pluginPath, 'dist', 'index.js')
    const registry = new PluginRegistry()

    await mkdir(join(pluginPath, 'dist'), { recursive: true })
    await writeFile(entryPointPath, 'export {}')
    await writeFile(
      join(pluginPath, PLUGIN_MANIFEST_FILE),
      JSON.stringify({
        id: 'plugin.example',
        displayName: 'Example Plugin',
        version: '1.0.0',
        entryPoint: './dist/index.js',
        capabilities: [
          {
            kind: 'session-action',
            name: 'summarize',
            displayName: 'Summarize Session',
          },
        ],
        sandbox: {
          kind: 'node-process',
          permissions: ['session:read'],
        },
      }),
    )

    const report = await loadLocalPluginsFromRoot({
      pluginRegistry: registry,
      pluginsRoot,
    })

    expect(report.issues).toEqual([])
    expect(report.loadedPlugins).toEqual([
      expect.objectContaining({
        manifest: expect.objectContaining({ id: 'plugin.example' }),
        source: expect.objectContaining({
          entryPointPath,
          manifestPath: join(pluginPath, PLUGIN_MANIFEST_FILE),
          pluginPath,
        }),
      }),
    ])
    expect(registry.resolveCapability('plugin.example:summarize')).toEqual(
      expect.objectContaining({ pluginId: 'plugin.example' }),
    )
  })

  it('reports invalid manifests without registering unsafe plugins', async () => {
    const pluginsRoot = await createTempDirectory()
    const validPluginPath = join(pluginsRoot, 'plugin-valid')
    const invalidPluginPath = join(pluginsRoot, 'plugin-invalid')
    const registry = new PluginRegistry()

    await mkdir(join(validPluginPath, 'dist'), { recursive: true })
    await writeFile(join(validPluginPath, 'dist', 'index.js'), 'export {}')
    await writeFile(
      join(validPluginPath, PLUGIN_MANIFEST_FILE),
      JSON.stringify({
        id: 'plugin.valid',
        displayName: 'Valid Plugin',
        version: '1.0.0',
        entryPoint: './dist/index.js',
        capabilities: [
          {
            kind: 'app-action',
            name: 'open-dashboard',
            displayName: 'Open Dashboard',
          },
        ],
        sandbox: {
          kind: 'node-process',
          permissions: ['app:read'],
        },
      }),
    )

    await mkdir(invalidPluginPath, { recursive: true })
    await writeFile(
      join(invalidPluginPath, PLUGIN_MANIFEST_FILE),
      JSON.stringify({
        id: 'plugin.invalid',
        displayName: 'Invalid Plugin',
        version: '1.0.0',
        entryPoint: '../outside.js',
        capabilities: [],
        sandbox: {
          kind: 'node-process',
          permissions: [],
        },
      }),
    )

    const report = await loadLocalPluginsFromRoot({
      pluginRegistry: registry,
      pluginsRoot,
    })

    expect(report.loadedPlugins).toHaveLength(1)
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: 'entry-point-outside-plugin-root',
        pluginPath: invalidPluginPath,
      }),
    ])
    expect(registry.has('plugin.valid')).toBe(true)
    expect(registry.has('plugin.invalid')).toBe(false)
  })

  it('rejects manifests that declare unknown sandbox permissions', async () => {
    const pluginsRoot = await createTempDirectory()
    const pluginPath = join(pluginsRoot, 'plugin-invalid-permissions')
    const registry = new PluginRegistry()

    await mkdir(join(pluginPath, 'dist'), { recursive: true })
    await writeFile(join(pluginPath, 'dist', 'index.js'), 'export {}')
    await writeFile(
      join(pluginPath, PLUGIN_MANIFEST_FILE),
      JSON.stringify({
        id: 'plugin.invalid-permissions',
        displayName: 'Invalid Permissions Plugin',
        version: '1.0.0',
        entryPoint: './dist/index.js',
        capabilities: [
          {
            kind: 'app-action',
            name: 'open-dashboard',
            displayName: 'Open Dashboard',
          },
        ],
        sandbox: {
          kind: 'node-process',
          permissions: ['app:write'],
        },
      }),
    )

    const report = await loadLocalPluginsFromRoot({
      pluginRegistry: registry,
      pluginsRoot,
    })

    expect(report.loadedPlugins).toEqual([])
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: 'manifest-invalid',
        pluginPath,
      }),
    ])
    expect(registry.has('plugin.invalid-permissions')).toBe(false)
  })
})
