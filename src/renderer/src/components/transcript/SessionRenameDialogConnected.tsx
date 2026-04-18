import { useValue } from '../../stores/legend'
import { useComposerStore } from '../../stores/StoreProvider'
import { SessionRenameDialog } from './SessionRenameDialog'

export function SessionRenameDialogConnected() {
  const composerStore = useComposerStore()
  const renameWorkflow = composerStore.renameWorkflow
  const open = useValue(() => renameWorkflow.isRenameDialogOpen)
  const draft = useValue(() => renameWorkflow.renameDraft)
  const isSaving = useValue(() => renameWorkflow.renamingSessionId !== null)

  return (
    <SessionRenameDialog
      open={open}
      draft={draft}
      isSaving={isSaving}
      onDraftChange={renameWorkflow.setRenameDraft}
      onOpenChange={(open) => {
        if (!open) {
          renameWorkflow.closeRenameDialog()
        }
      }}
      onSubmit={() => {
        void (async () => {
          await renameWorkflow.submitRename()
          if (renameWorkflow.error) {
            composerStore.feedbackStore.showFeedback(renameWorkflow.error, 'error')
          }
        })()
      }}
    />
  )
}
