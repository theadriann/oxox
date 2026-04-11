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

  const detailViewKey = useMemo(
    () =>
      getDetailViewKey({
        hasDeletedSelection: sessionStore.hasDeletedSelection,
        hasFoundationError: foundationStore.hasError,
        hasIndexedSessions: sessionStore.sessions.length > 0,
        isDroidMissing: foundationStore.isDroidMissing,
        isFoundationLoading: foundationStore.isLoading,
        selectedLiveSessionId: liveSessionStore.selectedSnapshotId,
        selectedSessionId: sessionStore.selectedSessionId,
        selectedSessionStatus: sessionStore.selectedSession?.status ?? null,
        showNewSessionForm: newSessionForm.showForm,
      }),
    [
      foundationStore.hasError,
      foundationStore.isDroidMissing,
      foundationStore.isLoading,
      liveSessionStore.selectedSnapshotId,
      newSessionForm.showForm,
      sessionStore.hasDeletedSelection,
      sessionStore.selectedSession?.status,
      sessionStore.selectedSessionId,
      sessionStore.sessions.length,
    ],
  )

  const sessionTitle = newSessionForm.showForm
    ? 'New session'
    : (liveSessionStore.selectedSnapshot?.title ?? sessionStore.selectedSession?.title)

  const sessionProjectLabel = newSessionForm.showForm
    ? newSessionForm.path || undefined
    : (liveSessionStore.selectedSnapshot?.projectWorkspacePath ??
      sessionStore.selectedSession?.projectLabel)

  const sidebarErrorState = getSidebarErrorState(foundationStore.hasError, () => {
    void foundationStore.refresh()
  })

  const shouldRenderComposer = Boolean(
    newSessionForm.showForm ||
      (sessionStore.selectedSessionId &&
        (liveSessionStore.selectedSnapshot || sessionStore.selectedSession)),
  )

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
