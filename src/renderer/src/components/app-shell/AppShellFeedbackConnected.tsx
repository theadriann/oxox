import { useValue } from '@legendapp/state/react'
import { useComposerStore } from '../../state/root/store-provider'
import { AppShellFeedback } from './AppShellFeedback'

export function AppShellFeedbackConnected() {
  const composerStore = useComposerStore()
  const feedback = useValue(() => composerStore.feedbackStore.feedback)

  return <AppShellFeedback feedback={feedback} />
}
