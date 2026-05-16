import { AlertTriangle, Check, Copy, KeyRound, Layers3, Plus, Power, Trash2 } from 'lucide-react'
import {
  memo,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useState,
} from 'react'

import type {
  LiveSessionContextStatsInfo,
  LiveSessionEventRecord,
  LiveSessionMcpRegistryServerInfo,
  LiveSessionMcpServerInfo,
  LiveSessionMcpToolInfo,
  LiveSessionSkillInfo,
  LiveSessionSnapshot,
  LiveSessionToolInfo,
} from '../../../../shared/ipc/contracts'
import { useTimeTick } from '../../hooks/useTimeTick'
import { formatAbsoluteSessionTime, formatElapsedDuration } from '../../lib/sessionTime'
import { normalizeContextStats } from '../../stores/composerContextUsage'
import type { SessionPreview } from '../../stores/SessionStore'
import { Button } from '../ui/button'
import { SkeletonBlock } from '../ui/skeleton'
import { StateCard } from '../ui/state-card'

export interface ContextPanelProps {
  selectedSession?: SessionPreview
  liveSession: LiveSessionSnapshot | null
  runtimeCatalog?: {
    refreshError: string | null
    contextStats?: LiveSessionContextStatsInfo | null
    tools: LiveSessionToolInfo[]
    skills: LiveSessionSkillInfo[]
    mcpServers: LiveSessionMcpServerInfo[]
    mcpTools: LiveSessionMcpToolInfo[]
    mcpRegistry: LiveSessionMcpRegistryServerInfo[]
    updatingToolLlmId: string | null
    updatingMcpServerName: string | null
    updatingMcpToolKey: string | null
    onToggleTool?: (toolLlmId: string, allowed: boolean) => void
    onAddMcpServer?: (server: LiveSessionMcpRegistryServerInfo) => void
    onRemoveMcpServer?: (serverName: string) => void
    onToggleMcpServer?: (serverName: string, enabled: boolean) => void
    onAuthenticateMcpServer?: (serverName: string) => void
    onClearMcpAuth?: (serverName: string) => void
    onToggleMcpTool?: (serverName: string, toolName: string, enabled: boolean) => void
  }
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
  cacheCreationTokens: number
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
  runtimeCatalog,
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
      latestTokenUsage.cacheCreationTokens +
      latestTokenUsage.thinkingTokens
    : 0
  const contextStats = runtimeCatalog?.contextStats
    ? normalizeContextStats(runtimeCatalog.contextStats)
    : null
  const latestResult = getLatestResult(liveSession?.events ?? [])
  const latestMcpAuthRequest = getLatestMcpAuthRequest(liveSession?.events ?? [])

  return (
    <aside
      aria-label="Context panel"
      className="oxox-context-panel-shell h-full min-h-0 overflow-hidden rounded-lg border border-fd-border-default bg-fd-surface"
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

              {liveSession ? (
                <DetailSection title="Session settings">
                  <DetailField
                    label="Interaction"
                    value={formatSettingValue(liveSession.settings.interactionMode)}
                  />
                  <DetailField
                    label="Reasoning"
                    value={formatSettingValue(liveSession.settings.reasoningEffort)}
                  />
                  <DetailField
                    label="Autonomy"
                    value={formatSettingValue(
                      liveSession.settings.autonomyMode ?? liveSession.settings.autonomyLevel,
                    )}
                  />
                  <DetailField
                    label="Spec model"
                    value={formatSettingValue(liveSession.settings.specModeModelId)}
                  />
                  <DetailField
                    label="Spec reasoning"
                    value={formatSettingValue(liveSession.settings.specModeReasoningEffort)}
                  />
                </DetailSection>
              ) : null}

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
                <DetailSection title="Token processing">
                  <div className="rounded-md border border-fd-border-subtle bg-fd-panel/50 p-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] text-fd-tertiary">Total processed</span>
                      <span className="font-mono text-xs font-medium tabular-nums text-fd-primary">
                        {totalTokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                      <TokenMetric label="Input" value={latestTokenUsage.inputTokens} />
                      <TokenMetric label="Output" value={latestTokenUsage.outputTokens} />
                      <TokenMetric label="Cache read" value={latestTokenUsage.cacheReadTokens} />
                      <TokenMetric
                        label="Cache write"
                        value={latestTokenUsage.cacheCreationTokens}
                      />
                      <TokenMetric label="Thinking" value={latestTokenUsage.thinkingTokens} />
                    </div>
                    <p className="mt-1.5 text-[10px] leading-snug text-fd-quaternary">
                      Processing totals can include cache reads/writes and are separate from actual
                      context in use.
                    </p>
                  </div>
                </DetailSection>
              ) : null}

              {liveSession && contextStats ? (
                <DetailSection title="Context window">
                  <ContextStatsCard stats={contextStats} />
                </DetailSection>
              ) : null}

              {liveSession && latestResult ? (
                <DetailSection title="Latest result">
                  <ResultSummaryCard result={latestResult} />
                </DetailSection>
              ) : null}

              {liveSession && latestMcpAuthRequest ? (
                <DetailSection title="MCP authentication">
                  <McpAuthCard
                    request={latestMcpAuthRequest}
                    isUpdating={
                      runtimeCatalog?.updatingMcpServerName === latestMcpAuthRequest.serverName
                    }
                    onAuthenticate={runtimeCatalog?.onAuthenticateMcpServer}
                  />
                </DetailSection>
              ) : null}

              {liveSession && runtimeCatalog ? (
                <DetailSection title="Tool controls">
                  {runtimeCatalog.refreshError ? (
                    <p className="px-1 py-1 text-[11px] text-fd-danger">
                      {runtimeCatalog.refreshError}
                    </p>
                  ) : runtimeCatalog.tools.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {runtimeCatalog.tools.map((tool) => (
                        <ToolToggleRow
                          key={tool.id}
                          tool={tool}
                          isUpdating={runtimeCatalog.updatingToolLlmId === tool.llmId}
                          onToggle={runtimeCatalog.onToggleTool}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="px-1 py-1 text-[11px] text-fd-tertiary">
                      Attach to inspect the current tool catalog.
                    </p>
                  )}
                </DetailSection>
              ) : null}

              {liveSession && runtimeCatalog?.skills.length ? (
                <DetailSection title="Skills">
                  <div className="flex flex-col gap-1">
                    {runtimeCatalog.skills.map((skill) => (
                      <div
                        key={`${skill.location}:${skill.name}`}
                        className="flex items-center justify-between gap-2 px-1 py-1"
                      >
                        <span className="truncate text-[11px] text-fd-primary">{skill.name}</span>
                        <span className="rounded bg-fd-panel px-1.5 py-0.5 text-[9px] uppercase text-fd-tertiary">
                          {skill.location}
                        </span>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              ) : null}

              {liveSession && runtimeCatalog ? (
                <DetailSection title="MCP servers">
                  {runtimeCatalog.mcpServers?.length ? (
                    <div className="flex flex-col gap-1">
                      {runtimeCatalog.mcpServers.map((server) => (
                        <McpServerRow
                          key={server.name}
                          server={server}
                          isUpdating={runtimeCatalog.updatingMcpServerName === server.name}
                          onAuthenticate={runtimeCatalog.onAuthenticateMcpServer}
                          onClearAuth={runtimeCatalog.onClearMcpAuth}
                          onRemove={runtimeCatalog.onRemoveMcpServer}
                          onToggle={runtimeCatalog.onToggleMcpServer}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="px-1 py-1 text-[11px] text-fd-tertiary">
                      No MCP servers are configured for this session.
                    </p>
                  )}
                </DetailSection>
              ) : null}

              {liveSession && runtimeCatalog?.mcpTools?.length ? (
                <DetailSection title="MCP tools">
                  <div className="flex flex-col gap-1">
                    {runtimeCatalog.mcpTools.map((tool) => (
                      <McpToolRow
                        key={`${tool.serverName}:${tool.name}`}
                        tool={tool}
                        isUpdating={
                          runtimeCatalog.updatingMcpToolKey === `${tool.serverName}:${tool.name}`
                        }
                        onToggle={runtimeCatalog.onToggleMcpTool}
                      />
                    ))}
                  </div>
                </DetailSection>
              ) : null}

              {liveSession && runtimeCatalog?.mcpRegistry?.length ? (
                <DetailSection title="MCP registry">
                  <div className="flex flex-col gap-1">
                    {runtimeCatalog.mcpRegistry.slice(0, 6).map((server) => (
                      <McpRegistryRow
                        key={server.name}
                        server={server}
                        isInstalled={(runtimeCatalog.mcpServers ?? []).some(
                          (installed) => installed.name === server.name,
                        )}
                        isUpdating={runtimeCatalog.updatingMcpServerName === server.name}
                        onAdd={runtimeCatalog.onAddMcpServer}
                      />
                    ))}
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

function ContextStatsCard({ stats }: { stats: LiveSessionContextStatsInfo }) {
  const normalizedStats = normalizeContextStats(stats)

  if (!normalizedStats) {
    return null
  }

  const usedPercentage =
    normalizedStats.limit > 0 ? Math.round((normalizedStats.used / normalizedStats.limit) * 100) : 0
  const clampedPercentage = Math.max(0, Math.min(100, usedPercentage))

  return (
    <div className="rounded-md border border-fd-border-subtle bg-fd-panel/50 p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] text-fd-tertiary">
          {formatContextAccuracy(normalizedStats.accuracy)}
        </span>
        <span className="font-mono text-xs font-medium tabular-nums text-fd-primary">
          {clampedPercentage}% used
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fd-border-subtle">
        <div
          className="h-full rounded-full bg-fd-ember-400"
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] tabular-nums text-fd-secondary">
          {normalizedStats.used.toLocaleString()} used
        </span>
        <span className="font-mono text-[10px] tabular-nums text-fd-secondary">
          {normalizedStats.remaining.toLocaleString()} remaining
        </span>
      </div>
    </div>
  )
}

function ToolToggleRow({
  tool,
  isUpdating,
  onToggle,
}: {
  tool: LiveSessionToolInfo
  isUpdating: boolean
  onToggle?: (toolLlmId: string, allowed: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-fd-border-subtle bg-fd-panel/40 px-2 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-[11px] text-fd-primary">{tool.displayName}</p>
        <p className="text-[10px] text-fd-tertiary">
          {tool.currentlyAllowed ? 'Allowed' : 'Blocked'}
          {tool.defaultAllowed ? ' · default on' : ' · default off'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={tool.currentlyAllowed}
        aria-label={`Toggle ${tool.displayName} tool`}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          tool.currentlyAllowed ? 'bg-fd-ember-400' : 'bg-fd-tertiary/30'
        }`}
        disabled={isUpdating}
        onClick={() => onToggle?.(tool.llmId, !tool.currentlyAllowed)}
      >
        <span
          className={`pointer-events-none inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
            tool.currentlyAllowed ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  )
}

function McpServerRow({
  server,
  isUpdating,
  onAuthenticate,
  onClearAuth,
  onRemove,
  onToggle,
}: {
  server: LiveSessionMcpServerInfo
  isUpdating: boolean
  onAuthenticate?: (serverName: string) => void
  onClearAuth?: (serverName: string) => void
  onRemove?: (serverName: string) => void
  onToggle?: (serverName: string, enabled: boolean) => void
}) {
  const isEnabled = server.status !== 'disabled'

  return (
    <div className="rounded-md border border-fd-border-subtle bg-fd-panel/40 px-2 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-fd-primary">{server.name}</p>
          <p className="text-[10px] text-fd-tertiary">{formatMcpSummary(server)}</p>
          {server.error ? (
            <p className="mt-0.5 text-[10px] text-fd-danger">{server.error}</p>
          ) : null}
        </div>
        <span className="rounded bg-fd-surface px-1.5 py-0.5 text-[9px] uppercase text-fd-tertiary">
          {server.status}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <McpActionButton
          label={isEnabled ? 'Disable' : 'Enable'}
          icon={<Power className="size-2.5" />}
          disabled={isUpdating}
          onClick={() => onToggle?.(server.name, !isEnabled)}
        />
        {!server.hasAuthTokens ? (
          <McpActionButton
            label="Auth"
            icon={<KeyRound className="size-2.5" />}
            disabled={isUpdating}
            onClick={() => onAuthenticate?.(server.name)}
          />
        ) : (
          <McpActionButton
            label="Clear auth"
            icon={<KeyRound className="size-2.5" />}
            disabled={isUpdating}
            onClick={() => onClearAuth?.(server.name)}
          />
        )}
        {server.isManaged ? (
          <McpActionButton
            label="Remove"
            icon={<Trash2 className="size-2.5" />}
            disabled={isUpdating}
            onClick={() => onRemove?.(server.name)}
          />
        ) : null}
      </div>
    </div>
  )
}

function McpToolRow({
  tool,
  isUpdating,
  onToggle,
}: {
  tool: LiveSessionMcpToolInfo
  isUpdating: boolean
  onToggle?: (serverName: string, toolName: string, enabled: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-fd-border-subtle bg-fd-panel/40 px-2 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-[11px] text-fd-primary">{tool.name}</p>
        <p className="text-[10px] text-fd-tertiary">
          {tool.serverName}
          {tool.isReadOnly ? ' · read-only' : ''}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={tool.isEnabled}
        aria-label={`Toggle ${tool.name} MCP tool`}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          tool.isEnabled ? 'bg-fd-ember-400' : 'bg-fd-tertiary/30'
        }`}
        disabled={isUpdating}
        onClick={() => onToggle?.(tool.serverName, tool.name, !tool.isEnabled)}
      >
        <span
          className={`pointer-events-none inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
            tool.isEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  )
}

function McpRegistryRow({
  server,
  isInstalled,
  isUpdating,
  onAdd,
}: {
  server: LiveSessionMcpRegistryServerInfo
  isInstalled: boolean
  isUpdating: boolean
  onAdd?: (server: LiveSessionMcpRegistryServerInfo) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-fd-border-subtle bg-fd-panel/30 px-2 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-[11px] text-fd-primary">{server.name}</p>
        <p className="line-clamp-2 text-[10px] text-fd-tertiary">{server.description}</p>
      </div>
      <McpActionButton
        label={isInstalled ? 'Added' : 'Add'}
        icon={<Plus className="size-2.5" />}
        disabled={isInstalled || isUpdating}
        onClick={() => onAdd?.(server)}
      />
    </div>
  )
}

function McpAuthCard({
  request,
  isUpdating,
  onAuthenticate,
}: {
  request: Extract<LiveSessionEventRecord, { type: 'mcp.authRequired' }>
  isUpdating: boolean
  onAuthenticate?: (serverName: string) => void
}) {
  return (
    <div className="rounded-md border border-fd-border-subtle bg-fd-panel/50 p-2">
      <p className="text-[11px] text-fd-primary">{request.message}</p>
      <p className="mt-0.5 truncate text-[10px] text-fd-tertiary">{request.serverName}</p>
      <div className="mt-1.5 flex gap-1">
        <McpActionButton
          label="Start auth"
          icon={<KeyRound className="size-2.5" />}
          disabled={isUpdating}
          onClick={() => onAuthenticate?.(request.serverName)}
        />
      </div>
    </div>
  )
}

function ResultSummaryCard({
  result,
}: {
  result: Extract<LiveSessionEventRecord, { type: 'session.result' }>
}) {
  return (
    <div className="rounded-md border border-fd-border-subtle bg-fd-panel/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className={result.success ? 'text-[11px] text-fd-ready' : 'text-[11px] text-fd-danger'}
        >
          {result.success ? 'Succeeded' : 'Failed'}
        </span>
        <span className="font-mono text-[10px] text-fd-tertiary">
          {Math.round(result.durationMs / 100) / 10}s · {result.turnCount} turns
        </span>
      </div>
      {typeof result.structuredOutput !== 'undefined' ? (
        <pre className="mt-1.5 max-h-28 overflow-auto rounded bg-fd-surface px-2 py-1 text-[10px] text-fd-secondary">
          {formatJson(result.structuredOutput)}
        </pre>
      ) : null}
    </div>
  )
}

function McpActionButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string
  icon: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded border border-fd-border-subtle bg-fd-surface px-1.5 py-0.5 text-[10px] text-fd-tertiary transition-colors hover:text-fd-primary disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

function formatStatusLabel(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ')
}

function formatSettingValue(value: string | undefined): string {
  return value && value.length > 0 ? value : 'Default'
}

function formatContextAccuracy(value: LiveSessionContextStatsInfo['accuracy']): string {
  return value === 'exact' ? 'Exact count' : 'Estimated count'
}

function formatMcpSummary(server: LiveSessionMcpServerInfo): string {
  const parts = [
    server.serverType,
    typeof server.toolCount === 'number' ? `${server.toolCount} tools` : null,
    typeof server.hasAuthTokens === 'boolean'
      ? server.hasAuthTokens
        ? 'authenticated'
        : 'auth required'
      : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(' · ')
}

function getLatestResult(
  events: LiveSessionEventRecord[],
): Extract<LiveSessionEventRecord, { type: 'session.result' }> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'session.result') {
      return event
    }
  }

  return null
}

function getLatestMcpAuthRequest(
  events: LiveSessionEventRecord[],
): Extract<LiveSessionEventRecord, { type: 'mcp.authRequired' }> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'mcp.authCompleted') {
      return null
    }
    if (event?.type === 'mcp.authRequired') {
      return event
    }
  }

  return null
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
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
      cacheCreationTokens: toSafeNumber(tokenUsage.cacheCreationTokens),
      cacheReadTokens: toSafeNumber(tokenUsage.cacheReadTokens),
      thinkingTokens: toSafeNumber(tokenUsage.thinkingTokens),
    }
  }

  return null
}

function toSafeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
