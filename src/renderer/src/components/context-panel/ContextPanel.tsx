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
  FoundationBootstrap,
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
import {
  getLatestTokenUsageEvent,
  normalizeContextStats,
} from '../../state/composer/composer-context-usage.selectors'
import type { SessionPreview } from '../../state/sessions/session.model'
import { Button } from '../ui/button'
import { SkeletonBlock } from '../ui/skeleton'
import { StateCard } from '../ui/state-card'
import { Switch } from '../ui/switch'

export interface ContextPanelProps {
  factoryDefaultSettings?: FoundationBootstrap['factoryDefaultSettings']
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

const CONTEXT_PANEL_SKELETON_IDS = [
  'context-panel-skeleton-a',
  'context-panel-skeleton-b',
  'context-panel-skeleton-c',
]

export function ContextPanel({
  factoryDefaultSettings = {},
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
  const latestTokenUsage = getLatestTokenUsageEvent(liveSession)?.tokenUsage ?? null
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
  const compactionSettings = resolveCompactionSettings(liveSession, factoryDefaultSettings)
  const latestResult = getLatestResult(liveSession?.events ?? [])
  const latestMcpAuthRequest = getLatestMcpAuthRequest(liveSession?.events ?? [])

  return (
    <aside
      aria-label="Context panel"
      className="oxox-context-panel-shell ox-elevated h-full min-h-0 overflow-hidden rounded-lg"
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
        <div className="flex items-center gap-2 border-b border-fd-border-subtle bg-fd-surface/45 px-3 py-2">
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
                  <div className="rounded-md border border-fd-border-subtle bg-fd-panel/60 p-2">
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

              {liveSession && (contextStats || compactionSettings) ? (
                <DetailSection title="Context window">
                  <div className="flex flex-col gap-2">
                    {contextStats ? <ContextStatsCard stats={contextStats} /> : null}
                    {compactionSettings ? (
                      <CompactionSettingsCard
                        settings={compactionSettings}
                        usedContext={contextStats?.used ?? null}
                      />
                    ) : null}
                  </div>
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
    <div className="rounded-lg border border-transparent p-1 transition-colors hover:border-fd-border-subtle/70 hover:bg-fd-surface/35">
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
    <div className="group/copy flex flex-col gap-0.5 rounded-md px-1 py-1 transition-colors hover:bg-fd-surface-hover">
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
  const usedPercentage = stats.limit > 0 ? Math.round((stats.used / stats.limit) * 100) : 0
  const clampedPercentage = Math.max(0, Math.min(100, usedPercentage))

  return (
    <div className="rounded-md border border-fd-border-subtle bg-fd-panel/60 p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] text-fd-tertiary">
          {formatContextAccuracy(stats.accuracy)}
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
      <p className="mt-1.5 font-mono text-[10px] tabular-nums text-fd-tertiary">
        {stats.limit.toLocaleString()} token window
      </p>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] tabular-nums text-fd-secondary">
          {stats.used.toLocaleString()} used
        </span>
        <span className="font-mono text-[10px] tabular-nums text-fd-secondary">
          {stats.remaining.toLocaleString()} remaining
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-fd-quaternary">
        The context window is the active conversation Droid can fit into the model. Processed tokens
        can be higher because cache reads and previous turns are counted separately.
      </p>
    </div>
  )
}

interface CompactionSettings {
  isEnabled?: boolean
  thresholdTokens?: number
  source: 'session' | 'default'
}

function CompactionSettingsCard({
  settings,
  usedContext,
}: {
  settings: CompactionSettings
  usedContext: number | null
}) {
  const thresholdRemaining =
    typeof settings.thresholdTokens === 'number' && usedContext !== null
      ? Math.max(0, settings.thresholdTokens - usedContext)
      : null

  return (
    <div className="rounded-md border border-fd-border-subtle bg-fd-panel/50 p-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-fd-tertiary">
        Compaction
      </p>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] text-fd-tertiary">Automatic compaction</span>
        {typeof settings.isEnabled === 'boolean' ? (
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
              settings.isEnabled
                ? 'bg-fd-ready/15 text-fd-ready'
                : 'bg-fd-border-subtle text-fd-tertiary'
            }`}
          >
            {settings.isEnabled ? 'Enabled' : 'Disabled'}
          </span>
        ) : (
          <span className="text-[10px] text-fd-tertiary">Default</span>
        )}
      </div>
      {typeof settings.thresholdTokens === 'number' ? (
        <p className="mt-1 font-mono text-[10px] tabular-nums text-fd-secondary">
          {settings.thresholdTokens.toLocaleString()} threshold
        </p>
      ) : null}
      {thresholdRemaining !== null && settings.isEnabled !== false ? (
        <p className="mt-1 font-mono text-[10px] tabular-nums text-fd-secondary">
          {thresholdRemaining.toLocaleString()} before threshold
        </p>
      ) : null}
      <p className="mt-1.5 text-[10px] leading-snug text-fd-quaternary">
        {settings.isEnabled === false
          ? settings.source === 'session'
            ? 'Threshold checks are disabled for this session.'
            : 'Threshold checks are disabled for new Droid sessions.'
          : 'Droid compacts long-running sessions near this threshold to keep useful context available.'}
      </p>
      <p className="mt-1 text-[9px] uppercase tracking-wider text-fd-quaternary">
        {formatCompactionSource(settings.source)}
      </p>
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
      <Switch
        checked={tool.currentlyAllowed}
        className="data-checked:bg-fd-ember-400 data-unchecked:bg-fd-tertiary/30"
        aria-label={`Toggle ${tool.displayName} tool`}
        disabled={isUpdating}
        onCheckedChange={(checked) => onToggle?.(tool.llmId, checked)}
      />
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
      <Switch
        checked={tool.isEnabled}
        className="data-checked:bg-fd-ember-400 data-unchecked:bg-fd-tertiary/30"
        aria-label={`Toggle ${tool.name} MCP tool`}
        disabled={isUpdating}
        onCheckedChange={(checked) => onToggle?.(tool.serverName, tool.name, checked)}
      />
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

function resolveCompactionSettings(
  liveSession: LiveSessionSnapshot | null,
  factoryDefaultSettings: FoundationBootstrap['factoryDefaultSettings'],
): CompactionSettings | null {
  const sessionSettings = isRecord(liveSession?.settings) ? liveSession.settings : {}
  const sessionThresholdEnabled = toOptionalBoolean(sessionSettings.compactionThresholdCheckEnabled)
  const sessionThresholdTokens = toOptionalPositiveNumber(sessionSettings.compactionTokenLimit)
  const defaultThresholdEnabled = toOptionalBoolean(
    factoryDefaultSettings.compactionThresholdCheckEnabled,
  )
  const defaultThresholdTokens = toOptionalPositiveNumber(
    factoryDefaultSettings.compactionTokenLimit,
  )
  const isEnabled = sessionThresholdEnabled ?? defaultThresholdEnabled
  const thresholdTokens = sessionThresholdTokens ?? defaultThresholdTokens

  if (typeof isEnabled !== 'boolean' && typeof thresholdTokens !== 'number') {
    return null
  }

  return {
    ...(typeof isEnabled === 'boolean' ? { isEnabled } : {}),
    ...(typeof thresholdTokens === 'number' ? { thresholdTokens } : {}),
    source:
      typeof sessionThresholdEnabled === 'boolean' || typeof sessionThresholdTokens === 'number'
        ? 'session'
        : 'default',
  }
}

function formatCompactionSource(source: CompactionSettings['source']): string {
  return source === 'session' ? 'Session setting' : 'Droid default'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function toOptionalPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
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
