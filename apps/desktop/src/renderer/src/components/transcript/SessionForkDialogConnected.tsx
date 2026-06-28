import { useValue } from '@legendapp/state/react'
import { useComposerStore } from '../../state/root/store-provider'
import { SessionForkDialog } from './SessionForkDialog'

export function SessionForkDialogConnected() {
  const composerStore = useComposerStore()
  const forkWorkflow = composerStore.forkWorkflow
  const open = useValue(() => forkWorkflow.isForkDialogOpen)
  const draft = useValue(() => forkWorkflow.forkDraft)
  const isSaving = useValue(() => forkWorkflow.forkingSessionId !== null)

  return (
    <SessionForkDialog
      open={open}
      draft={draft}
      isSaving={isSaving}
      onDraftChange={forkWorkflow.setForkDraft}
      onOpenChange={(open) => {
        if (!open) {
          forkWorkflow.closeForkDialog()
        }
      }}
      onSubmit={() => {
        void (async () => {
          await forkWorkflow.submitFork()
          if (forkWorkflow.error) {
            composerStore.feedbackStore.showFeedback(forkWorkflow.error, 'error')
          }
        })()
      }}
    />
  )
}
