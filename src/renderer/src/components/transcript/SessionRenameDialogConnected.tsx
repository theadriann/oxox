import { observer } from 'mobx-react-lite'

import { useStores } from '../../stores/StoreProvider'
import { SessionRenameDialog } from './SessionRenameDialog'

export const SessionRenameDialogConnected = observer(function SessionRenameDialogConnected() {
  const { composerStore } = useStores()
  const renameWorkflow = composerStore.renameWorkflow

  return (
    <SessionRenameDialog
      open={renameWorkflow.isRenameDialogOpen}
      draft={renameWorkflow.renameDraft}
      isSaving={renameWorkflow.renamingSessionId !== null}
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
})
