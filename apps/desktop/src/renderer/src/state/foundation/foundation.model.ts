import { batch, type Observable } from '@legendapp/state'
import type {
  FoundationBootstrap,
  FoundationChangedPayload,
  LiveSessionModel,
  RuntimeInfo,
  SessionReindexReport,
} from '../../../../shared/ipc/contracts'
import {
  applyFoundationChanges,
  diffFoundationBootstraps,
  hasFoundationChanges,
} from '../../../../shared/ipc/foundationUpdates'

import type { StoreEventBus } from '../events/store-event-bus'
import {
  createFoundationState$,
  type FoundationState,
  PLACEHOLDER_FOUNDATION,
} from './foundation.state'

const DEFAULT_FOUNDATION_ERROR = 'Unable to load session data.'

export { PLACEHOLDER_FOUNDATION } from './foundation.state'

export interface FoundationStoreBridge {
  getBootstrap?: () => Promise<FoundationBootstrap>
  getRuntimeInfo?: () => Promise<RuntimeInfo>
  reindexSessions?: () => Promise<SessionReindexReport>
}

export class FoundationStore {
  readonly state$: Observable<FoundationState> = createFoundationState$()

  private readonly bus: StoreEventBus
  private readonly bridge: FoundationStoreBridge
  private runtimeInitPromise: Promise<void> | null = null

  constructor(bus: StoreEventBus, bridge: FoundationStoreBridge = {}) {
    this.bus = bus
    this.bridge = bridge
  }

  get foundation(): FoundationBootstrap {
    return this.state$.foundation.get()
  }

  set foundation(value: FoundationBootstrap) {
    this.state$.foundation.set(value)
  }

  get foundationLoadError(): string | null {
    return this.state$.foundationLoadError.get()
  }

  set foundationLoadError(value: string | null) {
    this.state$.foundationLoadError.set(value)
  }

  get hasLoadedFoundation(): boolean {
    return this.state$.hasLoadedFoundation.get()
  }

  set hasLoadedFoundation(value: boolean) {
    this.state$.hasLoadedFoundation.set(value)
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

  get isReindexingSessions(): boolean {
    return this.state$.isReindexingSessions.get()
  }

  set isReindexingSessions(value: boolean) {
    this.state$.isReindexingSessions.set(value)
  }

  get sessionReindexError(): string | null {
    return this.state$.sessionReindexError.get()
  }

  set sessionReindexError(value: string | null) {
    this.state$.sessionReindexError.set(value)
  }

  get factoryModels(): LiveSessionModel[] {
    return this.foundation.factoryModels
  }

  get factoryDefaultSettings(): FoundationBootstrap['factoryDefaultSettings'] {
    return this.foundation.factoryDefaultSettings
  }

  applyUpdate = (payload: FoundationChangedPayload): void => {
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
        this.state$.foundation.sessions.set(nextFoundation.sessions)
      } else {
        this.foundation = nextFoundation
      }
      if (payload.changes?.sessionReindexProgress) {
        const phase = payload.changes.sessionReindexProgress.phase
        this.isReindexingSessions =
          phase === 'preparing' || phase === 'indexing' || phase === 'cleanup'
        this.sessionReindexError = payload.changes.sessionReindexProgress.error
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

  refresh = async (): Promise<void> => {
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

  reindexSessions = async (): Promise<SessionReindexReport | null> => {
    const reindexSessions = this.bridge.reindexSessions

    if (!reindexSessions || this.isReindexingSessions) {
      return null
    }

    batch(() => {
      this.isReindexingSessions = true
      this.sessionReindexError = null
    })

    try {
      const report = await reindexSessions()
      await this.refresh()
      return report
    } catch (error) {
      this.sessionReindexError =
        error instanceof Error ? error.message : 'Unable to reindex sessions.'
      return null
    } finally {
      this.isReindexingSessions = false
    }
  }

  initRuntime = async (): Promise<void> => {
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

  dispose = (): void => {
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
    !changes.sessionFolders &&
    !changes.sessionFolderAssignments &&
    !changes.factoryModels &&
    !changes.factoryDefaultSettings
  )
}
