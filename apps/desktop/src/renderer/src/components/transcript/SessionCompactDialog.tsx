import type { FormEvent } from 'react'
import type { LiveSessionModel } from '../../../../shared/ipc/contracts'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'

interface SessionCompactDialogProps {
  open: boolean
  customInstructions: string
  compactionModel: string
  models: LiveSessionModel[]
  currentModelId: string | null
  isSaving: boolean
  onCustomInstructionsChange: (value: string) => void
  onCompactionModelChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}

export function SessionCompactDialog({
  open,
  customInstructions,
  compactionModel,
  models,
  currentModelId,
  isSaving,
  onCustomInstructionsChange,
  onCompactionModelChange,
  onOpenChange,
  onSubmit,
}: SessionCompactDialogProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSaving) {
      return
    }

    onSubmit()
  }

  const selectedModelLabel =
    compactionModel === 'current-model'
      ? currentModelId
        ? `Current session model (${formatModelName(models, currentModelId)})`
        : 'Current session model'
      : formatModelName(models, compactionModel)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[34rem]">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Compress session</DialogTitle>
            <DialogDescription>
              Create a compacted fork with optional instructions and a specific compaction model.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="session-compact-instructions">Additional instructions</Label>
            <Textarea
              id="session-compact-instructions"
              autoFocus
              disabled={isSaving}
              value={customInstructions}
              placeholder="Focus the summary on decisions, unresolved tasks, and files changed..."
              className="min-h-28 resize-y"
              onChange={(event) => onCustomInstructionsChange(event.target.value)}
            />
            <p className="text-xs text-fd-tertiary">
              Leave this blank to use Droid’s default compaction prompt.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="session-compact-model">Compaction model</Label>
            <Select
              value={compactionModel}
              onValueChange={onCompactionModelChange}
              disabled={isSaving}
            >
              <SelectTrigger id="session-compact-model" className="w-full">
                <SelectValue>{selectedModelLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className="max-h-72">
                <SelectItem value="current-model">
                  {currentModelId
                    ? `Current session model (${formatModelName(models, currentModelId)})`
                    : 'Current session model'}
                </SelectItem>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-fd-tertiary">
              Droid stores this as the session compaction model before compressing.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving ? 'Compressing...' : 'Compress session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function formatModelName(models: LiveSessionModel[], modelId: string): string {
  return models.find((model) => model.id === modelId)?.name ?? modelId
}
