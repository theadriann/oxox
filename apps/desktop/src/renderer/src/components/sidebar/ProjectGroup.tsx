import { Folder01Icon, Folder02Icon, PencilEdit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Archive, ChevronRight, Ellipsis, FolderPlus, PencilLine } from 'lucide-react'
import type { DragEvent } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { SessionSidebarStore } from './SessionSidebarStore'

export interface ProjectGroupHeader {
  key: string
  label: string
  workspacePath: string | null
  sessionCount: number
}

interface ProjectGroupProps {
  group: ProjectGroupHeader
  collapsed: boolean
  store: SessionSidebarStore
  onToggleProject: (projectKey: string) => void
  onNewSession: (workspacePath?: string, folderId?: string | null) => void
  onArchiveProject?: (projectKey: string) => void
  onCreateFolder?: (projectKey: string, parentFolderId?: string | null) => void
  onDropSessionToProject?: (sessionId: string, projectKey: string) => void
  onDropFolderToProject?: (folderId: string, projectKey: string) => void
}

export function ProjectGroup({
  group,
  collapsed,
  store,
  onToggleProject,
  onNewSession,
  onArchiveProject,
  onCreateFolder,
  onDropSessionToProject,
  onDropFolderToProject,
}: ProjectGroupProps) {
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
            className="size-3.5 shrink-0 text-fd-tertiary"
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
