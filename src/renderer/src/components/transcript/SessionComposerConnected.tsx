import { observer } from 'mobx-react-lite'

import { useStores } from '../../stores/StoreProvider'
import { SessionComposerContainer } from '../app-shell/SessionComposerContainer'
import { SessionComposer } from './SessionComposer'
import { buildSessionComposerProps } from './sessionComposerSelectors'

interface SessionComposerConnectedProps {
  onAttach?: () => void
  canComposeDetached?: boolean
  isSubmittingDetached?: boolean
  onSubmitDetached?: (payload: {
    text: string
    modelId: string
    interactionMode: string
    autonomyLevel: string
  }) => void | Promise<void>
}

export const SessionComposerConnected = observer(function SessionComposerConnected({
  onAttach,
  canComposeDetached = false,
  isSubmittingDetached = false,
  onSubmitDetached,
}: SessionComposerConnectedProps) {
  const { composerStore, liveSessionStore, sessionStore, uiStore } = useStores()
  const { composer, error } = buildSessionComposerProps({
    canComposeDetached,
    composerStore,
    isSubmittingDetached,
    liveSessionStore,
    onAttach,
    onSubmitDetached,
    sessionStore,
    uiStore,
  })

  return (
    <SessionComposerContainer error={error}>
      <SessionComposer {...composer} />
    </SessionComposerContainer>
  )
})
