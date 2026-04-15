import { Archive, FolderClosed, RotateCcw } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { memo, useCallback } from 'react'

import { formatRelativeSessionTime } from '../../lib/sessionTime'
import type { ProjectSessionGroup, SessionPreview } from '../../stores/SessionStore'
import { useSessionStore } from '../../stores/StoreProvider'
import { Button } from '../ui/button'
import { StateCard } from '../ui/state-card'

export const ArchiveSettings = observer(function ArchiveSettings() {
  const sessionStore = useSessionStore()
  const archivedProjects = sessionStore.archivedProjects
  const archivedSessions = sessionStore.archivedSessions
  const hasArchived = archivedProjects.length > 0 || archivedSessions.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-fd-primary">Archive</h2>
        <p className="mt-0.5 text-xs text-fd-tertiary">
          Archived projects and sessions are hidden from the sidebar but can be restored at any
          time.
        </p>
      </div>

      {!hasArchived ? (
        <StateCard
          icon={Archive}
          eyebrow="Archive"
          title="Nothing archived yet"
          description="When you archive projects or sessions from the sidebar, they will appear here."
        />
      ) : null}

      {archivedProjects.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fd-tertiary">
            Archived projects ({archivedProjects.length})
          </h3>
          <div className="flex flex-col divide-y divide-fd-border-subtle rounded-lg border border-fd-border-default bg-fd-surface">
            {archivedProjects.map((project) => (
              <ArchivedProjectRow
                key={project.key}
                project={project}
                onUnarchive={sessionStore.unarchiveProject}
              />
            ))}
          </div>
        </div>
      ) : null}

      {archivedSessions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fd-tertiary">
            Archived sessions ({archivedSessions.length})
          </h3>
          <div className="flex flex-col divide-y divide-fd-border-subtle rounded-lg border border-fd-border-default bg-fd-surface">
            {archivedSessions.map((session) => (
              <ArchivedSessionRow
                key={session.id}
                session={session}
                onUnarchive={sessionStore.unarchiveSession}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
})

const ArchivedProjectRow = memo(function ArchivedProjectRow({
  project,
  onUnarchive,
}: {
  project: ProjectSessionGroup
  onUnarchive: (key: string) => void
}) {
  const handleUnarchive = useCallback(() => {
    onUnarchive(project.key)
  }, [onUnarchive, project.key])

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <FolderClosed className="size-4 shrink-0 text-fd-tertiary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-fd-primary">{project.label}</p>
        <div className="flex items-center gap-2">
          {project.workspacePath ? (
            <p className="truncate text-[11px] text-fd-tertiary">{project.workspacePath}</p>
          ) : null}
          <span className="shrink-0 text-[10px] tabular-nums text-fd-tertiary">
            {project.sessions.length} session{project.sessions.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      <Button type="button" size="xs" variant="secondary" onClick={handleUnarchive}>
        <RotateCcw className="size-3" />
        Unarchive
      </Button>
    </div>
  )
})

const ArchivedSessionRow = memo(function ArchivedSessionRow({
  session,
  onUnarchive,
}: {
  session: SessionPreview
  onUnarchive: (id: string) => void
}) {
  const handleUnarchive = useCallback(() => {
    onUnarchive(session.id)
  }, [onUnarchive, session.id])

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Archive className="size-3.5 shrink-0 text-fd-tertiary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-fd-primary">{session.title}</p>
        <div className="flex items-center gap-2">
          <span className="truncate text-[11px] text-fd-tertiary">{session.projectLabel}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-fd-tertiary">
            {formatRelativeSessionTime(session.lastActivityAt ?? session.updatedAt, Date.now())}
          </span>
        </div>
      </div>
      <Button type="button" size="xs" variant="secondary" onClick={handleUnarchive}>
        <RotateCcw className="size-3" />
        Unarchive
      </Button>
    </div>
  )
})
