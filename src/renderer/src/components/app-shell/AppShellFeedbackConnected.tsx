import { observer } from 'mobx-react-lite'

import { useComposerStore } from '../../stores/StoreProvider'
import { AppShellFeedback } from './AppShellFeedback'

export const AppShellFeedbackConnected = observer(function AppShellFeedbackConnected() {
  const composerStore = useComposerStore()

  return <AppShellFeedback feedback={composerStore.feedbackStore.feedback} />
})
