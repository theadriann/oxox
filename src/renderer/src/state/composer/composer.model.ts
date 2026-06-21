import { batch, type Observable } from '@legendapp/state'
import type {
  LiveSessionAddUserMessageRequest,
  LiveSessionContextStatsInfo,
  LiveSessionModel,
  LiveSessionSnapshot,
} from '../../../../shared/ipc/contracts'
import { createLocalStoragePort, type PersistencePort } from '../../platform/persistence'
import type { FoundationStore } from '../foundation/foundation.model'
import type { LiveSessionStore } from '../live-sessions/live-session.model'
import { toSessionRecord } from '../live-sessions/live-session-record.factories'
import type { SessionStore } from '../sessions/session.model'
import { ForkWorkflowStore } from '../workflows/fork/fork-workflow.model'
import { PermissionResolutionStore } from '../workflows/permission-resolution/permission-resolution.model'
import { RenameWorkflowStore } from '../workflows/rename/rename-workflow.model'
import { RewindWorkflowStore } from '../workflows/rewind/rewind-workflow.model'
import { AsyncActionsStore } from './async-actions.model'
import { createComposerState$ } from './composer.state'
import type {
  ComposerImageAttachment,
  ComposerSessionDraftSnapshot,
  ComposerSessionGateway,
  ComposerState,
  ComposerStatus,
  ComposerSubmitPayload,
} from './composer.types'
import {
  type ComposerContextUsageState,
  deriveComposerContextUsage,
  getLatestTokenUsageEvent,
} from './composer-context-usage.selectors'
import {
  type ComposerPreferences,
  deriveComposerPreferences,
  deriveDefaultComposerPreferences,
  type FactoryDefaults,
  mergeComposerModelLists,
  mergeComposerModelMetadata,
  persistComposerPreferences,
  readPersistedComposerPreferences,
  resolveReasoningEffort,
  SESSION_COMPOSER_STORAGE_KEY,
} from './composer-preferences.persistence'
import { type ComposerFeedback, FeedbackStore } from './feedback.model'

export type { AsyncActionItem, AsyncActionStatus } from './async-actions.model'
export type { ComposerSessionGateway, ComposerStatus } from './composer.types'
export { type ComposerFeedback, type ComposerPreferences, SESSION_COMPOSER_STORAGE_KEY }

export class ComposerStore {
  readonly state$: Observable<ComposerState> = createComposerState$()

  readonly asyncActionsStore: AsyncActionsStore
  readonly feedbackStore: FeedbackStore
  readonly forkWorkflow: ForkWorkflowStore
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

    this.asyncActionsStore = new AsyncActionsStore()
    this.feedbackStore = new FeedbackStore()

    this.forkWorkflow = new ForkWorkflowStore(
      () => this.sessionStore.selectedSessionId || null,
      () =>
        this.sessionStore.selectedSession ??
        (this.liveSessionStore.selectedSnapshot as { title: string } | null),
      this.sessionApi,
      this.asyncActionsStore,
      async (snapshot) => {
        await this.foundationStore.refresh()
        this.liveSessionStore.upsertSnapshot(snapshot)
        this.sessionStore.selectSession(snapshot.sessionId)
        this.feedbackStore.showFeedback(`Forked \u201c${snapshot.title}\u201d.`)
      },
    )

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
        this.feedbackStore.showFeedback(`Created fork \u201c${result.snapshot.title}\u201d.`)
      },
      this.asyncActionsStore,
    )

    this.permissionResolution = new PermissionResolutionStore(
      () => this.liveSessionStore.selectedSnapshot,
      this.sessionApi,
      async (sessionId) => {
        await this.liveSessionStore.refreshSnapshot(sessionId)
      },
    )

    this.hydrateFromLocalStorage()
    this.preferencesReactionDisposer = this.state$.preferencesBySessionId.onChange(({ value }) => {
      this.persistPreferences(value)
    })
  }

  get draft(): string {
    return this.state$.draft.get()
  }

  set draft(value: string) {
    this.state$.draft.set(value)
    this.saveSelectedDraftSnapshot()
  }

  get imageAttachments(): ComposerImageAttachment[] {
    return this.state$.imageAttachments.get()
  }

  set imageAttachments(value: ComposerImageAttachment[]) {
    this.state$.imageAttachments.set(value)
    this.saveSelectedDraftSnapshot()
  }

  get error(): string | null {
    return this.state$.error.get()
  }

  set error(value: string | null) {
    this.state$.error.set(value)
  }

  get preferencesBySessionId(): Record<string, ComposerPreferences> {
    return this.state$.preferencesBySessionId.get()
  }

  set preferencesBySessionId(value: Record<string, ComposerPreferences>) {
    this.state$.preferencesBySessionId.set(value)
  }

  get pendingDraftWorkspacePath(): string | null {
    return this.state$.pendingDraftWorkspacePath.get()
  }

  set pendingDraftWorkspacePath(value: string | null) {
    this.state$.pendingDraftWorkspacePath.set(value)
  }

  get pendingDraftPreferences(): ComposerPreferences | null {
    return this.state$.pendingDraftPreferences.get()
  }

  set pendingDraftPreferences(value: ComposerPreferences | null) {
    this.state$.pendingDraftPreferences.set(value)
  }

  get sendingSessionId(): string | null {
    return this.state$.sendingSessionId.get()
  }

  set sendingSessionId(value: string | null) {
    this.state$.sendingSessionId.set(value)
  }

  get isPendingDraftSubmitting(): boolean {
    return this.state$.isPendingDraftSubmitting.get()
  }

  set isPendingDraftSubmitting(value: boolean) {
    this.state$.isPendingDraftSubmitting.set(value)
  }

  get attachingSessionId(): string | null {
    return this.state$.attachingSessionId.get()
  }

  set attachingSessionId(value: string | null) {
    this.state$.attachingSessionId.set(value)
  }

  get interruptingSessionId(): string | null {
    return this.state$.interruptingSessionId.get()
  }

  set interruptingSessionId(value: string | null) {
    this.state$.interruptingSessionId.set(value)
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
      this.sessionStore.selectedSession?.modelId,
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
      ? mergeComposerModelMetadata(
          selectedSnapshot.availableModels,
          this.foundationStore.factoryModels,
        )
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

  setDraft = (value: string): void => {
    this.draft = value
  }

  addImageAttachments = (attachments: ComposerImageAttachment[]): void => {
    if (attachments.length === 0) return
    this.imageAttachments = [...this.imageAttachments, ...attachments]
  }

  removeImageAttachment = (attachmentId: string): void => {
    this.imageAttachments = this.imageAttachments.filter(
      (attachment) => attachment.id !== attachmentId,
    )
  }

  clearImageAttachments = (): void => {
    this.imageAttachments = []
  }

  setError = (value: string | null): void => {
    this.error = value
  }

  updatePreferences = (sessionId: string, partial: Partial<ComposerPreferences>): void => {
    if (!sessionId) {
      return
    }

    const snapshot = this.liveSessionStore.snapshotForSession(sessionId)
    const nextPreferences = {
      ...deriveComposerPreferences(
        sessionId,
        snapshot,
        this.preferencesBySessionId,
        this.foundationStore.factoryDefaultSettings as FactoryDefaults,
        this.foundationStore.factoryModels,
        this.sessionStore.sessionsById[sessionId]?.modelId,
      ),
      ...partial,
    }
    const availableModels = snapshot?.availableModels?.length
      ? mergeComposerModelLists(snapshot.availableModels, this.foundationStore.factoryModels)
      : this.foundationStore.factoryModels

    this.preferencesBySessionId = {
      ...this.preferencesBySessionId,
      [sessionId]: {
        ...nextPreferences,
        reasoningEffort: resolveReasoningEffort(
          nextPreferences.modelId,
          nextPreferences.reasoningEffort,
          availableModels,
        ),
      },
    }
  }

  beginPendingDraft = (): void => {
    this.beginPendingDraftForWorkspace(null)
  }

  beginPendingDraftForWorkspace = (workspacePath: string | null): void => {
    this.pendingDraftWorkspacePath = workspacePath?.trim() || null
    this.pendingDraftPreferences = deriveDefaultComposerPreferences(
      this.foundationStore.factoryDefaultSettings as FactoryDefaults,
      this.foundationStore.factoryModels,
    )
    this.error = null
  }

  updatePendingDraftPreferences = (partial: Partial<ComposerPreferences>): void => {
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

  clearPendingDraft = (): void => {
    this.pendingDraftWorkspacePath = null
    this.pendingDraftPreferences = null
  }

  submit = async (payload: ComposerSubmitPayload): Promise<void> => {
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
        await addUserMessage(liveSession.sessionId, buildUserMessagePayload(payload))

        batch(() => {
          this.pendingDraftWorkspacePath = null
          this.pendingDraftPreferences = null
          this.draft = ''
          this.imageAttachments = []
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
      await addUserMessage(
        liveSession.sessionId,
        buildUserMessagePayload(payload, getQueuePlacementForStatus(liveSession.status)),
      )

      batch(() => {
        this.draft = ''
        this.imageAttachments = []
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

  attachSelected = async (): Promise<boolean> => {
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

  detachSelected = async (): Promise<void> => {
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

  forkSelected = async (title?: string): Promise<void> => {
    const selectedSessionId = this.sessionStore.selectedSessionId
    const fork = this.sessionApi.fork ?? this.sessionApi.forkViaDaemon

    if (!selectedSessionId || !fork) {
      return
    }

    batch(() => {
      this.error = null
    })

    try {
      const snapshot = await fork(selectedSessionId, title?.trim() || undefined)

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

  compactSelected = async (customInstructions?: string): Promise<void> => {
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

  interruptSelected = async (): Promise<void> => {
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

  copySelectedId = (): void => {
    const selectedSessionId = this.sessionStore.selectedSessionId

    if (!selectedSessionId) {
      return
    }

    void this.writeSelectedIdToClipboard(selectedSessionId)
  }

  resetForSession = (sessionId: string): void => {
    if (sessionId !== this.lastSessionId) {
      this.saveDraftSnapshot(this.lastSessionId)
      const snapshot = this.state$.draftsBySessionId.peek()[sessionId]
      this.draft = snapshot?.draft ?? ''
      this.imageAttachments = snapshot?.imageAttachments ?? []
      this.error = null
    }

    if (sessionId) {
      this.pendingDraftPreferences = null
    }

    this.lastSessionId = sessionId
  }

  hydrateFromLocalStorage = (): void => {
    this.preferencesBySessionId = readPersistedComposerPreferences(this.persistence)
  }

  dispose = (): void => {
    this.asyncActionsStore.dispose()
    this.feedbackStore.dispose()
    this.preferencesReactionDisposer?.()
    this.preferencesReactionDisposer = null
  }

  private persistPreferences(preferences: Record<string, ComposerPreferences>): void {
    persistComposerPreferences(this.persistence, preferences)
  }

  private saveSelectedDraftSnapshot(): void {
    this.saveDraftSnapshot(this.sessionStore.selectedSessionId || null)
  }

  private saveDraftSnapshot(sessionId: string | null): void {
    if (!sessionId) {
      return
    }

    const snapshot: ComposerSessionDraftSnapshot = {
      draft: this.draft,
      imageAttachments: this.imageAttachments,
    }

    this.state$.draftsBySessionId.set({
      ...this.state$.draftsBySessionId.peek(),
      [sessionId]: snapshot,
    })
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

function buildUserMessagePayload(
  payload: ComposerSubmitPayload,
  queuePlacement?: LiveSessionAddUserMessageRequest['queuePlacement'],
): string | LiveSessionAddUserMessageRequest {
  if (!queuePlacement && (!payload.images || payload.images.length === 0)) {
    return payload.text
  }

  return {
    text: payload.text,
    ...(payload.images && payload.images.length > 0 ? { images: payload.images } : {}),
    ...(queuePlacement ? { queuePlacement } : {}),
  }
}

function getQueuePlacementForStatus(
  status: LiveSessionSnapshot['status'],
): LiveSessionAddUserMessageRequest['queuePlacement'] | undefined {
  return status === 'active' || status === 'waiting' ? 'end_of_turn' : undefined
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
