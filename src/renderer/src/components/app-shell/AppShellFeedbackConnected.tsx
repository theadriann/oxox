import { useValue } from '../../stores/legend'
import { useComposerStore } from '../../stores/StoreProvider'
import { AppShellFeedback } from './AppShellFeedback'

export function AppShellFeedbackConnected() {
  const composerStore = useComposerStore()
  const feedback = useValue(() => composerStore.feedbackStore.feedback)

  return <AppShellFeedback feedback={feedback} />
}
