import type {
  FoundationBootstrap,
  FoundationChangedPayload,
  LiveSessionModel,
  RuntimeInfo,
} from '../../../shared/ipc/contracts'
import {
  applyFoundationChanges,
  diffFoundationBootstraps,
  hasFoundationChanges,
} from '../../../shared/ipc/foundationUpdates'
import { batch, bindMethods, observable, readField, writeField } from './legend'

import type { StoreEventBus } from './storeEventBus'

const DEFAULT_FOUNDATION_ERROR = 'Unable to load session data.'

export const PLACEHOLDER_FOUNDATION: FoundationBootstrap = {
  database: {
    exists: false,
    journalMode: 'wal',
    path: '',
    tableNames: [],
  },
  droidCli: {
    available: true,
    path: null,
    version: null,
    searchedLocations: [],
    error: null,
  },
  daemon: {
    status: 'disconnected',
    connectedPort: null,
    lastError: null,
    lastConnectedAt: null,
    lastSyncAt: null,
    nextRetryDelayMs: null,
  },
  projects: [],
  sessions: [],
  syncMetadata: [],
  factoryModels: [],
  factoryDefaultSettings: {},
}

export interface FoundationStoreBridge {
  getBootstrap?: () => Promise<FoundationBootstrap>
  getRuntimeInfo?: () => Promise<RuntimeInfo>
}

export class FoundationStore {
  readonly stateNode = observable({
    foundation: PLACEHOLDER_FOUNDATION as FoundationBootstrap,
    foundationLoadError: null as string | null,
    hasLoadedFoundation: false,
  })

  private readonly bus: StoreEventBus
  private readonly bridge: FoundationStoreBridge
  private runtimeInitPromise: Promise<void> | null = null

  constructor(bus: StoreEventBus, bridge: FoundationStoreBridge = {}) {
    this.bus = bus
    this.bridge = bridge
    bindMethods(this)
  }

  get foundation(): FoundationBootstrap {
    return readField(this.stateNode, 'foundation')
  }

  set foundation(value: FoundationBootstrap) {
    writeField(this.stateNode, 'foundation', value)
  }

  get foundationLoadError(): string | null {
    return readField(this.stateNode, 'foundationLoadError')
  }

  set foundationLoadError(value: string | null) {
    writeField(this.stateNode, 'foundationLoadError', value)
  }

  get hasLoadedFoundation(): boolean {
    return readField(this.stateNode, 'hasLoadedFoundation')
  }

  set hasLoadedFoundation(value: boolean) {
    writeField(this.stateNode, 'hasLoadedFoundation', value)
  }

  get isDroidMissing(): boolean {
    return this.hasLoadedFoundation && !this.foundation.droidCli.available
  }

  get isLoading(): boolean {
    return !this.hasLoadedFoundation && !this.foundationLoadError
  }

  get hasError(): boolean {
    return Boolean(this.foundationLoadError)
  }

  get factoryModels(): LiveSessionModel[] {
    return this.foundation.factoryModels
  }

  get factoryDefaultSettings(): FoundationBootstrap['factoryDefaultSettings'] {
    return this.foundation.factoryDefaultSettings
  }

  applyUpdate(payload: FoundationChangedPayload): void {
    if (!payload.changes || !hasFoundationChanges(payload.changes)) {
      return
    }

    if (!this.hasLoadedFoundation) {
      return
    }

    const nextFoundation = applyFoundationChanges(this.foundation, payload.changes)
    const shouldPreserveFoundationReference = isSessionOnlyFoundationChanges(payload.changes)

    if (!foundationChanged(this.foundation, nextFoundation)) {
      return
    }

    batch(() => {
      if (shouldPreserveFoundationReference) {
        this.foundation.sessions = nextFoundation.sessions
      } else {
        this.foundation = nextFoundation
      }
      this.foundationLoadError = null
    })

    if (payload.changes.sessions) {
      this.bus.emit('session-changes-apply', {
        changes: payload.changes.sessions,
      })
    }

    this.bus.emit('foundation-hydrate', { bootstrap: nextFoundation })
  }

  async refresh(): Promise<void> {
    const getBootstrap = this.resolveGetBootstrap()

    if (!getBootstrap) {
      batch(() => {
        this.foundation = PLACEHOLDER_FOUNDATION
        this.foundationLoadError = DEFAULT_FOUNDATION_ERROR
        this.hasLoadedFoundation = false
      })
      this.bus.emit('sessions-hydrate', { sessions: PLACEHOLDER_FOUNDATION.sessions })
      this.bus.emit('foundation-hydrate', { bootstrap: PLACEHOLDER_FOUNDATION })
      return
    }

    try {
      const bootstrap = await getBootstrap()
      const shouldHydrate =
        !this.hasLoadedFoundation ||
        this.foundationLoadError !== null ||
        foundationChanged(this.foundation, bootstrap)

      batch(() => {
        if (shouldHydrate) {
          this.foundation = bootstrap
        }
        this.foundationLoadError = null
        this.hasLoadedFoundation = true
      })

      if (!shouldHydrate) {
        return
      }

      this.bus.emit('sessions-hydrate', { sessions: bootstrap.sessions })
      this.bus.emit('foundation-hydrate', { bootstrap })
    } catch (error) {
      batch(() => {
        this.foundation = PLACEHOLDER_FOUNDATION
        this.foundationLoadError = error instanceof Error ? error.message : DEFAULT_FOUNDATION_ERROR
        this.hasLoadedFoundation = false
      })
      this.bus.emit('sessions-hydrate', { sessions: PLACEHOLDER_FOUNDATION.sessions })
      this.bus.emit('foundation-hydrate', { bootstrap: PLACEHOLDER_FOUNDATION })
    }
  }

  async initRuntime(): Promise<void> {
    if (this.runtimeInitPromise) {
      await this.runtimeInitPromise
      return
    }

    const getRuntimeInfo = this.resolveGetRuntimeInfo()

    if (!getRuntimeInfo) {
      this.runtimeInitPromise = Promise.resolve()
      await this.runtimeInitPromise
      return
    }

    this.runtimeInitPromise = getRuntimeInfo()
      .then(() => undefined)
      .catch(() => undefined)

    await this.runtimeInitPromise
  }

  dispose(): void {
    this.runtimeInitPromise = null
  }

  private resolveGetBootstrap(): FoundationStoreBridge['getBootstrap'] {
    return this.bridge.getBootstrap
  }

  private resolveGetRuntimeInfo(): FoundationStoreBridge['getRuntimeInfo'] {
    return this.bridge.getRuntimeInfo
  }
}

function foundationChanged(
  previousFoundation: FoundationBootstrap,
  nextFoundation: FoundationBootstrap,
): boolean {
  return hasFoundationChanges(diffFoundationBootstraps(previousFoundation, nextFoundation))
}

function isSessionOnlyFoundationChanges(
  changes: NonNullable<FoundationChangedPayload['changes']>,
): boolean {
  return (
    Boolean(changes.sessions) &&
    !changes.database &&
    !changes.droidCli &&
    !changes.daemon &&
    !changes.projects &&
    !changes.syncMetadata &&
    !changes.factoryModels &&
    !changes.factoryDefaultSettings
  )
}
