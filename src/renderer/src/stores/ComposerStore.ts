import type { LiveSessionContextStatsInfo, LiveSessionModel } from '../../../shared/ipc/contracts'
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
  resolveReasoningEffort,
  SESSION_COMPOSER_STORAGE_KEY,
} from './composerPreferences'
import { type ComposerFeedback, FeedbackStore } from './FeedbackStore'
import type { FoundationStore } from './FoundationStore'
import type { LiveSessionStore } from './LiveSessionStore'
import { batch, bindMethods, observable, readField, writeField } from './legend'
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
  readonly stateNode = observable({
    draft: '',
    error: null as string | null,
    preferencesBySessionId: {} as Record<string, ComposerPreferences>,
    pendingDraftWorkspacePath: null as string | null,
    pendingDraftPreferences: null as ComposerPreferences | null,
    sendingSessionId: null as string | null,
    isPendingDraftSubmitting: false,
    attachingSessionId: null as string | null,
    interruptingSessionId: null as string | null,
  })

  readonly feedbackStore: FeedbackStore
  readonly renameWorkflow: RenameWorkflowStore
  readonly rewindWorkflow: RewindWorkflowStore
  readonly permissionResolution: PermissionResolutionStore

  private readonly sessionStore: SessionStore
  private readonly liveSessionStore: LiveSessionStore
  private readonly foundationStore: FoundationStore
  private readonly sessionApi: ComposerSessionGateway
  private readonly getSelectedContextStats: () => LiveSessionContextStatsInfo | null
  private readonly persistence: PersistencePort
  private preferencesReactionDisposer: (() => void) | null = null
  private lastSessionId: string | null

  constructor(
    sessionStore: SessionStore,
    liveSessionStore: LiveSessionStore,
    foundationStore: FoundationStore,
    sessionApi: ComposerSessionGateway,
    persistence: PersistencePort = createLocalStoragePort(),
    getSelectedContextStats: () => LiveSessionContextStatsInfo | null = () => null,
  ) {
    this.sessionStore = sessionStore
    this.liveSessionStore = liveSessionStore
    this.foundationStore = foundationStore
    this.sessionApi = sessionApi
    this.getSelectedContextStats = getSelectedContextStats
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

    bindMethods(this)

    this.hydrateFromLocalStorage()
    this.preferencesReactionDisposer = this.stateNode.preferencesBySessionId.onChange(
      ({ value }) => {
        this.persistPreferences(value)
      },
    )
  }

  get draft(): string {
    return readField(this.stateNode, 'draft')
  }

  set draft(value: string) {
    writeField(this.stateNode, 'draft', value)
  }

  get error(): string | null {
    return readField(this.stateNode, 'error')
  }

  set error(value: string | null) {
    writeField(this.stateNode, 'error', value)
  }

  get preferencesBySessionId(): Record<string, ComposerPreferences> {
    return readField(this.stateNode, 'preferencesBySessionId')
  }

  set preferencesBySessionId(value: Record<string, ComposerPreferences>) {
    writeField(this.stateNode, 'preferencesBySessionId', value)
  }

  get pendingDraftWorkspacePath(): string | null {
    return readField(this.stateNode, 'pendingDraftWorkspacePath')
  }

  set pendingDraftWorkspacePath(value: string | null) {
    writeField(this.stateNode, 'pendingDraftWorkspacePath', value)
  }

  get pendingDraftPreferences(): ComposerPreferences | null {
    return readField(this.stateNode, 'pendingDraftPreferences')
  }

  set pendingDraftPreferences(value: ComposerPreferences | null) {
    writeField(this.stateNode, 'pendingDraftPreferences', value)
  }

  get sendingSessionId(): string | null {
    return readField(this.stateNode, 'sendingSessionId')
  }

  set sendingSessionId(value: string | null) {
    writeField(this.stateNode, 'sendingSessionId', value)
  }

  get isPendingDraftSubmitting(): boolean {
    return readField(this.stateNode, 'isPendingDraftSubmitting')
  }

  set isPendingDraftSubmitting(value: boolean) {
    writeField(this.stateNode, 'isPendingDraftSubmitting', value)
  }

  get attachingSessionId(): string | null {
    return readField(this.stateNode, 'attachingSessionId')
  }

  set attachingSessionId(value: string | null) {
    writeField(this.stateNode, 'attachingSessionId', value)
  }

  get interruptingSessionId(): string | null {
    return readField(this.stateNode, 'interruptingSessionId')
  }

  set interruptingSessionId(value: string | null) {
    writeField(this.stateNode, 'interruptingSessionId', value)
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
      contextStats: this.getSelectedContextStats(),
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

    const snapshot = this.liveSessionStore.snapshotsById.get(sessionId) ?? null
    const nextPreferences = {
      ...deriveComposerPreferences(
        sessionId,
        snapshot,
        this.preferencesBySessionId,
        this.foundationStore.factoryDefaultSettings as FactoryDefaults,
        this.foundationStore.factoryModels,
      ),
      ...partial,
    }

    this.preferencesBySessionId = {
      ...this.preferencesBySessionId,
      [sessionId]: {
        ...nextPreferences,
        reasoningEffort: resolveReasoningEffort(
          nextPreferences.modelId,
          nextPreferences.reasoningEffort,
          snapshot?.availableModels?.length
            ? snapshot.availableModels
            : this.foundationStore.factoryModels,
        ),
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
    const nextPreferences = {
      ...(this.pendingDraftPreferences ??
        deriveDefaultComposerPreferences(
          this.foundationStore.factoryDefaultSettings as FactoryDefaults,
          this.foundationStore.factoryModels,
        )),
      ...partial,
    }

    this.pendingDraftPreferences = {
      ...nextPreferences,
      reasoningEffort: resolveReasoningEffort(
        nextPreferences.modelId,
        nextPreferences.reasoningEffort,
        this.foundationStore.factoryModels,
      ),
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
    reasoningEffort?: string
    autonomyLevel: string
  }): Promise<void> {
    const { addUserMessage, attach, create, updateSettings } = this.sessionApi

    const targetSessionId =
      this.liveSessionStore.selectedSnapshot?.sessionId ?? this.sessionStore.selectedSessionId

    if (!targetSessionId && this.pendingDraftWorkspacePath) {
      if (!create || !addUserMessage || !updateSettings) {
        return
      }

      batch(() => {
        this.isPendingDraftSubmitting = true
        this.error = null
      })

      try {
        const liveSession = await create(this.pendingDraftWorkspacePath)

        await updateSettings(liveSession.sessionId, {
          modelId: payload.modelId,
          interactionMode: payload.interactionMode,
          ...(payload.reasoningEffort ? { reasoningEffort: payload.reasoningEffort } : {}),
          autonomyLevel: payload.autonomyLevel,
        })
        await addUserMessage(liveSession.sessionId, payload.text)

        batch(() => {
          this.pendingDraftWorkspacePath = null
          this.pendingDraftPreferences = null
          this.draft = ''
        })

        this.liveSessionStore.upsertSnapshot(liveSession)
        this.sessionStore.selectSession(liveSession.sessionId)
        this.updatePreferences(liveSession.sessionId, {
          modelId: payload.modelId,
          interactionMode: payload.interactionMode,
          reasoningEffort: payload.reasoningEffort ?? '',
          autonomyLevel: payload.autonomyLevel,
        })
        await this.liveSessionStore.refreshSnapshot(liveSession.sessionId)
      } catch (error) {
        batch(() => {
          this.error = error instanceof Error ? error.message : 'Unable to send the message.'
        })
      } finally {
        batch(() => {
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

    batch(() => {
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
        ...(payload.reasoningEffort ? { reasoningEffort: payload.reasoningEffort } : {}),
        autonomyLevel: payload.autonomyLevel,
      })
      await addUserMessage(liveSession.sessionId, payload.text)

      batch(() => {
        this.draft = ''
      })

      this.updatePreferences(liveSession.sessionId, {
        modelId: payload.modelId,
        interactionMode: payload.interactionMode,
        reasoningEffort: payload.reasoningEffort ?? '',
        autonomyLevel: payload.autonomyLevel,
      })

      await this.liveSessionStore.refreshSnapshot(liveSession.sessionId)
    } catch (error) {
      batch(() => {
        this.error = error instanceof Error ? error.message : 'Unable to send the message.'
      })
    } finally {
      batch(() => {
        this.sendingSessionId = null
      })
    }
  }

  async attachSelected(): Promise<boolean> {
    const selectedSessionId = this.sessionStore.selectedSessionId

    if (!selectedSessionId || !this.sessionApi.attach) {
      return false
    }

    batch(() => {
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

      batch(() => {
        this.error = message
      })
      this.feedbackStore.showFeedback(message, 'error')
      return false
    } finally {
      batch(() => {
        this.attachingSessionId = null
      })
    }
  }

  async detachSelected(): Promise<void> {
    const selectedSessionId = this.sessionStore.selectedSessionId

    if (!selectedSessionId || !this.sessionApi.detach) {
      return
    }

    batch(() => {
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

      batch(() => {
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

    batch(() => {
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

      batch(() => {
        this.error = message
      })
      this.feedbackStore.showFeedback(message, 'error')
    }
  }

  async compactSelected(customInstructions?: string): Promise<void> {
    const selectedSessionId = this.sessionStore.selectedSessionId
    const compact = this.sessionApi.compact

    if (!selectedSessionId || !compact) {
      return
    }

    batch(() => {
      this.error = null
    })

    try {
      const existingSession = this.sessionStore.selectedSession
      const result = await compact(selectedSessionId, customInstructions)

      this.sessionStore.upsertSession({
        ...toSessionRecord(result.snapshot, existingSession),
        derivationType: 'compact',
      })
      this.liveSessionStore.upsertSnapshot(result.snapshot)
      this.sessionStore.selectSession(result.snapshot.sessionId)
      this.feedbackStore.showFeedback(
        `Compacted “${result.snapshot.title}” and removed ${result.removedCount} messages.`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to compact the selected session.'

      batch(() => {
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

    batch(() => {
      this.interruptingSessionId = selectedSnapshot.sessionId
      this.error = null
    })

    try {
      await this.sessionApi.interrupt(selectedSnapshot.sessionId)
      await this.liveSessionStore.refreshSnapshot(selectedSnapshot.sessionId)
    } catch (error) {
      batch(() => {
        this.error =
          error instanceof Error ? error.message : 'Unable to stop the active generation.'
      })
    } finally {
      batch(() => {
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

      batch(() => {
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
