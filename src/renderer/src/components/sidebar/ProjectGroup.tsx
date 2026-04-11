import {
  Archive,
  Check,
  Ellipsis,
  FolderClosed,
  FolderOpen,
  PencilLine,
  Plus,
  X,
} from 'lucide-react'

import type { ProjectSessionGroup } from '../../stores/SessionStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { SessionSidebarStore } from './SessionSidebarStore'

interface ProjectGroupProps {
  group: ProjectSessionGroup
  collapsed: boolean
  isEditing: boolean
  store: SessionSidebarStore
  onToggleProject: (projectKey: string) => void
  onNewSession: (workspacePath?: string) => void
  onSetProjectDisplayName: (projectKey: string, value: string) => void
  onArchiveProject?: (projectKey: string) => void
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
}: ProjectGroupProps) {
  if (isEditing) {
    return (
      <div className="group/header flex items-center gap-1 py-1" data-project-group={group.key}>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-fd-border-default bg-fd-panel px-2 py-1.5">
          <PencilLine className="size-3 shrink-0 text-fd-ember-400" aria-hidden="true" />
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
              className="inline-flex size-5 items-center justify-center rounded text-fd-primary transition-colors hover:bg-fd-elevated"
              type="button"
              onClick={() => store.submitProjectDisplayName(group.key, onSetProjectDisplayName)}
            >
              <Check className="size-3" />
            </button>
            <button
              aria-label="Cancel project name edit"
              className="inline-flex size-5 items-center justify-center rounded text-fd-secondary transition-colors hover:bg-fd-elevated hover:text-fd-primary"
              type="button"
              onClick={store.cancelProjectEditing}
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const FolderIcon = collapsed ? FolderClosed : FolderOpen

  return (
    <div className="group/header py-0.5" data-project-group={group.key}>
      <div className="flex w-full items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-fd-panel">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-canvas"
          type="button"
          onClick={() => onToggleProject(group.key)}
        >
          <FolderIcon
            className={`size-3.5 shrink-0 ${collapsed ? 'text-fd-tertiary' : 'text-fd-secondary'}`}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold text-fd-secondary">
              {group.label}
            </span>
            {group.workspacePath ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block truncate text-[10px] text-fd-tertiary/70">
                    {group.workspacePath}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="break-all font-mono text-[11px]">{group.workspacePath}</p>
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </button>
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            aria-label={`Create session in ${group.label}`}
            className="inline-flex size-5 items-center justify-center rounded text-fd-tertiary opacity-0 transition-all hover:bg-white/[0.06] hover:text-fd-primary group-hover/header:opacity-100"
            type="button"
            onClick={() => onNewSession(group.workspacePath ?? undefined)}
          >
            <Plus className="size-3" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`More actions for ${group.label}`}
                className="inline-flex size-5 items-center justify-center rounded text-fd-tertiary opacity-0 transition-all hover:bg-white/[0.06] hover:text-fd-primary group-hover/header:opacity-100"
                type="button"
              >
                <Ellipsis className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[170px]">
              <DropdownMenuItem onClick={() => store.startEditingProject(group)}>
                <PencilLine className="size-3" />
                Rename workspace
              </DropdownMenuItem>
              {onArchiveProject ? (
                <DropdownMenuItem onClick={() => onArchiveProject(group.key)}>
                  <Archive className="size-3" />
                  Archive project
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="min-w-[1.5rem] text-right text-[10px] tabular-nums text-fd-tertiary">
            {group.sessions.length}
          </span>
        </span>
      </div>
    </div>
  )
}

function toIdentifier(value: string): string {
  return (
    value
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'item'
  )
}
