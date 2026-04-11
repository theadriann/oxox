import type {
  PluginCapabilityInvokeResult,
  PluginSandboxPermission,
} from '../../shared/plugins/contracts'
import type { FoundationService } from '../integration/foundationService'
import type { PluginLoadReport } from '../integration/plugins/localPluginCatalog'
import {
  createLocalPluginHostManager,
  type LocalPluginHostManager,
} from '../integration/plugins/localPluginHost'

import { PluginRegistry } from './PluginRegistry'
import { ServiceRegistry } from './ServiceRegistry'

type Cleanup = (() => void) | undefined

const EMPTY_PLUGIN_LOAD_REPORT: PluginLoadReport = {
  loadedPlugins: [],
  issues: [],
}

export interface AppKernelOptions {
  userDataPath: string
  createFoundationService: (options: { userDataPath: string }) => FoundationService
  registerSecurityHeaders: () => void
  registerIpcHandlers: (service: FoundationService) => Cleanup
  installSystemIntegration: (service: FoundationService) => Cleanup
  loadLocalPlugins?: (options: {
    userDataPath: string
    pluginRegistry: PluginRegistry
  }) => Promise<PluginLoadReport>
  pluginHost?: LocalPluginHostManager
  serviceRegistry?: ServiceRegistry
}

export class AppKernel {
  private readonly serviceRegistry: ServiceRegistry
  private readonly pluginRegistry: PluginRegistry
  private readonly pluginHost: LocalPluginHostManager
  private readonly cleanupCallbacks: Array<() => void> = []
  private foundationService: FoundationService | null = null
  private isStopping = false
  private pluginLoadPromise: Promise<PluginLoadReport> | null = null
  private stopPromise: Promise<void> | null = null

  constructor(private readonly options: AppKernelOptions) {
    this.serviceRegistry = options.serviceRegistry ?? new ServiceRegistry()
    this.pluginRegistry = new PluginRegistry()
    this.pluginHost = options.pluginHost ?? createLocalPluginHostManager()
    this.serviceRegistry.register('plugins', this.pluginRegistry)
    this.serviceRegistry.register('pluginHost', this.pluginHost)
  }

  start(): FoundationService {
    if (this.foundationService) {
      return this.foundationService
    }

    const foundationService = this.options.createFoundationService({
      userDataPath: this.options.userDataPath,
    })

    this.serviceRegistry.register('foundation', foundationService)
    this.options.registerSecurityHeaders()
    this.registerCleanup(this.options.registerIpcHandlers(foundationService))
    this.registerCleanup(this.options.installSystemIntegration(foundationService))
    this.foundationService = foundationService

    return foundationService
  }

  getFoundationService(): FoundationService {
    if (!this.foundationService) {
      throw new Error('App kernel has not been started yet.')
    }

    return this.foundationService
  }

  getPluginRegistry(): PluginRegistry {
    return this.pluginRegistry
  }

  getPluginHost(): LocalPluginHostManager {
    return this.pluginHost
  }

  async invokePluginCapability(
    capabilityId: string,
    payload?: unknown,
  ): Promise<PluginCapabilityInvokeResult> {
    const capability = this.pluginRegistry.resolveCapability(capabilityId)

    if (!capability) {
      throw new Error(`Plugin capability "${capabilityId}" is not registered.`)
    }

    const plugin = this.pluginRegistry.get(capability.pluginId)

    if (!plugin) {
      throw new Error(`Plugin "${capability.pluginId}" is not registered.`)
    }

    assertCapabilityInvocationAllowed(plugin, capabilityId, capability.capability.kind, payload)
    return this.pluginHost.invokeCapability(capabilityId, payload)
  }

  async loadPlugins(): Promise<PluginLoadReport> {
    if (this.pluginLoadPromise) {
      return this.pluginLoadPromise
    }

    this.pluginLoadPromise = (
      this.options.loadLocalPlugins
        ? this.options.loadLocalPlugins({
            userDataPath: this.options.userDataPath,
            pluginRegistry: this.pluginRegistry,
          })
        : Promise.resolve(EMPTY_PLUGIN_LOAD_REPORT)
    ).then(async (report) => {
      if (this.isStopping) {
        return report
      }

      this.pluginHost.registerPlugins(report.loadedPlugins)
      await this.pluginHost.startAll()
      return report
    })

    return this.pluginLoadPromise
  }

  stop(): void {
    void this.stopAsync()
  }

  async stopAsync(): Promise<void> {
    if (this.stopPromise) {
      return this.stopPromise
    }

    this.isStopping = true
    this.stopPromise = (async () => {
      while (this.cleanupCallbacks.length > 0) {
        this.cleanupCallbacks.pop()?.()
      }

      this.foundationService?.close()
      await this.pluginHost.dispose()
      this.serviceRegistry.clear()
      this.foundationService = null
      this.pluginLoadPromise = null
    })()

    await this.stopPromise
  }

  private registerCleanup(cleanup: Cleanup): void {
    if (typeof cleanup === 'function') {
      this.cleanupCallbacks.push(cleanup)
    }
  }
}

function assertCapabilityInvocationAllowed(
  plugin: ReturnType<PluginRegistry['get']>,
  capabilityId: string,
  capabilityKind: 'app-action' | 'foundation-reader' | 'session-action',
  payload?: unknown,
): void {
  if (!plugin) {
    return
  }

  const requiredPermission = REQUIRED_PERMISSION_BY_CAPABILITY_KIND[capabilityKind]

  if (!plugin.manifest.sandbox.permissions.includes(requiredPermission)) {
    throw new Error(
      `Plugin "${plugin.manifest.id}" is not allowed to invoke "${capabilityId}"; missing permission "${requiredPermission}".`,
    )
  }

  if (capabilityKind === 'session-action' && !hasSessionIdPayload(payload)) {
    throw new Error(
      `Session-action capability "${capabilityId}" requires a payload with a sessionId.`,
    )
  }
}

function hasSessionIdPayload(payload: unknown): payload is { sessionId: string } {
  return (
    Boolean(payload) &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'sessionId' in payload &&
    typeof payload.sessionId === 'string' &&
    payload.sessionId.trim().length > 0
  )
}

const REQUIRED_PERMISSION_BY_CAPABILITY_KIND = {
  'app-action': 'app:read',
  'foundation-reader': 'foundation:read',
  'session-action': 'session:read',
} as const satisfies Record<
  'app-action' | 'foundation-reader' | 'session-action',
  PluginSandboxPermission
>
