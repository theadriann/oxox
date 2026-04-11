import { observer } from 'mobx-react-lite'
import { useCallback, useMemo } from 'react'

import { useStores } from '../../stores/StoreProvider'
import { buildHistoricalTimeline } from './buildHistoricalTimeline'
import { SessionRewindDialog, type SessionRewindMessageOption } from './SessionRewindDialog'

export const SessionRewindDialogConnected = observer(function SessionRewindDialogConnected() {
  const { composerStore, liveSessionStore, sessionStore, transcriptStore } = useStores()
  const rewindWorkflow = composerStore.rewindWorkflow
  const selectedSessionId = sessionStore.selectedSessionId
  const transcript = selectedSessionId
    ? transcriptStore.transcriptForSession(selectedSessionId)
    : null
  const historicalTimeline = useMemo(
    () => buildHistoricalTimeline(transcript?.entries ?? []),
    [transcript],
  )
  const timelineItems =
    liveSessionStore.selectedTimelineItems.length > 0
      ? liveSessionStore.selectedTimelineItems
      : historicalTimeline
  const messageOptions = useMemo<SessionRewindMessageOption[]>(
    () =>
      timelineItems.flatMap((item) => {
        if (item.kind !== 'message') {
          return []
        }

        const preview = item.content.replace(/\s+/gu, ' ').trim()
        const clippedPreview =
          preview.length > 64 ? `${preview.slice(0, 61).trimEnd()}…` : preview || '(empty message)'

        return [
          {
            value: item.messageId,
            label: `${capitalizeRole(item.role)} · ${clippedPreview}`,
          },
        ]
      }),
    [timelineItems],
  )

  const handleMessageIdChange = useCallback(
    (value: string) => {
      rewindWorkflow.setRewindMessageId(value)
    },
    [rewindWorkflow],
  )

  const handleRefreshInfo = useCallback(() => {
    void rewindWorkflow.loadRewindInfo()
  }, [rewindWorkflow])

  return (
    <SessionRewindDialog
      open={rewindWorkflow.isRewindDialogOpen}
      messageOptions={messageOptions}
      selectedMessageId={rewindWorkflow.rewindMessageId}
      forkTitle={rewindWorkflow.rewindForkTitle}
      rewindInfo={rewindWorkflow.rewindInfo}
      selectedRestoreFilePaths={rewindWorkflow.selectedRestoreFilePaths}
      selectedDeleteFilePaths={rewindWorkflow.selectedDeleteFilePaths}
      isLoadingInfo={rewindWorkflow.loadingRewindSessionId !== null}
      isExecuting={rewindWorkflow.rewindingSessionId !== null}
      error={rewindWorkflow.rewindError}
      onMessageIdChange={handleMessageIdChange}
      onForkTitleChange={rewindWorkflow.setRewindForkTitle}
      onOpenChange={(open) => {
        if (!open) {
          rewindWorkflow.closeRewindDialog()
        }
      }}
      onRefreshInfo={handleRefreshInfo}
      onToggleRestoreFile={rewindWorkflow.toggleRewindRestoreFile}
      onToggleDeleteFile={rewindWorkflow.toggleRewindDeleteFile}
      onSubmit={() => {
        void (async () => {
          await rewindWorkflow.submitExecuteRewind()
          if (rewindWorkflow.rewindError) {
            composerStore.feedbackStore.showFeedback(rewindWorkflow.rewindError, 'error')
          }
        })()
      }}
    />
  )
})

function capitalizeRole(value: string): string {
  return value.length > 0 ? `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}` : 'Message'
}
