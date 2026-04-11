import { observer } from 'mobx-react-lite'

import { useStores } from '../../stores/StoreProvider'
import { AppShellFeedback } from './AppShellFeedback'

export const AppShellFeedbackConnected = observer(function AppShellFeedbackConnected() {
  const { composerStore } = useStores()

  return <AppShellFeedback feedback={composerStore.feedbackStore.feedback} />
})
