import { observer } from 'mobx-react-lite'
import { useCallback, useMemo } from 'react'

import {
  useComposerStore,
  useLiveSessionStore,
  useSessionStore,
  useTranscriptStore,
} from '../../stores/StoreProvider'
import { buildHistoricalTimeline } from './buildHistoricalTimeline'
import { SessionRewindDialog, type SessionRewindMessageOption } from './SessionRewindDialog'
import {
  buildSessionRewindMessageOptions,
  resolveSessionRewindTimelineItems,
} from './sessionRewindSelectors'

export const SessionRewindDialogConnected = observer(function SessionRewindDialogConnected() {
  const composerStore = useComposerStore()
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const transcriptStore = useTranscriptStore()
  const rewindWorkflow = composerStore.rewindWorkflow
  const selectedSessionId = sessionStore.selectedSessionId
  const transcript = selectedSessionId
    ? transcriptStore.transcriptForSession(selectedSessionId)
    : null
  const historicalTimeline = useMemo(
    () => buildHistoricalTimeline(transcript?.entries ?? []),
    [transcript],
  )
  const timelineItems = useMemo(
    () =>
      resolveSessionRewindTimelineItems({
        historicalTimeline,
        selectedTimelineItems: liveSessionStore.selectedTimelineItems,
      }),
    [historicalTimeline, liveSessionStore.selectedTimelineItems],
  )
  const messageOptions = useMemo<SessionRewindMessageOption[]>(
    () => buildSessionRewindMessageOptions(timelineItems),
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
