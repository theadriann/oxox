import { AlertTriangle, Check, Copy, Layers3 } from 'lucide-react'
import {
  memo,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useState,
} from 'react'

import type { LiveSessionEventRecord, LiveSessionSnapshot } from '../../../../shared/ipc/contracts'
import { useTimeTick } from '../../hooks/useTimeTick'
import { formatAbsoluteSessionTime, formatElapsedDuration } from '../../lib/sessionTime'
import type { SessionPreview } from '../../stores/SessionStore'
import { Button } from '../ui/button'
import { SkeletonBlock } from '../ui/skeleton'
import { StateCard } from '../ui/state-card'

export interface ContextPanelProps {
  selectedSession?: SessionPreview
  liveSession: LiveSessionSnapshot | null
  isLoading?: boolean
  errorState?: {
    title: string
    description: string
    actionLabel: string
    onAction: () => void
  }
  now?: number
  onBrowseSessions?: () => void
  panelRef?: RefObject<HTMLElement | null>
  width: number
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
}

type TokenUsageSnapshot = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  thinkingTokens: number
}

const CONTEXT_PANEL_SKELETON_IDS = [
  'context-panel-skeleton-a',
  'context-panel-skeleton-b',
  'context-panel-skeleton-c',
]

export function ContextPanel({
  selectedSession,
  liveSession,
  isLoading = false,
  errorState,
  now,
  onBrowseSessions,
  panelRef,
  width,
  onResizeStart,
}: ContextPanelProps) {
  const latestTokenUsage = getLatestTokenUsage(liveSession?.events ?? [])
  const liveModelId =
    liveSession?.settings.modelId ?? liveSession?.availableModels[0]?.id ?? selectedSession?.modelId
  const currentStatus = liveSession?.status ?? selectedSession?.status ?? 'idle'
  const totalTokens = latestTokenUsage
    ? latestTokenUsage.inputTokens +
      latestTokenUsage.outputTokens +
      latestTokenUsage.cacheReadTokens +
      latestTokenUsage.thinkingTokens
    : 0

  return (
    <aside
      aria-label="Context panel"
      className="oxox-context-panel-shell overflow-hidden rounded-lg border border-fd-border-default bg-fd-surface"
      data-panel-width={width}
      ref={panelRef}
    >
      <div
        aria-label="Resize context panel"
        className="oxox-context-panel-resize-handle"
        role="separator"
        onPointerDown={onResizeStart}
      />

      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-fd-border-subtle px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
            Session Details
          </p>
          {selectedSession ? (
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                liveSession
                  ? 'bg-fd-session-active/15 text-fd-session-active'
                  : 'bg-fd-panel text-fd-tertiary'
              }`}
            >
              {liveSession ? 'Live' : 'Static'}
            </span>
          ) : null}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="flex flex-col gap-3">
              {CONTEXT_PANEL_SKELETON_IDS.map((skeletonId) => (
                <div key={skeletonId} className="flex flex-col gap-1">
                  <SkeletonBlock className="h-2 w-1/4" />
                  <SkeletonBlock className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ) : errorState ? (
          <div className="flex flex-1 items-center px-3 py-3">
            <StateCard
              icon={AlertTriangle}
              eyebrow="Recovery"
              title={errorState.title}
              description={errorState.description}
              actions={
                <Button type="button" onClick={errorState.onAction}>
                  {errorState.actionLabel}
                </Button>
              }
              className="w-full"
            />
          </div>
        ) : !selectedSession ? (
          <div className="flex flex-1 items-center px-3 py-3">
            <StateCard
              icon={Layers3}
              eyebrow="Context"
              title="No session selected"
              description="Pick a session from the sidebar to see its metadata, workspace info, and live token usage here."
              actions={
                onBrowseSessions ? (
                  <Button type="button" variant="secondary" onClick={onBrowseSessions}>
                    Browse sessions
                  </Button>
                ) : null
              }
              className="w-full"
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-2.5">
            <div className="flex flex-col gap-3">
              {/* Identity */}
              <DetailSection title="Identity">
                <DetailField label="Title" value={liveSession?.title ?? selectedSession.title} />
                <DetailFieldCopyable label="Session ID" value={selectedSession.id} mono />
              </DetailSection>

              {/* Workspace */}
              <DetailSection title="Workspace">
                <DetailField label="Project" value={selectedSession.projectLabel} />
                <DetailFieldCopyable
                  label="Path"
                  value={
                    liveSession?.projectWorkspacePath ??
                    selectedSession.projectWorkspacePath ??
                    'Unavailable'
                  }
                  mono
                />
              </DetailSection>

              {/* Status */}
              <DetailSection title="Status">
                <DetailField
                  label="Current"
                  value={formatStatusLabel(currentStatus)}
                  badge={currentStatus === 'active' ? 'live' : undefined}
                />
                <DetailField label="Model" value={liveModelId ?? 'Unavailable'} />
              </DetailSection>

              {/* Timeline */}
              <DetailSection title="Timeline">
                <DetailField
                  label="Created"
                  value={formatAbsoluteSessionTime(selectedSession.createdAt)}
                />
                <DetailField
                  label="Last activity"
                  value={formatAbsoluteSessionTime(
                    selectedSession.lastActivityAt ?? selectedSession.updatedAt,
                  )}
                />
                {liveSession ? (
                  <ElapsedDetailField createdAt={selectedSession.createdAt} now={now} />
                ) : null}
              </DetailSection>

              {/* Token usage */}
              {liveSession && latestTokenUsage ? (
                <DetailSection title="Token usage">
                  <div className="rounded-md border border-fd-border-subtle bg-fd-panel/50 p-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] text-fd-tertiary">Total</span>
                      <span className="font-mono text-xs font-medium tabular-nums text-fd-primary">
                        {totalTokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                      <TokenMetric label="Input" value={latestTokenUsage.inputTokens} />
                      <TokenMetric label="Output" value={latestTokenUsage.outputTokens} />
                      <TokenMetric label="Cache" value={latestTokenUsage.cacheReadTokens} />
                      <TokenMetric label="Thinking" value={latestTokenUsage.thinkingTokens} />
                    </div>
                  </div>
                </DetailSection>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-fd-tertiary">
        {title}
      </p>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

function DetailField({ label, value, badge }: { label: string; value: string; badge?: 'live' }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1 py-1">
      <span className="shrink-0 text-[11px] text-fd-tertiary">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-right text-[11px] text-fd-primary">{value}</span>
        {badge === 'live' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-fd-session-active/20 px-1.5 py-0.5 text-[9px] text-fd-session-active">
            <span className="size-1 animate-pulse rounded-full bg-fd-session-active" />
            live
          </span>
        ) : null}
      </div>
    </div>
  )
}

function ElapsedDetailField({ createdAt, now }: { createdAt: string; now?: number }) {
  const liveNow = useTimeTick()

  return <DetailField label="Elapsed" value={formatElapsedDuration(createdAt, now ?? liveNow)} />
}

const DetailFieldCopyable = memo(function DetailFieldCopyable({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [value])

  return (
    <div className="group/copy flex flex-col gap-0.5 rounded-md px-1 py-1 transition-colors hover:bg-white/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-fd-tertiary">{label}</span>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          className={`inline-flex size-4 shrink-0 items-center justify-center rounded transition-all ${
            copied
              ? 'text-fd-ready'
              : 'text-fd-tertiary opacity-0 hover:text-fd-primary group-hover/copy:opacity-100'
          }`}
          onClick={handleCopy}
        >
          {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
        </button>
      </div>
      <p
        className={`min-w-0 break-all text-[11px] leading-snug text-fd-primary ${mono ? 'font-mono text-[10px]' : ''}`}
      >
        {value}
      </p>
    </div>
  )
})

function TokenMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-fd-tertiary">{label}</span>
      <span className="font-mono text-[10px] tabular-nums text-fd-secondary">
        {value.toLocaleString()}
      </span>
    </div>
  )
}

function formatStatusLabel(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ')
}

function getLatestTokenUsage(events: LiveSessionEventRecord[]): TokenUsageSnapshot | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]

    if (event?.type !== 'session.tokenUsageChanged') {
      continue
    }

    const tokenUsage =
      event.tokenUsage && typeof event.tokenUsage === 'object'
        ? (event.tokenUsage as Record<string, unknown>)
        : {}

    return {
      inputTokens: toSafeNumber(tokenUsage.inputTokens),
      outputTokens: toSafeNumber(tokenUsage.outputTokens),
      cacheReadTokens: toSafeNumber(tokenUsage.cacheReadTokens),
      thinkingTokens: toSafeNumber(tokenUsage.thinkingTokens),
    }
  }

  return null
}

function toSafeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
