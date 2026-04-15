import { observer } from 'mobx-react-lite'
import { type RefObject, useCallback } from 'react'

import {
  useComposerStore,
  useFoundationStore,
  useLiveSessionStore,
  useSessionStore,
  useTranscriptStore,
  useTransportStore,
  useUIStore,
} from '../../stores/StoreProvider'
import { useOptionalAppShellControllerContext } from './AppShellControllerContext'
import { buildDetailPanelConnectedProps } from './connectedSelectors'
import { DetailPanel } from './DetailPanel'

interface NewSessionFormState {
  showForm: boolean
  path: string
  error: string | null
  pickDirectory: () => Promise<void>
}

interface DetailPanelConnectedProps {
  newSessionForm?: NewSessionFormState
  transcriptScrollSignal?: number
  transcriptPrimaryActionRef?: RefObject<HTMLElement | null>
  onBrowseSessions?: () => void
}

export const DetailPanelConnected = observer(function DetailPanelConnected({
  newSessionForm,
  transcriptScrollSignal,
  transcriptPrimaryActionRef,
  onBrowseSessions,
}: DetailPanelConnectedProps) {
  const composerStore = useComposerStore()
  const foundationStore = useFoundationStore()
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const transcriptStore = useTranscriptStore()
  const transportStore = useTransportStore()
  const uiStore = useUIStore()
  const controller = useOptionalAppShellControllerContext()
  const resolvedNewSessionForm = newSessionForm ?? controller?.newSessionForm
  const resolvedTranscriptScrollSignal =
    transcriptScrollSignal ?? controller?.transcriptScrollSignal
  const resolvedTranscriptPrimaryActionRef =
    transcriptPrimaryActionRef ?? controller?.transcriptPrimaryActionRef
  const resolvedOnBrowseSessions = onBrowseSessions ?? controller?.handleBrowseSessions

  if (
    !resolvedNewSessionForm ||
    resolvedTranscriptScrollSignal === undefined ||
    !resolvedTranscriptPrimaryActionRef ||
    !resolvedOnBrowseSessions
  ) {
    throw new Error(
      'DetailPanelConnected requires controller props when no AppShellControllerProvider is present',
    )
  }

  const props = buildDetailPanelConnectedProps({
    composerStore,
    foundationStore,
    liveSessionStore,
    newSessionForm: resolvedNewSessionForm,
    onBrowseSessions: resolvedOnBrowseSessions,
    sessionStore,
    transcriptPrimaryActionRef: resolvedTranscriptPrimaryActionRef,
    transcriptScrollSignal: resolvedTranscriptScrollSignal,
    transcriptStore,
    transportStore,
    uiStore,
  })
  const handleResolvePermissionRequest = useCallback(
    (payload: { requestId: string; selectedOption: string }) => {
      void composerStore.permissionResolution.resolvePermission(
        payload.requestId,
        payload.selectedOption,
      )
    },
    [composerStore],
  )
  const handleSubmitAskUserResponse = useCallback(
    (payload: {
      requestId: string
      answers: Array<{ index: number; question: string; answer: string }>
    }) => {
      void composerStore.permissionResolution.resolveAskUser(payload.requestId, payload.answers)
    },
    [composerStore],
  )

  return (
    <DetailPanel
      {...props}
      onResolvePermissionRequest={handleResolvePermissionRequest}
      onSubmitAskUserResponse={handleSubmitAskUserResponse}
    />
  )
})
