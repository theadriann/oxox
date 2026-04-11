import { describe, expect, it } from 'vitest'

import type { LocalPluginManifest } from '../../shared/plugins/contracts'
import { PluginRegistry } from '../app/PluginRegistry'

function createManifest(
  overrides: Partial<LocalPluginManifest> & Pick<LocalPluginManifest, 'id'>,
): LocalPluginManifest {
  return {
    id: overrides.id,
    displayName: overrides.displayName ?? 'Example Plugin',
    version: overrides.version ?? '1.0.0',
    entryPoint: overrides.entryPoint ?? './index.js',
    capabilities: overrides.capabilities ?? [
      {
        kind: 'session-action',
        name: 'summarize',
        displayName: 'Summarize Session',
      },
    ],
    sandbox: overrides.sandbox ?? {
      kind: 'node-process',
      permissions: ['session:read'],
    },
  }
}

describe('PluginRegistry', () => {
  it('registers local plugins and resolves their qualified capabilities', () => {
    const registry = new PluginRegistry()
    const manifest = createManifest({
      id: 'plugin.example',
      capabilities: [
        {
          kind: 'session-action',
          name: 'summarize',
          displayName: 'Summarize Session',
        },
        {
          kind: 'app-action',
          name: 'open-dashboard',
          displayName: 'Open Dashboard',
        },
      ],
    })

    const registeredPlugin = registry.register(manifest)

    expect(registeredPlugin.manifest).toEqual(manifest)
    expect(registry.list()).toHaveLength(1)
    expect(registry.resolveCapability('plugin.example:summarize')).toEqual(
      expect.objectContaining({
        qualifiedId: 'plugin.example:summarize',
        pluginId: 'plugin.example',
        capability: expect.objectContaining({ kind: 'session-action' }),
      }),
    )
    expect(registry.listCapabilities('app-action')).toEqual([
      expect.objectContaining({ qualifiedId: 'plugin.example:open-dashboard' }),
    ])
  })

  it('rejects duplicate plugin ids and duplicate capability names within a plugin', () => {
    const registry = new PluginRegistry()

    registry.register(createManifest({ id: 'plugin.example' }))

    expect(() => registry.register(createManifest({ id: 'plugin.example' }))).toThrow(
      'Plugin "plugin.example" has already been registered.',
    )
    expect(() =>
      registry.register(
        createManifest({
          id: 'plugin.duplicate-capabilities',
          capabilities: [
            {
              kind: 'session-action',
              name: 'summarize',
              displayName: 'Summarize Session',
            },
            {
              kind: 'session-action',
              name: 'summarize',
              displayName: 'Summarize Session Again',
            },
          ],
        }),
      ),
    ).toThrow('Plugin "plugin.duplicate-capabilities" declares duplicate capability "summarize".')
  })
})
