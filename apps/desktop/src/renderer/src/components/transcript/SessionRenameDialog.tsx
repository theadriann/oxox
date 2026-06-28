import type { FormEvent } from 'react'

import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface SessionRenameDialogProps {
  open: boolean
  draft: string
  isSaving: boolean
  onDraftChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}

export function SessionRenameDialog({
  open,
  draft,
  isSaving,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: SessionRenameDialogProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSaving || draft.trim().length === 0) {
      return
    }

    onSubmit()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[28rem]">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename Session</DialogTitle>
            <DialogDescription>
              Update the selected session name through the Factory daemon.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="session-rename-input">Session name</Label>
            <Input
              id="session-rename-input"
              autoFocus
              disabled={isSaving}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={isSaving || draft.trim().length === 0} type="submit">
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
