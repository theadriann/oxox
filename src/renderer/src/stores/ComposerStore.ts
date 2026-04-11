import { type IReactionDisposer, makeAutoObservable, reaction, runInAction } from 'mobx'

import type { LiveSessionModel } from '../../../shared/ipc/contracts'
import type { PlatformApiClient } from '../platform/apiClient'
import { createLocalStoragePort, type PersistencePort } from '../platform/persistence'
import {
  type ComposerContextUsageState,
  deriveComposerContextUsage,
  getLatestTokenUsageEvent,
} from './composerContextUsage'
import {
  type ComposerPreferences,
  deriveComposerPreferences,
  deriveDefaultComposerPreferences,
  type FactoryDefaults,
  persistComposerPreferences,
  readPersistedComposerPreferences,
  SESSION_COMPOSER_STORAGE_KEY,
} from './composerPreferences'
import { type ComposerFeedback, FeedbackStore } from './FeedbackStore'
import type { FoundationStore } from './FoundationStore'
import type { LiveSessionStore } from './LiveSessionStore'
import { toSessionRecord } from './liveSessionRecord'
import { PermissionResolutionStore } from './PermissionResolutionStore'
import { RenameWorkflowStore } from './RenameWorkflowStore'
import { RewindWorkflowStore } from './RewindWorkflowStore'
import type { SessionStore } from './SessionStore'

export { type ComposerFeedback, type ComposerPreferences, SESSION_COMPOSER_STORAGE_KEY }

export type ComposerStatus =
  | 'idle'
  | 'active'
  | 'waiting'
  | 'completed'
  | 'reconnecting'
  | 'orphaned'
  | 'error'

export type ComposerSessionGateway = PlatformApiClient['session']

export class ComposerStore {
  draft = ''
  error: string | null = null
  preferencesBySessionId: Record<string, ComposerPreferences> = {}
  pendingDraftWorkspacePath: string | null = null
  pendingDraftPreferences: ComposerPreferences | null = null
  sendingSessionId: string | null = null
  isPendingDraftSubmitting = false
  attachingSessionId: string | null = null
  interruptingSessionId: string | null = null

  readonly feedbackStore: FeedbackStore
  readonly renameWorkflow: RenameWorkflowStore
  readonly rewindWorkflow: RewindWorkflowStore
  readonly permissionResolution: PermissionResolutionStore

  private readonly sessionStore: SessionStore
  private readonly liveSessionStore: LiveSessionStore
  private readonly foundationStore: FoundationStore
  private readonly sessionApi: ComposerSessionGateway
  private readonly persistence: PersistencePort
  private preferencesReactionDisposer: IReactionDisposer | null = null
  private lastSessionId: string | null

  constructor(
    sessionStore: SessionStore,
    liveSessionStore: LiveSessionStore,
    foundationStore: FoundationStore,
    sessionApi: ComposerSessionGateway,
    persistence: PersistencePort = createLocalStoragePort(),
  ) {
    this.sessionStore = sessionStore
    this.liveSessionStore = liveSessionStore
    this.foundationStore = foundationStore
    this.sessionApi = sessionApi
    this.persistence = persistence
    this.lastSessionId = sessionStore.selectedSessionId || null

    this.feedbackStore = new FeedbackStore()

    this.renameWorkflow = new RenameWorkflowStore(
      () => this.sessionStore.selectedSessionId || null,
      () =>
        this.sessionStore.selectedSession ??
        (this.liveSessionStore.selectedSnapshot as { title: string } | null),
      this.sessionApi,
      async (_sessionId, newTitle) => {
        await this.foundationStore.refresh()

        const selectedSnapshot = this.liveSessionStore.selectedSnapshot
        if (selectedSnapshot) {
          this.liveSessionStore.upsertSnapshot({ ...selectedSnapshot, title: newTitle })
        }

        this.feedbackStore.showFeedback(`Renamed session to \u201c${newTitle}\u201d.`)
      },
    )

    this.rewindWorkflow = new RewindWorkflowStore(
      () => this.sessionStore.selectedSessionId || null,
      () => ({ title: this.sessionStore.selectedSession?.title ?? '' }),
      this.sessionApi,
      async (result) => {
        await this.foundationStore.refresh()
        this.liveSessionStore.upsertSnapshot(result.snapshot)
        this.sessionStore.selectSession(result.snapshot.sessionId)
        this.feedbackStore.showFeedback(`Rewound to \u201c${result.snapshot.title}\u201d.`)
      },
    )

    this.permissionResolution = new PermissionResolutionStore(
      () => this.liveSessionStore.selectedSnapshot,
      this.sessionApi,
      async (sessionId) => {
        await this.liveSessionStore.refreshSnapshot(sessionId)
      },
    )

    makeAutoObservable(
      this,
      {
        sessionStore: false,
        liveSessionStore: false,
        foundationStore: false,
        sessionApi: false,
        persistence: false,
        preferencesReactionDisposer: false,
        lastSessionId: false,
        feedbackStore: false,
        renameWorkflow: false,
        rewindWorkflow: false,
        permissionResolution: false,
      },
      { autoBind: true },
    )

    this.hydrateFromLocalStorage()
    this.preferencesReactionDisposer = reaction(
      () => this.preferencesBySessionId,
      (preferences) => {
        this.persistPreferences(preferences)
      },
    )
  }

  // --- Draft + session lifecycle (stays on ComposerStore) ---

  get selectedPreferences(): ComposerPreferences {
    if (!this.sessionStore.selectedSessionId && this.pendingDraftPreferences) {
      return this.pendingDraftPreferences
    }

    return deriveComposerPreferences(
      this.sessionStore.selectedSessionId || null,
      this.liveSessionStore.selectedSnapshot,
      this.preferencesBySessionId,
      this.foundationStore.factoryDefaultSettings as FactoryDefaults,
      this.foundationStore.factoryModels,
    )
  }

  get selectedStatus(): ComposerStatus {
    const selectedSnapshot = this.liveSessionStore.selectedSnapshot

    if (selectedSnapshot) {
      return toComposerStatus(selectedSnapshot.status)
    }

    const selectedSession = this.sessionStore.selectedSession

    return selectedSession?.status === 'completed'
      ? 'completed'
      : toComposerStatus(selectedSession?.status)
  }

  get selectedAvailableModels(): LiveSessionModel[] {
    const selectedSnapshot = this.liveSessionStore.selectedSnapshot

    return selectedSnapshot && selectedSnapshot.availableModels.length > 0
      ? selectedSnapshot.availableModels
      : this.foundationStore.factoryModels
  }

  get detachedComposerError(): string | null {
    if (this.liveSessionStore.selectedSnapshot) {
      return null
    }

    const isDetachedSurfaceActive =
      this.sessionStore.isDraftSelectionActive || Boolean(this.sessionStore.selectedSessionId)

    if (!isDetachedSurfaceActive || this.selectedAvailableModels.length > 0) {
      return null
    }

    return 'No detached models are available from the Droid CLI.'
  }

  get selectedComposerContextUsage(): ComposerContextUsageState | null {
    const snapshot = this.liveSessionStore.selectedSnapshot

    if (!snapshot) {
      return null
    }

    const latestTokenUsageEvent = getLatestTokenUsageEvent(snapshot)
    const activeModelId = snapshot.settings.modelId
    const snapshotModel = snapshot.availableModels.find((model) => model.id === activeModelId)
    const foundationModel = this.foundationStore.factoryModels.find(
      (model) => model.id === activeModelId,
    )
    const compactionTokenLimit = this.foundationStore.factoryDefaultSettings.compactionTokenLimit

    return deriveComposerContextUsage({
      compactionTokenLimit:
        typeof compactionTokenLimit === 'number' && Number.isFinite(compactionTokenLimit)
          ? compactionTokenLimit
          : undefined,
      modelMaxContextLimit: snapshotModel?.maxContextLimit ?? foundationModel?.maxContextLimit,
      cumulativeTokenUsage: latestTokenUsageEvent?.tokenUsage ?? null,
      lastCallTokenUsage: latestTokenUsageEvent?.lastCallTokenUsage ?? null,
    })
  }

  get hasPendingDraft(): boolean {
    return Boolean(this.pendingDraftWorkspacePath)
  }

  get canAttachSelected(): boolean {
    const selectedSessionId = this.sessionStore.selectedSessionId
    const selectedSession = this.sessionStore.selectedSession
    const selectedSnapshot = this.liveSessionStore.selectedSnapshot

    return Boolean(
      selectedSessionId &&
        selectedSession?.status !== 'completed' &&
        (!selectedSnapshot || this.selectedNeedsReconnect),
    )
  }

  get isAttachingSelected(): boolean {
    return this.sessionStore.selectedSessionId === this.attachingSessionId
  }

  get isSendingSelected(): boolean {
    return this.sessionStore.selectedSessionId === this.sendingSessionId
  }

  get isInterruptingSelected(): boolean {
    return this.sessionStore.selectedSessionId === this.interruptingSessionId
  }

  get selectedNeedsReconnect(): boolean {
    return this.liveSessionStore.selectedNeedsReconnect
  }

  setDraft(value: string): void {
    this.draft = value
  }

  setError(value: string | null): void {
    this.error = value
  }

  updatePreferences(sessionId: string, partial: Partial<ComposerPreferences>): void {
    if (!sessionId) {
      return
    }

    this.preferencesBySessionId = {
      ...this.preferencesBySessionId,
      [sessionId]: {
        ...deriveComposerPreferences(
          sessionId,
          this.liveSessionStore.snapshotsById.get(sessionId) ?? null,
          this.preferencesBySessionId,
          this.foundationStore.factoryDefaultSettings as FactoryDefaults,
          this.foundationStore.factoryModels,
        ),
        ...partial,
      },
    }
  }

  beginPendingDraft(): void {
    this.beginPendingDraftForWorkspace(null)
  }

  beginPendingDraftForWorkspace(workspacePath: string | null): void {
    this.pendingDraftWorkspacePath = workspacePath?.trim() || null
    this.pendingDraftPreferences = deriveDefaultComposerPreferences(
      this.foundationStore.factoryDefaultSettings as FactoryDefaults,
      this.foundationStore.factoryModels,
    )
    this.error = null
  }

  updatePendingDraftPreferences(partial: Partial<ComposerPreferences>): void {
    this.pendingDraftPreferences = {
      ...(this.pendingDraftPreferences ??
        deriveDefaultComposerPreferences(
          this.foundationStore.factoryDefaultSettings as FactoryDefaults,
          this.foundationStore.factoryModels,
        )),
      ...partial,
    }
  }

  clearPendingDraft(): void {
    this.pendingDraftWorkspacePath = null
    this.pendingDraftPreferences = null
  }

  async submit(payload: {
    text: string
    modelId: string
    interactionMode: string
    autonomyLevel: string
  }): Promise<void> {
    const { addUserMessage, attach, create, updateSettings } = this.sessionApi

    const targetSessionId =
      this.liveSessionStore.selectedSnapshot?.sessionId ?? this.sessionStore.selectedSessionId

    if (!targetSessionId && this.pendingDraftWorkspacePath) {
      if (!create || !addUserMessage || !updateSettings) {
        return
      }

      runInAction(() => {
        this.isPendingDraftSubmitting = true
        this.error = null
      })

      try {
        const liveSession = await create(this.pendingDraftWorkspacePath)

        await updateSettings(liveSession.sessionId, {
          modelId: payload.modelId,
          interactionMode: payload.interactionMode,
          autonomyLevel: payload.autonomyLevel,
        })
        await addUserMessage(liveSession.sessionId, payload.text)

        runInAction(() => {
          this.pendingDraftWorkspacePath = null
          this.pendingDraftPreferences = null
          this.draft = ''
        })

        this.liveSessionStore.upsertSnapshot(liveSession)
        this.sessionStore.selectSession(liveSession.sessionId)
        this.updatePreferences(liveSession.sessionId, {
          modelId: payload.modelId,
          interactionMode: payload.interactionMode,
          autonomyLevel: payload.autonomyLevel,
        })
        await this.liveSessionStore.refreshSnapshot(liveSession.sessionId)
      } catch (error) {
        runInAction(() => {
          this.error = error instanceof Error ? error.message : 'Unable to send the message.'
        })
      } finally {
        runInAction(() => {
          this.isPendingDraftSubmitting = false
        })
      }

      return
    }

    if (!targetSessionId || (!this.liveSessionStore.selectedSnapshot && !this.canAttachSelected)) {
      return
    }

    if (
      !addUserMessage ||
      !updateSettings ||
      (!this.liveSessionStore.selectedSnapshot && !attach)
    ) {
      return
    }

    runInAction(() => {
      this.sendingSessionId = targetSessionId
      this.error = null
    })

    try {
      let liveSession = this.liveSessionStore.selectedSnapshot

      if (!liveSession) {
        liveSession = await attach(targetSessionId)
        this.liveSessionStore.upsertSnapshot(liveSession)
      }

      await updateSettings(liveSession.sessionId, {
        modelId: payload.modelId,
        interactionMode: payload.interactionMode,
        autonomyLevel: payload.autonomyLevel,
      })
      await addUserMessage(liveSession.sessionId, payload.text)

      runInAction(() => {
        this.draft = ''
      })

      this.updatePreferences(liveSession.sessionId, {
        modelId: payload.modelId,
        interactionMode: payload.interactionMode,
        autonomyLevel: payload.autonomyLevel,
      })

      await this.liveSessionStore.refreshSnapshot(liveSession.sessionId)
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Unable to send the message.'
      })
    } finally {
      runInAction(() => {
        this.sendingSessionId = null
      })
    }
  }

  async attachSelected(): Promise<boolean> {
    const selectedSessionId = this.sessionStore.selectedSessionId

    if (!selectedSessionId || !this.sessionApi.attach) {
      return false
    }

    runInAction(() => {
      this.attachingSessionId = selectedSessionId
      this.error = null
    })

    try {
      const snapshot = await this.sessionApi.attach(selectedSessionId)

      this.liveSessionStore.upsertSnapshot(snapshot)
      this.feedbackStore.showFeedback(`Attached to \u201c${snapshot.title}\u201d.`)
      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to attach to the selected session.'

      runInAction(() => {
        this.error = message
      })
      this.feedbackStore.showFeedback(message, 'error')
      return false
    } finally {
      runInAction(() => {
        this.attachingSessionId = null
      })
    }
  }

  async detachSelected(): Promise<void> {
    const selectedSessionId = this.sessionStore.selectedSessionId

    if (!selectedSessionId || !this.sessionApi.detach) {
      return
    }

    runInAction(() => {
      this.error = null
    })

    try {
      const snapshot = await this.sessionApi.detach(selectedSessionId)
      const existingSession = this.sessionStore.selectedSession

      this.sessionStore.upsertSession(toSessionRecord(snapshot, existingSession))
      this.liveSessionStore.clearSnapshot(selectedSessionId)
      this.feedbackStore.showFeedback(`Detached from \u201c${snapshot.title}\u201d.`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to detach from the selected session.'

      runInAction(() => {
        this.error = message
      })
      this.feedbackStore.showFeedback(message, 'error')
    }
  }

  async forkSelected(): Promise<void> {
    const selectedSessionId = this.sessionStore.selectedSessionId
    const fork = this.sessionApi.fork ?? this.sessionApi.forkViaDaemon

    if (!selectedSessionId || !fork) {
      return
    }

    runInAction(() => {
      this.error = null
    })

    try {
      const snapshot = await fork(selectedSessionId)

      this.liveSessionStore.upsertSnapshot(snapshot)
      this.sessionStore.selectSession(snapshot.sessionId)
      this.feedbackStore.showFeedback(`Forked \u201c${snapshot.title}\u201d.`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to fork the selected session.'

      runInAction(() => {
        this.error = message
      })
      this.feedbackStore.showFeedback(message, 'error')
    }
  }

  async interruptSelected(): Promise<void> {
    const selectedSnapshot = this.liveSessionStore.selectedSnapshot

    if (!selectedSnapshot || !this.sessionApi.interrupt) {
      return
    }

    runInAction(() => {
      this.interruptingSessionId = selectedSnapshot.sessionId
      this.error = null
    })

    try {
      await this.sessionApi.interrupt(selectedSnapshot.sessionId)
      await this.liveSessionStore.refreshSnapshot(selectedSnapshot.sessionId)
    } catch (error) {
      runInAction(() => {
        this.error =
          error instanceof Error ? error.message : 'Unable to stop the active generation.'
      })
    } finally {
      runInAction(() => {
        this.interruptingSessionId = null
      })
    }
  }

  copySelectedId(): void {
    const selectedSessionId = this.sessionStore.selectedSessionId

    if (!selectedSessionId) {
      return
    }

    void this.writeSelectedIdToClipboard(selectedSessionId)
  }

  resetForSession(sessionId: string): void {
    if (sessionId !== this.lastSessionId) {
      this.draft = ''
      this.error = null
    }

    if (sessionId) {
      this.pendingDraftPreferences = null
    }

    this.lastSessionId = sessionId
  }

  hydrateFromLocalStorage(): void {
    this.preferencesBySessionId = readPersistedComposerPreferences(this.persistence)
  }

  dispose(): void {
    this.feedbackStore.dispose()
    this.preferencesReactionDisposer?.()
    this.preferencesReactionDisposer = null
  }

  private persistPreferences(preferences: Record<string, ComposerPreferences>): void {
    persistComposerPreferences(this.persistence, preferences)
  }

  private async writeSelectedIdToClipboard(sessionId: string): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this window.')
      }

      await navigator.clipboard.writeText(sessionId)
      this.feedbackStore.showFeedback(`Copied session ID \u201c${sessionId}\u201d.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to copy the session ID.'

      runInAction(() => {
        this.error = message
      })
      this.feedbackStore.showFeedback(message, 'error')
    }
  }
}

function toComposerStatus(status: string | undefined): ComposerStatus {
  if (
    status === 'active' ||
    status === 'waiting' ||
    status === 'completed' ||
    status === 'reconnecting' ||
    status === 'orphaned' ||
    status === 'error'
  ) {
    return status
  }

  return 'idle'
}
