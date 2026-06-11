import { AlertTriangle, GitCommitHorizontal, GitPullRequest, RefreshCw, Upload } from 'lucide-react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

import type { GitDiffResponse } from '../../../../shared/ipc/contracts'
import { Button } from '../ui/button'
import { SkeletonBlock } from '../ui/skeleton'
import { StateCard } from '../ui/state-card'

interface GitDiffPanelProps {
  selectedSessionId: string | null
  diff: GitDiffResponse | null
  isLoading: boolean
  isActionRunning: boolean
  error?: string | null
  panelRef?: RefObject<HTMLElement | null>
  width?: number
  onResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void
  onRefresh: () => void
  onCommit: () => void
  onPush: () => void
  onCreatePullRequest: () => void
}

export function GitDiffPanel({
  selectedSessionId,
  diff,
  isLoading,
  isActionRunning,
  error,
  panelRef,
  width,
  onResizeStart,
  onRefresh,
  onCommit,
  onPush,
  onCreatePullRequest,
}: GitDiffPanelProps) {
  const hasDiff = diff?.success === true
  const files = hasDiff ? diff.data.files : []
  const canCommit = !hasDiff || diff.data.canCommit !== false
  const canPush = !hasDiff || diff.data.canPush !== false
  const canCreatePullRequest = !hasDiff || diff.data.canCreatePullRequest !== false

  return (
    <aside
      aria-label="Git diff panel"
      className="oxox-context-panel-shell h-full min-h-0 overflow-hidden rounded-lg border border-fd-border-default bg-fd-surface"
      data-panel-width={width}
      ref={panelRef}
    >
      {onResizeStart ? (
        <div
          aria-label="Resize context panel"
          className="oxox-context-panel-resize-handle"
          role="separator"
          onPointerDown={onResizeStart}
        />
      ) : null}

      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-fd-border-subtle px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
            Git Diff
          </p>
          <Button
            aria-label="Refresh git diff"
            className="size-7"
            disabled={!selectedSessionId || isLoading}
            size="icon"
            type="button"
            variant="ghost"
            onClick={onRefresh}
          >
            <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!selectedSessionId ? (
            <StateCard
              icon={GitPullRequest}
              eyebrow="Git"
              title="No session selected"
              description="Select a session with a git workspace to inspect changes and create a pull request."
            />
          ) : isLoading && !diff ? (
            <div className="flex flex-col gap-3">
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-20 w-full" />
              <SkeletonBlock className="h-20 w-full" />
            </div>
          ) : error ? (
            <StateCard
              icon={AlertTriangle}
              eyebrow="Git"
              title="Could not load git diff"
              description={error}
              actions={
                <Button type="button" variant="secondary" onClick={onRefresh}>
                  Retry
                </Button>
              }
            />
          ) : diff && !diff.success ? (
            <StateCard
              icon={AlertTriangle}
              eyebrow={diff.unavailableReason.replaceAll('_', ' ')}
              title="Git diff unavailable"
              description={diff.unavailableMessage}
            />
          ) : hasDiff ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border border-fd-border-subtle bg-fd-panel p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fd-primary">
                      {diff.data.branch}
                    </p>
                    <p className="mt-0.5 text-[11px] text-fd-tertiary">
                      Base: {diff.data.baseBranch}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 font-mono text-xs">
                    <span className="text-fd-session-active">+{diff.data.totalAdditions}</span>
                    <span className="text-fd-danger">-{diff.data.totalDeletions}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                {files.map((file) => (
                  <div
                    key={file.path}
                    className="rounded border border-fd-border-subtle bg-fd-panel/70 px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs text-fd-secondary">
                        {file.path}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-fd-tertiary">
                        +{file.additions} / -{file.deletions}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                <Button
                  aria-label="Commit changes"
                  disabled={isActionRunning || !canCommit}
                  type="button"
                  variant="secondary"
                  onClick={onCommit}
                >
                  <GitCommitHorizontal className="size-3.5" />
                  Commit changes
                </Button>
                <Button
                  aria-label="Push branch"
                  disabled={isActionRunning || !canPush}
                  type="button"
                  variant="secondary"
                  onClick={onPush}
                >
                  <Upload className="size-3.5" />
                  Push branch
                </Button>
                <Button
                  aria-label="Create pull request"
                  disabled={isActionRunning || !canCreatePullRequest}
                  type="button"
                  onClick={onCreatePullRequest}
                >
                  <GitPullRequest className="size-3.5" />
                  Create pull request
                </Button>
                {diff.data.commitUnavailableMessage ? (
                  <p className="text-[11px] text-fd-tertiary">
                    {diff.data.commitUnavailableMessage}
                  </p>
                ) : null}
                {diff.data.pushUnavailableMessage ? (
                  <p className="text-[11px] text-fd-tertiary">{diff.data.pushUnavailableMessage}</p>
                ) : null}
                {diff.data.createPullRequestUnavailableMessage ? (
                  <p className="text-[11px] text-fd-tertiary">
                    {diff.data.createPullRequestUnavailableMessage}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <StateCard
              icon={GitPullRequest}
              eyebrow="Git"
              title="No git diff loaded"
              description="Refresh this panel to load git changes for the selected session."
              actions={
                <Button type="button" onClick={onRefresh}>
                  Refresh diff
                </Button>
              }
            />
          )}
        </div>
      </div>
    </aside>
  )
}
