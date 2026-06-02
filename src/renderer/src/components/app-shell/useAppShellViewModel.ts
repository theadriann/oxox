import { useValue } from '@legendapp/state/react'
import { useMemo } from 'react'

import { shouldAnimateMotion } from '../../lib/motion'
import type { FoundationStore } from '../../stores/FoundationStore'
import type { LiveSessionStore } from '../../stores/LiveSessionStore'
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
  const hasDeletedSelection = useValue(() => sessionStore.hasDeletedSelection)
  const hasFoundationError = useValue(() => foundationStore.hasError)
  const hasIndexedSessions = useValue(() => sessionStore.sessions.length > 0)
  const isDroidMissing = useValue(() => foundationStore.isDroidMissing)
  const isFoundationLoading = useValue(() => foundationStore.isLoading)
  const selectedLiveSessionId = useValue(() => liveSessionStore.selectedSnapshotId)
  const selectedSessionId = useValue(() => sessionStore.selectedSessionId)
  const selectedSessionStatus = useValue(() => sessionStore.selectedSession?.status ?? null)
  const sessionTitle = useValue(() =>
    newSessionForm.showForm
      ? 'New session'
      : (liveSessionStore.selectedSnapshot?.title ?? sessionStore.selectedSession?.title),
  )
  const sessionProjectLabel = useValue(() =>
    newSessionForm.showForm
      ? newSessionForm.path || undefined
      : (liveSessionStore.selectedSnapshot?.projectWorkspacePath ??
        sessionStore.selectedSession?.projectLabel),
  )
  const shouldRenderComposer = useValue(() =>
    Boolean(
      newSessionForm.showForm ||
        (sessionStore.selectedSessionId &&
          (liveSessionStore.selectedSnapshot || sessionStore.selectedSession)),
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
