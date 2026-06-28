import type {
  LocalPluginManifest,
  PluginCapabilityKind,
  PluginCapabilityManifest,
} from '../../shared/plugins/contracts'

export interface RegisteredPluginCapability {
  qualifiedId: string
  pluginId: string
  capability: PluginCapabilityManifest
}

export interface RegisteredPluginSource {
  pluginPath: string
  manifestPath: string
  entryPointPath: string
}

export interface RegisteredPlugin {
  manifest: LocalPluginManifest
  capabilities: RegisteredPluginCapability[]
  source?: RegisteredPluginSource
}

export class PluginRegistry {
  private readonly plugins = new Map<string, RegisteredPlugin>()
  private readonly capabilities = new Map<string, RegisteredPluginCapability>()

  register(manifest: LocalPluginManifest, source?: RegisteredPluginSource): RegisteredPlugin {
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" has already been registered.`)
    }

    const localCapabilityNames = new Set<string>()
    const capabilities = manifest.capabilities.map((capability) => {
      if (localCapabilityNames.has(capability.name)) {
        throw new Error(
          `Plugin "${manifest.id}" declares duplicate capability "${capability.name}".`,
        )
      }

      localCapabilityNames.add(capability.name)

      return {
        qualifiedId: createQualifiedCapabilityId(manifest.id, capability.name),
        pluginId: manifest.id,
        capability,
      }
    })

    const registeredPlugin: RegisteredPlugin = {
      manifest,
      capabilities,
      source,
    }

    this.plugins.set(manifest.id, registeredPlugin)

    for (const capability of capabilities) {
      this.capabilities.set(capability.qualifiedId, capability)
    }

    return registeredPlugin
  }

  has(pluginId: string): boolean {
    return this.plugins.has(pluginId)
  }

  get(pluginId: string): RegisteredPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  list(): RegisteredPlugin[] {
    return Array.from(this.plugins.values())
  }

  listCapabilities(kind?: PluginCapabilityKind): RegisteredPluginCapability[] {
    const capabilities = Array.from(this.capabilities.values())

    return kind
      ? capabilities.filter((capability) => capability.capability.kind === kind)
      : capabilities
  }

  resolveCapability(qualifiedId: string): RegisteredPluginCapability | undefined {
    return this.capabilities.get(qualifiedId)
  }

  clear(): void {
    this.plugins.clear()
    this.capabilities.clear()
  }
}

function createQualifiedCapabilityId(pluginId: string, capabilityName: string): string {
  return `${pluginId}:${capabilityName}`
}
