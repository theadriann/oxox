import { useValue } from '@legendapp/state/react'
import { useComposerStore, useLiveSessionStore } from '../../state/root/store-provider'
import { SessionCompactDialog } from './SessionCompactDialog'

export function SessionCompactDialogConnected() {
  const composerStore = useComposerStore()
  const liveSessionStore = useLiveSessionStore()
  const compactWorkflow = composerStore.compactWorkflow
  const open = useValue(() => compactWorkflow.isCompactDialogOpen)
  const customInstructions = useValue(() => compactWorkflow.customInstructionsDraft)
  const compactionModel = useValue(() => compactWorkflow.compactionModelDraft)
  const isSaving = useValue(() => compactWorkflow.compactingSessionId !== null)
  const selectedSnapshot = useValue(() => liveSessionStore.selectedSnapshot)

  return (
    <SessionCompactDialog
      open={open}
      customInstructions={customInstructions}
      compactionModel={compactionModel}
      models={selectedSnapshot?.availableModels ?? []}
      currentModelId={selectedSnapshot?.settings.modelId ?? null}
      isSaving={isSaving}
      onCustomInstructionsChange={compactWorkflow.setCustomInstructionsDraft}
      onCompactionModelChange={compactWorkflow.setCompactionModelDraft}
      onOpenChange={(open) => {
        if (!open) {
          compactWorkflow.closeCompactDialog()
        }
      }}
      onSubmit={() => {
        void (async () => {
          await compactWorkflow.submitCompact()
          if (compactWorkflow.error) {
            composerStore.feedbackStore.showFeedback(compactWorkflow.error, 'error')
          }
        })()
      }}
    />
  )
}
