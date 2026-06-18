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

interface ProjectRenameDialogProps {
  open: boolean
  draft: string
  projectLabel: string
  workspacePath: string | null
  onDraftChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}

interface FolderCreateDialogProps {
  open: boolean
  draft: string
  onDraftChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}

interface FolderRenameDialogProps {
  open: boolean
  draft: string
  folderName: string
  onDraftChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}

interface SidebarNameDialogProps {
  open: boolean
  title: string
  description: string
  label: string
  inputId: string
  draft: string
  submitLabel: string
  onDraftChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}

export function ProjectRenameDialog({
  open,
  draft,
  projectLabel,
  workspacePath,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: ProjectRenameDialogProps) {
  return (
    <SidebarNameDialog
      open={open}
      title="Rename Project"
      description={
        workspacePath
          ? `Update the display name for ${workspacePath}.`
          : `Update the display name for ${projectLabel}.`
      }
      label="Project name"
      inputId="project-rename-input"
      draft={draft}
      submitLabel="Save project name"
      onDraftChange={onDraftChange}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />
  )
}

export function FolderCreateDialog({
  open,
  draft,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: FolderCreateDialogProps) {
  return (
    <SidebarNameDialog
      open={open}
      title="Create Folder"
      description="Create a session folder in the selected project."
      label="Folder name"
      inputId="folder-create-input"
      draft={draft}
      submitLabel="Create folder"
      onDraftChange={onDraftChange}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />
  )
}

export function FolderRenameDialog({
  open,
  draft,
  folderName,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: FolderRenameDialogProps) {
  return (
    <SidebarNameDialog
      open={open}
      title="Rename Folder"
      description={`Update the folder name for ${folderName}.`}
      label="Folder name"
      inputId="folder-rename-input"
      draft={draft}
      submitLabel="Save folder name"
      onDraftChange={onDraftChange}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />
  )
}

function SidebarNameDialog({
  open,
  title,
  description,
  label,
  inputId,
  draft,
  submitLabel,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: SidebarNameDialogProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (draft.trim().length === 0) {
      return
    }

    onSubmit()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[28rem]">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>{label}</Label>
            <Input
              id={inputId}
              autoFocus
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={draft.trim().length === 0} type="submit">
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
