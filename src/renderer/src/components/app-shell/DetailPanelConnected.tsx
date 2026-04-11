import { observer } from 'mobx-react-lite'
import { type RefObject, useCallback } from 'react'

import { useStores } from '../../stores/StoreProvider'
import { buildDetailPanelConnectedProps } from './connectedSelectors'
import { DetailPanel } from './DetailPanel'

interface NewSessionFormState {
  showForm: boolean
  path: string
  error: string | null
  pickDirectory: () => Promise<void>
}

interface DetailPanelConnectedProps {
  newSessionForm: NewSessionFormState
  transcriptScrollSignal: number
  transcriptPrimaryActionRef: RefObject<HTMLElement | null>
  onBrowseSessions: () => void
}

export const DetailPanelConnected = observer(function DetailPanelConnected({
  newSessionForm,
  transcriptScrollSignal,
  transcriptPrimaryActionRef,
  onBrowseSessions,
}: DetailPanelConnectedProps) {
  const {
    composerStore,
    foundationStore,
    liveSessionStore,
    sessionStore,
    transcriptStore,
    transportStore,
    uiStore,
  } = useStores()
  const props = buildDetailPanelConnectedProps({
    composerStore,
    foundationStore,
    liveSessionStore,
    newSessionForm,
    onBrowseSessions,
    sessionStore,
    transcriptPrimaryActionRef,
    transcriptScrollSignal,
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
