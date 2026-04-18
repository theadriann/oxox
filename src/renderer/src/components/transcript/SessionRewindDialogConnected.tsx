import { useCallback, useMemo } from 'react'

import { useValue } from '../../stores/legend'
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

export function SessionRewindDialogConnected() {
  const composerStore = useComposerStore()
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const transcriptStore = useTranscriptStore()
  const rewindWorkflow = composerStore.rewindWorkflow
  const selectedSessionId = useValue(() => sessionStore.selectedSessionId)
  const transcript = useValue(() =>
    selectedSessionId ? transcriptStore.transcriptForSession(selectedSessionId) : null,
  )
  const selectedTimelineItems = useValue(() => liveSessionStore.selectedTimelineItems)
  const open = useValue(() => rewindWorkflow.isRewindDialogOpen)
  const rewindMessageId = useValue(() => rewindWorkflow.rewindMessageId)
  const rewindForkTitle = useValue(() => rewindWorkflow.rewindForkTitle)
  const rewindInfo = useValue(() => rewindWorkflow.rewindInfo)
  const selectedRestoreFilePaths = useValue(() => rewindWorkflow.selectedRestoreFilePaths)
  const selectedDeleteFilePaths = useValue(() => rewindWorkflow.selectedDeleteFilePaths)
  const isLoadingInfo = useValue(() => rewindWorkflow.loadingRewindSessionId !== null)
  const isExecuting = useValue(() => rewindWorkflow.rewindingSessionId !== null)
  const error = useValue(() => rewindWorkflow.rewindError)
  const historicalTimeline = useMemo(
    () => buildHistoricalTimeline(transcript?.entries ?? []),
    [transcript],
  )
  const timelineItems = useMemo(
    () =>
      resolveSessionRewindTimelineItems({
        historicalTimeline,
        selectedTimelineItems,
      }),
    [historicalTimeline, selectedTimelineItems],
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
      open={open}
      messageOptions={messageOptions}
      selectedMessageId={rewindMessageId}
      forkTitle={rewindForkTitle}
      rewindInfo={rewindInfo}
      selectedRestoreFilePaths={selectedRestoreFilePaths}
      selectedDeleteFilePaths={selectedDeleteFilePaths}
      isLoadingInfo={isLoadingInfo}
      isExecuting={isExecuting}
      error={error}
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
}
