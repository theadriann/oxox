import { motion, useReducedMotion } from 'framer-motion'
import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  DaemonConnectionStatus,
  SessionSearchIndexingProgress,
} from '../../../../shared/ipc/contracts'
import { useTimeTick } from '../../hooks/useTimeTick'
import { createStatusDotTarget } from '../../lib/motion'
import { formatAbsoluteSessionTime, toTimestamp } from '../../lib/sessionTime'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

export interface StatusBarProps {
  daemonStatus: DaemonConnectionStatus
  connectedPort: number | null
  nextRetryDelayMs: number | null
  activeSessionCount: number
  lastSyncAt: string | null
  droidCliVersion: string | null
  searchIndexingProgress?: SessionSearchIndexingProgress | null
  updateStatusLabel?: string | null
  notificationTray?: ReactNode
  now?: number
}

const DAEMON_STATUS_META: Record<
  DaemonConnectionStatus,
  {
    indicatorClassName: string
    label: string
  }
> = {
  connected: {
    indicatorClassName: 'bg-fd-ready',
    label: 'Connected',
  },
  disconnected: {
    indicatorClassName: 'bg-fd-danger',
    label: 'Disconnected',
  },
  reconnecting: {
    indicatorClassName: 'bg-fd-warning',
    label: 'Reconnecting',
  },
}

export function StatusBar({
  daemonStatus,
  connectedPort,
  activeSessionCount,
  lastSyncAt,
  droidCliVersion,
  now,
  nextRetryDelayMs,
  notificationTray,
  searchIndexingProgress,
  updateStatusLabel,
}: StatusBarProps) {
  const prefersReducedMotion = useReducedMotion()
  const daemonMeta = DAEMON_STATUS_META[daemonStatus]
  const daemonDetail = getDaemonDetailLabel(daemonStatus, connectedPort, nextRetryDelayMs)

  return (
    <footer
      className="ox-status-bar flex h-6 shrink-0 items-center justify-between gap-2 overflow-hidden border-t border-fd-border-subtle bg-fd-surface px-3 text-[11px] text-fd-tertiary"
      data-testid="global-status-bar"
    >
      <div className="flex min-w-0 items-center gap-4">
        <span className="ox-status-daemon flex min-w-0 items-center gap-1.5" title={daemonDetail}>
          <motion.span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${daemonMeta.indicatorClassName}`}
            data-testid="daemon-status-indicator"
            animate={createStatusDotTarget(prefersReducedMotion)}
            initial={{
              opacity: prefersReducedMotion ? 1 : 0.72,
              scale: prefersReducedMotion ? 1 : 0.8,
            }}
          />
          {daemonMeta.label}
          {connectedPort ? ` :${connectedPort}` : ''}
        </span>

        <span className="ox-status-detail text-fd-border-strong">|</span>

        <span className="ox-status-detail">
          {activeSessionCount} active session{activeSessionCount !== 1 ? 's' : ''}
        </span>

        <span className="ox-status-detail text-fd-border-strong">|</span>

        <LastSyncText className="ox-status-detail" lastSyncAt={lastSyncAt} now={now} />

        <SearchIndexingProgress progress={searchIndexingProgress} />
      </div>

      <div className="flex min-w-0 items-center gap-4">
        {notificationTray}
        <StatusBarDetailsPopover
          activeSessionCount={activeSessionCount}
          daemonDetail={daemonDetail}
          daemonLabel={daemonMeta.label}
          droidCliVersion={droidCliVersion}
          lastSyncAt={lastSyncAt}
          nextRetryDelayMs={nextRetryDelayMs}
          now={now}
          updateStatusLabel={updateStatusLabel}
        />
        {updateStatusLabel ? (
          <span className="ox-status-update truncate">{updateStatusLabel}</span>
        ) : null}
        {droidCliVersion ? (
          <span className="ox-status-version font-mono" title={droidCliVersion}>
            droid {droidCliVersion}
          </span>
        ) : null}
      </div>
    </footer>
  )
}

function SearchIndexingProgress({ progress }: { progress?: SessionSearchIndexingProgress | null }) {
  if (!progress || progress.totalSessions <= 0 || !progress.isIndexing) {
    return null
  }

  const percent = Math.round((progress.indexedSessions / progress.totalSessions) * 100)

  return (
    <>
      <span className="ox-status-detail text-fd-border-strong">|</span>
      <span
        className="ox-status-detail flex items-center gap-1.5"
        title={`${progress.indexedSessions} of ${progress.totalSessions} sessions indexed for search`}
      >
        <span>
          Indexing {progress.indexedSessions}/{progress.totalSessions}
        </span>
        <span
          aria-label="Session search indexing"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="h-1 w-16 overflow-hidden rounded-full bg-fd-border-subtle"
          role="progressbar"
        >
          <span
            className="block h-full rounded-full bg-fd-ember-500"
            data-testid="search-indexing-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </span>
      </span>
    </>
  )
}

function LastSyncText({
  className,
  lastSyncAt,
  now,
}: {
  className?: string
  lastSyncAt: string | null
  now?: number
}) {
  const liveNow = useTimeTick()

  return (
    <span
      className={className}
      title={lastSyncAt ? formatAbsoluteSessionTime(lastSyncAt) : undefined}
    >
      Sync: {formatStatusBarRelativeTime(lastSyncAt, now ?? liveNow)}
    </span>
  )
}

function StatusBarDetailsPopover({
  activeSessionCount,
  daemonDetail,
  daemonLabel,
  droidCliVersion,
  lastSyncAt,
  nextRetryDelayMs,
  now,
  updateStatusLabel,
}: {
  activeSessionCount: number
  daemonDetail: string
  daemonLabel: string
  droidCliVersion: string | null
  lastSyncAt: string | null
  nextRetryDelayMs: number | null
  now?: number
  updateStatusLabel?: string | null
}) {
  const liveNow = useTimeTick()
  const resolvedNow = now ?? liveNow

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="ox-status-more xl:hidden"
          aria-label="Show status details"
        >
          <Info className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 gap-2">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[11px]">
          <dt className="text-fd-tertiary">Daemon</dt>
          <dd className="truncate text-fd-primary" title={daemonDetail}>
            {daemonLabel}
          </dd>
          <dt className="text-fd-tertiary">Active</dt>
          <dd className="text-fd-primary">{activeSessionCount} sessions</dd>
          <dt className="text-fd-tertiary">Sync</dt>
          <dd className="text-fd-primary">
            {formatStatusBarRelativeTime(lastSyncAt, resolvedNow)}
          </dd>
          {nextRetryDelayMs ? (
            <>
              <dt className="text-fd-tertiary">Retry</dt>
              <dd className="text-fd-primary">{Math.ceil(nextRetryDelayMs / 1000)}s</dd>
            </>
          ) : null}
          {updateStatusLabel ? (
            <>
              <dt className="text-fd-tertiary">Update</dt>
              <dd className="truncate text-fd-primary" title={updateStatusLabel}>
                {updateStatusLabel}
              </dd>
            </>
          ) : null}
          {droidCliVersion ? (
            <>
              <dt className="text-fd-tertiary">CLI</dt>
              <dd className="truncate font-mono text-fd-primary" title={droidCliVersion}>
                droid {droidCliVersion}
              </dd>
            </>
          ) : null}
        </dl>
      </PopoverContent>
    </Popover>
  )
}

function getDaemonDetailLabel(
  status: DaemonConnectionStatus,
  connectedPort: number | null,
  nextRetryDelayMs: number | null,
): string {
  if (status === 'connected') {
    return connectedPort ? `Daemon live on :${connectedPort}` : 'Daemon live'
  }

  if (status === 'reconnecting') {
    if (nextRetryDelayMs && nextRetryDelayMs > 0) {
      return `Retrying in ${Math.ceil(nextRetryDelayMs / 1000)}s`
    }

    return 'Retrying shortly'
  }

  return 'Artifacts fallback'
}

export function formatStatusBarRelativeTime(
  value: string | null | undefined,
  now = Date.now(),
): string {
  const timestamp = toTimestamp(value)

  if (timestamp <= 0) {
    return 'never'
  }

  const diffSeconds = Math.max(0, Math.round((now - timestamp) / 1000))

  if (diffSeconds < 5) {
    return 'just now'
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`
  }

  const diffMinutes = Math.round(diffSeconds / 60)

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.round(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}
