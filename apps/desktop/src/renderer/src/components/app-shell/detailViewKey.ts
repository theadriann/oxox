interface DetailViewKeyOptions {
  hasDeletedSelection: boolean
  hasFoundationError: boolean
  hasIndexedSessions: boolean
  isDroidMissing: boolean
  isFoundationLoading: boolean
  selectedLiveSessionId: string | null
  selectedSessionId: string
  selectedSessionStatus: string | null
  showNewSessionForm: boolean
}

export function getDetailViewKey({
  hasDeletedSelection,
  hasFoundationError,
  hasIndexedSessions,
  isDroidMissing,
  isFoundationLoading,
  selectedLiveSessionId,
  selectedSessionId,
  selectedSessionStatus,
  showNewSessionForm,
}: DetailViewKeyOptions): string {
  if (hasFoundationError) return 'detail:foundation-error'
  if (showNewSessionForm) return 'detail:new-session'
  if (isFoundationLoading) return 'detail:loading'
  if (isDroidMissing) return 'detail:droid-missing'
  if (selectedLiveSessionId) return `detail:live:${selectedLiveSessionId}`
  if (hasDeletedSelection) return 'detail:deleted'
  if (!hasIndexedSessions) return 'detail:empty'
  if (!selectedSessionId) return 'detail:no-selection'
  return `detail:transcript:${selectedSessionId}:${selectedSessionStatus}`
}

export function getSidebarErrorState(hasError: boolean, onRetry: () => void) {
  return hasError
    ? {
        title: 'Unable to load session data',
        description:
          'OXOX could not refresh the indexed session list from the main process. Retry to recover the sidebar and detail views.',
        actionLabel: 'Retry loading sessions',
        onAction: onRetry,
      }
    : undefined
}
