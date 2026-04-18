import { useMemo } from 'react'

import { shouldAnimateMotion } from '../../lib/motion'
import type { FoundationStore } from '../../stores/FoundationStore'
import type { LiveSessionStore } from '../../stores/LiveSessionStore'
import { readValue, useValue } from '../../stores/legend'
import type { SessionStore } from '../../stores/SessionStore'
import { getDetailViewKey, getSidebarErrorState } from './detailViewKey'

interface UseAppShellViewModelOptions {
  foundationStore: FoundationStore
  liveSessionStore: LiveSessionStore
  newSessionForm: {
    path: string
    showForm: boolean
  }
  prefersReducedMotion: boolean | null
  sessionStore: SessionStore
}

export function useAppShellViewModel({
  foundationStore,
  liveSessionStore,
  newSessionForm,
  prefersReducedMotion,
  sessionStore,
}: UseAppShellViewModelOptions) {
  const shouldAnimate = shouldAnimateMotion(prefersReducedMotion)
  const hasDeletedSelection = useValue(() => readValue(sessionStore.hasDeletedSelection))
  const hasFoundationError = useValue(() => readValue(foundationStore.hasError))
  const hasIndexedSessions = useValue(() => readValue(sessionStore.sessions).length > 0)
  const isDroidMissing = useValue(() => readValue(foundationStore.isDroidMissing))
  const isFoundationLoading = useValue(() => readValue(foundationStore.isLoading))
  const selectedLiveSessionId = useValue(() => readValue(liveSessionStore.selectedSnapshotId))
  const selectedSessionId = useValue(() => readValue(sessionStore.selectedSessionId))
  const selectedSessionStatus = useValue(
    () => readValue(sessionStore.selectedSession)?.status ?? null,
  )
  const sessionTitle = useValue(() =>
    newSessionForm.showForm
      ? 'New session'
      : (readValue(liveSessionStore.selectedSnapshot)?.title ??
        readValue(sessionStore.selectedSession)?.title),
  )
  const sessionProjectLabel = useValue(() =>
    newSessionForm.showForm
      ? newSessionForm.path || undefined
      : (readValue(liveSessionStore.selectedSnapshot)?.projectWorkspacePath ??
        readValue(sessionStore.selectedSession)?.projectLabel),
  )
  const shouldRenderComposer = useValue(() =>
    Boolean(
      newSessionForm.showForm ||
        (readValue(sessionStore.selectedSessionId) &&
          (readValue(liveSessionStore.selectedSnapshot) ||
            readValue(sessionStore.selectedSession))),
    ),
  )

  const detailViewKey = useMemo(
    () =>
      getDetailViewKey({
        hasDeletedSelection,
        hasFoundationError,
        hasIndexedSessions,
        isDroidMissing,
        isFoundationLoading,
        selectedLiveSessionId,
        selectedSessionId,
        selectedSessionStatus,
        showNewSessionForm: newSessionForm.showForm,
      }),
    [
      hasDeletedSelection,
      hasFoundationError,
      hasIndexedSessions,
      isDroidMissing,
      isFoundationLoading,
      selectedLiveSessionId,
      newSessionForm.showForm,
      selectedSessionId,
      selectedSessionStatus,
    ],
  )

  const sidebarErrorState = getSidebarErrorState(hasFoundationError, () => {
    void foundationStore.refresh()
  })

  return {
    canComposeDetached: Boolean(newSessionForm.path.trim()),
    detailViewKey,
    sessionProjectLabel,
    sessionTitle,
    shouldAnimate,
    shouldRenderComposer,
    sidebarErrorState,
  }
}
