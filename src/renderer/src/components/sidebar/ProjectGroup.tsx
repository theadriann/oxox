import {
  Archive,
  Check,
  ChevronRight,
  Ellipsis,
  FolderPlus,
  PencilLine,
  Plus,
  X,
} from 'lucide-react'
import type { DragEvent } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { SessionSidebarStore } from './SessionSidebarStore'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  FolderOpenIcon,
  PencilEdit02Icon,
  Folder01Icon,
  Folder02Icon,
} from '@hugeicons/core-free-icons'

export interface ProjectGroupHeader {
  key: string
  label: string
  workspacePath: string | null
  sessionCount: number
}

interface ProjectGroupProps {
  group: ProjectGroupHeader
  collapsed: boolean
  isEditing: boolean
  store: SessionSidebarStore
  onToggleProject: (projectKey: string) => void
  onNewSession: (workspacePath?: string, folderId?: string | null) => void
  onSetProjectDisplayName: (projectKey: string, value: string) => void
  onArchiveProject?: (projectKey: string) => void
  onCreateFolder?: (projectKey: string, parentFolderId?: string | null) => void
  onDropSessionToProject?: (sessionId: string, projectKey: string) => void
  onDropFolderToProject?: (folderId: string, projectKey: string) => void
}

export function ProjectGroup({
  group,
  collapsed,
  isEditing,
  store,
  onToggleProject,
  onNewSession,
  onSetProjectDisplayName,
  onArchiveProject,
  onCreateFolder,
  onDropSessionToProject,
  onDropFolderToProject,
}: ProjectGroupProps) {
  if (isEditing) {
    return (
      <div className="group/header flex items-center gap-1 py-1" data-project-group={group.key}>
        <div className="ox-elevated flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2.5 py-2">
          <PencilLine className="size-3.5 shrink-0 text-fd-ember-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor={`project-display-name-${toIdentifier(group.key)}`}>
              Project display name for {group.label}
            </label>
            <input
              id={`project-display-name-${toIdentifier(group.key)}`}
              aria-label={`Project display name for ${group.label}`}
              className="w-full rounded border border-fd-border-default bg-fd-surface px-2 py-1 text-xs text-fd-primary outline-none transition-colors focus:border-fd-ember-400"
              value={store.draftProjectName}
              onChange={(event) => store.setDraftProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  store.submitProjectDisplayName(group.key, onSetProjectDisplayName)
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  store.cancelProjectEditing()
                }
              }}
            />
            {group.workspacePath ? (
              <span className="mt-0.5 block truncate text-[10px] text-fd-tertiary">
                {group.workspacePath}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              aria-label="Save project name"
              className="ox-icon-button inline-flex size-6 items-center justify-center text-fd-primary"
              type="button"
              onClick={() => store.submitProjectDisplayName(group.key, onSetProjectDisplayName)}
            >
              <Check className="size-3.5" />
            </button>
            <button
              aria-label="Cancel project name edit"
              className="ox-icon-button inline-flex size-6 items-center justify-center text-fd-secondary"
              type="button"
              onClick={store.cancelProjectEditing}
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropSessionToProject && !onDropFolderToProject) return
    event.preventDefault()
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const dragPayload = parseSidebarDragPayload(event.dataTransfer.getData('text/plain'))
    if (!dragPayload) return

    event.preventDefault()
    if (dragPayload.kind === 'session') {
      onDropSessionToProject?.(dragPayload.id, group.key)
      return
    }

    onDropFolderToProject?.(dragPayload.id, group.key)
  }

  return (
    <div className="group/header py-0.5" data-project-group={group.key}>
      <div className="ox-sidebar-row flex w-full items-center gap-1 px-2">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-canvas"
          type="button"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => onToggleProject(group.key)}
        >
          <ChevronRight
            className={`size-3.5 shrink-0 text-fd-tertiary transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
            aria-hidden="true"
          />
          <HugeiconsIcon
            icon={collapsed ? Folder01Icon : Folder02Icon}
            className="size-3.5 shrink-0 text-fd-ember-300/80"
          />
          <div className="min-w-0 flex-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block truncate text-[12px] font-medium text-fd-secondary">
                  {group.label}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="break-all font-mono text-[11px]">{group?.workspacePath || ''}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </button>
        <span className="flex shrink-0 items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`More actions for ${group.label}`}
                className="ox-icon-button inline-flex size-6 items-center justify-center opacity-0 transition-all group-hover/header:opacity-100"
                type="button"
              >
                <Ellipsis className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[170px]">
              <DropdownMenuItem onClick={() => store.startEditingProject(group)}>
                <PencilLine className="size-3.5" />
                Rename workspace
              </DropdownMenuItem>
              {onCreateFolder ? (
                <DropdownMenuItem onClick={() => onCreateFolder(group.key, null)}>
                  <FolderPlus className="size-3.5" />
                  New folder
                </DropdownMenuItem>
              ) : null}
              {onArchiveProject ? (
                <DropdownMenuItem onClick={() => onArchiveProject(group.key)}>
                  <Archive className="size-3.5" />
                  Archive project
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            aria-label={`Create session in ${group.label}`}
            className="ox-icon-button inline-flex size-6 items-center justify-center opacity-0 transition-all group-hover/header:opacity-100"
            type="button"
            onClick={() => onNewSession(group.workspacePath ?? undefined)}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
          </button>
          <span className="group-hover/header:hidden min-w-[1.5rem] text-right text-[10px] tabular-nums text-fd-tertiary">
            {group.sessionCount}
          </span>
        </span>
      </div>
    </div>
  )
}

type SidebarDragPayload =
  | {
      kind: 'session'
      id: string
    }
  | {
      kind: 'folder'
      id: string
    }

function parseSidebarDragPayload(value: string): SidebarDragPayload | null {
  const [kind, id] = value.split(':')
  if ((kind === 'session' || kind === 'folder') && id) {
    return { kind, id }
  }

  return null
}

function toIdentifier(value: string): string {
  return (
    value
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'item'
  )
}
