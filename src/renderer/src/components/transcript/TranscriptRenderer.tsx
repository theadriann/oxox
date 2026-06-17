import {
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  FileSearch,
  Loader2,
  ServerCog,
} from 'lucide-react'
import { type MutableRefObject, memo, type ReactNode, useCallback, useMemo, useState } from 'react'
import type {
  LiveSessionAskUserAnswerRecord,
  SessionSearchTarget,
  SessionTranscriptScrollState,
} from '../../../../shared/ipc/contracts'
import { logTranscriptPerformanceEvent } from '../../diagnostics/transcriptPerformance'
import { Button } from '../ui/button'
import { SkeletonBlock } from '../ui/skeleton'
import { StateCard } from '../ui/state-card'
import { AskUserCard } from './AskUserCard'
import { LiveToolRow } from './LiveToolRow'
import { MessageCard } from './MessageCard'
import { PermissionCard } from './PermissionCard'
import { SystemEventCard } from './SystemEventCard'
import { ThinkingCard } from './ThinkingCard'
import { ToolCallCard } from './ToolCallCard'
import { ToolCallGroup } from './ToolCallGroup'
import type { TimelineItem, ToolTimelineItem } from './timelineTypes'
import { groupConsecutiveToolItems } from './toolCallGrouping'
import {
  getTimelineItemSearchText,
  TranscriptInlineSearchBar,
  useTranscriptInlineSearch,
  useTranscriptInlineSearchHighlights,
} from './transcriptInlineSearch'
import { useTranscriptVirtualScroll } from './useTranscriptVirtualScroll'

const TRANSCRIPT_LOADING_ROW_IDS = [
  'transcript-loading-a',
  'transcript-loading-b',
  'transcript-loading-c',
]

export interface TranscriptRendererProps {
  items: TimelineItem[]
  isLive: boolean
  isLoading: boolean
  loadingError?: string | null
  scrollContextKey?: string
  searchTarget?: SessionSearchTarget | null
  scrollToBottomSignal?: number
  scrollPersistenceEnabled?: boolean
  scrollRestoreState?: SessionTranscriptScrollState | null
  primaryActionRef?: MutableRefObject<HTMLElement | null>
  pendingPermissionRequestIds?: string[]
  pendingAskUserRequestIds?: string[]
  onResolvePermissionRequest?: (payload: { requestId: string; selectedOption: string }) => void
  onSubmitAskUserResponse?: (payload: {
    requestId: string
    answers: LiveSessionAskUserAnswerRecord[]
  }) => void
  onForkFromMessage?: (messageId: string) => void
  onScrollStateChange?: (state: SessionTranscriptScrollState) => void
  onRetry?: () => void
}

export function TranscriptRenderer({
  items,
  isLive,
  isLoading,
  loadingError = null,
  scrollContextKey,
  searchTarget = null,
  scrollToBottomSignal = 0,
  scrollPersistenceEnabled = false,
  scrollRestoreState = null,
  primaryActionRef,
  pendingPermissionRequestIds = [],
  pendingAskUserRequestIds = [],
  onResolvePermissionRequest,
  onSubmitAskUserResponse,
  onForkFromMessage,
  onScrollStateChange,
  onRetry,
}: TranscriptRendererProps) {
  const renderItems = useMemo(() => buildRenderItems(items), [items])
  const resolvedScrollContextKey =
    scrollContextKey ?? (isLive ? 'live-transcript' : 'historical-transcript')
  const virtualizerMountKey = `${resolvedScrollContextKey}:${renderItems.length > 0 ? 'ready' : 'empty'}`

  if (isLive) {
    return (
      <LiveTranscriptView
        key={virtualizerMountKey}
        items={renderItems}
        scrollContextKey={resolvedScrollContextKey}
        scrollToBottomSignal={scrollToBottomSignal}
        scrollPersistenceEnabled={scrollPersistenceEnabled}
        scrollRestoreState={scrollRestoreState}
        searchTarget={searchTarget}
        primaryActionRef={primaryActionRef}
        pendingPermissionRequestIds={pendingPermissionRequestIds}
        pendingAskUserRequestIds={pendingAskUserRequestIds}
        onResolvePermissionRequest={onResolvePermissionRequest}
        onSubmitAskUserResponse={onSubmitAskUserResponse}
        onForkFromMessage={onForkFromMessage}
        onScrollStateChange={onScrollStateChange}
      />
    )
  }

  return (
    <HistoricalTranscriptView
      key={virtualizerMountKey}
      items={renderItems}
      isLoading={isLoading}
      searchTarget={searchTarget}
      loadingError={loadingError}
      scrollContextKey={resolvedScrollContextKey}
      scrollToBottomSignal={scrollToBottomSignal}
      scrollPersistenceEnabled={scrollPersistenceEnabled}
      scrollRestoreState={scrollRestoreState}
      primaryActionRef={primaryActionRef}
      onForkFromMessage={onForkFromMessage}
      onScrollStateChange={onScrollStateChange}
      onRetry={onRetry}
    />
  )
}

type RenderItem =
  | { kind: 'timeline-item'; id: string; item: TimelineItem }
  | { kind: 'tool-group'; id: string; items: ToolTimelineItem[] }
  | { kind: 'mcp-status-group'; id: string; items: Array<Extract<TimelineItem, { kind: 'event' }>> }

function buildRenderItems(items: TimelineItem[]): RenderItem[] {
  const startedAt = performance.now()
  const result: RenderItem[] = []
  let pendingTools: ToolTimelineItem[] = []
  let pendingMcpStatuses: Array<Extract<TimelineItem, { kind: 'event' }>> = []

  const flushTools = () => {
    if (pendingTools.length === 0) return

    const grouped = groupConsecutiveToolItems(pendingTools)
    for (const g of grouped) {
      if (g.kind === 'item') {
        result.push({ kind: 'timeline-item', id: g.id, item: g.item })
      } else {
        result.push({ kind: 'tool-group', id: g.id, items: g.items })
      }
    }
    pendingTools = []
  }

  const flushMcpStatuses = () => {
    if (pendingMcpStatuses.length === 0) return

    result.push({
      kind: 'mcp-status-group',
      id: `mcp-status-group-${result.length}-${pendingMcpStatuses.at(0)?.id ?? 'status'}`,
      items: pendingMcpStatuses,
    })
    pendingMcpStatuses = []
  }

  for (const item of items) {
    if (item.kind === 'tool') {
      flushMcpStatuses()
      pendingTools.push(item)
      continue
    }
    flushTools()
    if (isMcpStatusEvent(item)) {
      pendingMcpStatuses.push(item)
      continue
    }
    flushMcpStatuses()
    result.push({ kind: 'timeline-item', id: item.id, item })
  }

  flushTools()
  flushMcpStatuses()
  const durationMs = performance.now() - startedAt
  if (items.length > 100 || durationMs > 2) {
    logTranscriptPerformanceEvent({
      name: 'transcript_renderer_build_render_items',
      durationMs,
      details: {
        inputItemCount: items.length,
        outputItemCount: result.length,
      },
    })
  }
  return result
}

function estimateRenderItemSize(item: RenderItem | undefined): number {
  if (!item) {
    return 180
  }

  return item.kind === 'tool-group' || item.kind === 'mcp-status-group' ? 72 : 180
}

function isMcpStatusEvent(item: TimelineItem): item is Extract<TimelineItem, { kind: 'event' }> {
  return item.kind === 'event' && item.typeLabel === 'mcp.statusChanged'
}

function getRenderItemSearchText(item: RenderItem): string {
  if (item.kind === 'tool-group' || item.kind === 'mcp-status-group') {
    return item.items.map(getTimelineItemSearchText).join('\n')
  }

  return getTimelineItemSearchText(item.item)
}

function renderItemMatchesSearchTarget(item: RenderItem, target: SessionSearchTarget): boolean {
  if (target.messageId && getRenderItemMessageId(item) === target.messageId) {
    return true
  }

  if (target.toolCallId && getRenderItemToolCallId(item)?.split(' ').includes(target.toolCallId)) {
    return true
  }

  return item.id === target.sourceId
}

function findRenderItemSearchTargetIndex(items: RenderItem[], target: SessionSearchTarget): number {
  return items.findIndex((item) => renderItemMatchesSearchTarget(item, target))
}

function getRenderItemMessageId(item: RenderItem): string | null {
  if (item.kind !== 'timeline-item') {
    return null
  }

  return 'messageId' in item.item ? item.item.messageId : null
}

function getRenderItemToolCallId(item: RenderItem): string | null {
  if (item.kind === 'tool-group') {
    return item.items.map((toolItem) => toolItem.toolUseId).join(' ')
  }

  return item.kind === 'timeline-item' && item.item.kind === 'tool' ? item.item.toolUseId : null
}

function LiveTranscriptView({
  items,
  scrollContextKey,
  scrollToBottomSignal,
  scrollPersistenceEnabled,
  scrollRestoreState,
  searchTarget,
  primaryActionRef,
  pendingPermissionRequestIds,
  pendingAskUserRequestIds,
  onResolvePermissionRequest,
  onSubmitAskUserResponse,
  onForkFromMessage,
  onScrollStateChange,
}: {
  items: RenderItem[]
  scrollContextKey: string
  scrollToBottomSignal: number
  scrollPersistenceEnabled: boolean
  scrollRestoreState: SessionTranscriptScrollState | null
  searchTarget?: SessionSearchTarget | null
  primaryActionRef?: MutableRefObject<HTMLElement | null>
  pendingPermissionRequestIds: string[]
  pendingAskUserRequestIds: string[]
  onResolvePermissionRequest?: (payload: { requestId: string; selectedOption: string }) => void
  onSubmitAskUserResponse?: (payload: {
    requestId: string
    answers: LiveSessionAskUserAnswerRecord[]
  }) => void
  onForkFromMessage?: (messageId: string) => void
  onScrollStateChange?: (state: SessionTranscriptScrollState) => void
}) {
  const [expandedToolIds, setExpandedToolIds] = useState<Record<string, boolean>>({})
  const [expandedToolGroupIds, setExpandedToolGroupIds] = useState<Record<string, boolean>>({})
  const [expandedMcpStatusGroupIds, setExpandedMcpStatusGroupIds] = useState<
    Record<string, boolean>
  >({})
  const pendingPermissionRequestIdSet = useMemo(
    () => new Set(pendingPermissionRequestIds),
    [pendingPermissionRequestIds],
  )
  const pendingAskUserRequestIdSet = useMemo(
    () => new Set(pendingAskUserRequestIds),
    [pendingAskUserRequestIds],
  )

  const latestTimelineMarker = useMemo(() => getLatestTimelineMarker(items), [items])
  const transcriptScroll = useTranscriptVirtualScroll({
    estimateSize: estimateRenderItemSize,
    findSearchTargetIndex: findRenderItemSearchTargetIndex,
    getItemKey: (item, index) => item?.id ?? index,
    items,
    latestTimelineMarker,
    onScrollStateChange,
    overscan: 10,
    primaryActionRef,
    scrollContextKey,
    scrollPersistenceEnabled,
    scrollRestoreState,
    scrollToBottomSignal,
    searchTarget,
  })
  const inlineSearchTexts = useMemo(() => items.map(getRenderItemSearchText), [items])
  const inlineSearch = useTranscriptInlineSearch({
    searchTexts: inlineSearchTexts,
    onNavigateToRow: transcriptScroll.navigateToRow,
  })
  useTranscriptInlineSearchHighlights({
    containerRef: transcriptScroll.scrollAreaRef,
    isOpen: inlineSearch.isOpen,
    query: inlineSearch.query,
  })

  const onToggleTool = useCallback((toolUseId: string) => {
    setExpandedToolIds((c) => ({ ...c, [toolUseId]: !c[toolUseId] }))
  }, [])

  const onToggleToolGroup = useCallback((groupId: string) => {
    setExpandedToolGroupIds((c) => ({ ...c, [groupId]: !c[groupId] }))
  }, [])

  const onToggleMcpStatusGroup = useCallback((groupId: string) => {
    setExpandedMcpStatusGroupIds((c) => ({ ...c, [groupId]: !c[groupId] }))
  }, [])

  return (
    <section className="relative flex min-h-0 h-full flex-col">
      <TranscriptInlineSearchBar search={inlineSearch} />
      <div
        aria-label="Live transcript events"
        className="flex-1 overflow-y-auto"
        role="region"
        tabIndex={0}
        ref={transcriptScroll.setScrollElement}
        onScroll={transcriptScroll.handleScroll}
      >
        {items.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-fd-tertiary">
            <span className="size-1.5 animate-pulse rounded-full bg-fd-session-active" />
            <span className="text-sm">Waiting for output...</span>
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${transcriptScroll.estimatedTotalHeight}px` }}
          >
            {transcriptScroll.rowsToRender.map((virtualRow) => {
              const renderItem = items[virtualRow.index]

              if (!renderItem) {
                return null
              }

              return (
                <div
                  key={virtualRow.key}
                  ref={transcriptScroll.virtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-testid="live-transcript-row"
                  className="absolute left-0 top-0 w-full pb-1.5"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {renderItem.kind === 'tool-group' ? (
                    <ToolGroupRow
                      group={renderItem}
                      isLive
                      expandedToolIds={expandedToolIds}
                      expandedGroup={Boolean(expandedToolGroupIds[renderItem.id])}
                      onToggleToolGroup={onToggleToolGroup}
                      onToggleTool={onToggleTool}
                    />
                  ) : renderItem.kind === 'mcp-status-group' ? (
                    <McpStatusGroupRow
                      group={renderItem}
                      expandedGroup={Boolean(expandedMcpStatusGroupIds[renderItem.id])}
                      onToggleGroup={onToggleMcpStatusGroup}
                    />
                  ) : renderItem.item.kind === 'tool' ? (
                    <StandaloneToolWrapper>
                      <LiveToolRow
                        item={renderItem.item}
                        expanded={Boolean(expandedToolIds[renderItem.item.toolUseId])}
                        onToggleTool={onToggleTool}
                      />
                    </StandaloneToolWrapper>
                  ) : (
                    <TimelineItemRow
                      item={renderItem.item}
                      isPending={
                        renderItem.item.kind === 'permission'
                          ? pendingPermissionRequestIdSet.has(renderItem.item.requestId)
                          : renderItem.item.kind === 'askUser'
                            ? pendingAskUserRequestIdSet.has(renderItem.item.requestId)
                            : false
                      }
                      onResolvePermissionRequest={onResolvePermissionRequest}
                      onSubmitAskUserResponse={onSubmitAskUserResponse}
                      onForkFromMessage={onForkFromMessage}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <JumpToLatestButton
        visible={transcriptScroll.showJumpButton && items.length > 0}
        onClick={() => transcriptScroll.scrollToLatest('smooth')}
      />
    </section>
  )
}

function HistoricalTranscriptView({
  items,
  isLoading,
  loadingError,
  scrollContextKey,
  searchTarget,
  scrollToBottomSignal,
  scrollPersistenceEnabled,
  scrollRestoreState,
  primaryActionRef,
  onForkFromMessage,
  onScrollStateChange,
  onRetry,
}: {
  items: RenderItem[]
  isLoading: boolean
  loadingError: string | null
  scrollContextKey: string
  searchTarget: SessionSearchTarget | null
  scrollToBottomSignal: number
  scrollPersistenceEnabled: boolean
  scrollRestoreState: SessionTranscriptScrollState | null
  primaryActionRef?: MutableRefObject<HTMLElement | null>
  onForkFromMessage?: (messageId: string) => void
  onScrollStateChange?: (state: SessionTranscriptScrollState) => void
  onRetry?: () => void
}) {
  const [expandedToolIds, setExpandedToolIds] = useState<Record<string, boolean>>({})
  const [expandedToolGroupIds, setExpandedToolGroupIds] = useState<Record<string, boolean>>({})
  const [expandedMcpStatusGroupIds, setExpandedMcpStatusGroupIds] = useState<
    Record<string, boolean>
  >({})
  const hasTranscript = items.length > 0

  const transcriptScroll = useTranscriptVirtualScroll({
    estimateSize: estimateRenderItemSize,
    findSearchTargetIndex: findRenderItemSearchTargetIndex,
    getItemKey: (item, index) => item?.id ?? index,
    items,
    onScrollStateChange,
    overscan: 8,
    primaryActionRef,
    scrollContextKey,
    scrollPersistenceEnabled,
    scrollRestoreState,
    scrollToBottomSignal,
    searchTarget,
  })
  const inlineSearchTexts = useMemo(() => items.map(getRenderItemSearchText), [items])
  const inlineSearch = useTranscriptInlineSearch({
    searchTexts: inlineSearchTexts,
    onNavigateToRow: transcriptScroll.navigateToRow,
  })
  useTranscriptInlineSearchHighlights({
    containerRef: transcriptScroll.scrollAreaRef,
    isOpen: inlineSearch.isOpen,
    query: inlineSearch.query,
  })

  const toggleToolCall = useCallback((toolUseId: string) => {
    setExpandedToolIds((c) => ({ ...c, [toolUseId]: !c[toolUseId] }))
  }, [])

  const toggleToolGroup = useCallback((groupId: string) => {
    setExpandedToolGroupIds((c) => ({ ...c, [groupId]: !c[groupId] }))
  }, [])

  const toggleMcpStatusGroup = useCallback((groupId: string) => {
    setExpandedMcpStatusGroupIds((c) => ({ ...c, [groupId]: !c[groupId] }))
  }, [])

  return (
    <section className="relative flex min-h-0 h-full flex-col">
      <TranscriptInlineSearchBar search={inlineSearch} />
      {isLoading && hasTranscript ? (
        <div className="flex items-center gap-1.5 py-1 text-xs text-fd-tertiary">
          <Loader2 className="size-3 animate-spin" />
          <span>Syncing latest transcript...</span>
        </div>
      ) : null}

      {loadingError && hasTranscript ? (
        <div className="flex items-center gap-1.5 py-1 text-xs text-fd-ember-400">
          <AlertTriangle className="size-3" />
          <span>Refresh failed</span>
          {onRetry ? (
            <button className="underline" type="button" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        ref={transcriptScroll.setScrollElement}
        role="region"
        aria-label="Transcript messages"
        className="flex-1 overflow-y-auto"
        onScroll={transcriptScroll.handleScroll}
      >
        {isLoading && !hasTranscript ? (
          <div className="flex flex-col gap-3 px-3 py-3">
            <div className="flex flex-col gap-1.5">
              <SkeletonBlock className="h-5 w-1/3" />
            </div>
            {TRANSCRIPT_LOADING_ROW_IDS.map((rowId) => (
              <div
                key={rowId}
                className="flex flex-col gap-2 rounded-md border border-fd-border-subtle bg-fd-panel px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <SkeletonBlock className="h-4 w-16" />
                  <SkeletonBlock className="h-3 w-24" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <SkeletonBlock className="h-3.5 w-full" />
                  <SkeletonBlock className="h-3.5 w-5/6" />
                  <SkeletonBlock className="h-3.5 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : loadingError && !hasTranscript ? (
          <StateCard
            icon={AlertTriangle}
            eyebrow="Recovery"
            title="Unable to load transcript"
            description="OXOX could not refresh the selected transcript. Retry to restore the cached conversation view."
            actions={
              onRetry ? (
                <Button type="button" onClick={onRetry}>
                  Retry transcript
                </Button>
              ) : null
            }
          />
        ) : items.length === 0 ? (
          <StateCard
            icon={FileSearch}
            eyebrow="Transcript"
            title="Transcript unavailable"
            description="Choose a session with artifact-backed transcript data to inspect its chronological conversation history."
          />
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${transcriptScroll.estimatedTotalHeight}px` }}
          >
            {transcriptScroll.rowsToRender.map((virtualRow) => {
              const entry = items[virtualRow.index]
              if (!entry) return null

              return (
                <div
                  key={virtualRow.key}
                  ref={transcriptScroll.virtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-search-message-id={getRenderItemMessageId(entry) ?? undefined}
                  data-search-tool-call-id={getRenderItemToolCallId(entry) ?? undefined}
                  data-testid="transcript-row"
                  className="absolute left-0 top-0 w-full pb-1.5"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {entry.kind === 'tool-group' ? (
                    <ToolGroupRow
                      group={entry}
                      isLive={false}
                      expandedToolIds={expandedToolIds}
                      expandedGroup={Boolean(expandedToolGroupIds[entry.id])}
                      onToggleToolGroup={toggleToolGroup}
                      onToggleTool={toggleToolCall}
                    />
                  ) : entry.kind === 'mcp-status-group' ? (
                    <McpStatusGroupRow
                      group={entry}
                      expandedGroup={Boolean(expandedMcpStatusGroupIds[entry.id])}
                      onToggleGroup={toggleMcpStatusGroup}
                    />
                  ) : entry.item.kind === 'tool' ? (
                    <StandaloneToolWrapper>
                      <HistoricalToolCallRow
                        item={entry.item}
                        expanded={Boolean(expandedToolIds[entry.item.toolUseId])}
                        onToggle={toggleToolCall}
                      />
                    </StandaloneToolWrapper>
                  ) : (
                    <TimelineItemRow
                      item={entry.item}
                      isPending={false}
                      onForkFromMessage={onForkFromMessage}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <JumpToLatestButton
        visible={transcriptScroll.showJumpButton && hasTranscript}
        onClick={() => transcriptScroll.scrollToLatest('smooth')}
      />
    </section>
  )
}

const ToolGroupRow = memo(function ToolGroupRow({
  group,
  isLive,
  expandedToolIds,
  expandedGroup,
  onToggleToolGroup,
  onToggleTool,
}: {
  group: { id: string; items: ToolTimelineItem[] }
  isLive: boolean
  expandedToolIds: Record<string, boolean>
  expandedGroup: boolean
  onToggleToolGroup: (groupId: string) => void
  onToggleTool: (toolUseId: string) => void
}) {
  return (
    <ToolCallGroup
      count={group.items.length}
      expanded={expandedGroup}
      toolNames={group.items.map((t) => t.toolName)}
      onToggle={() => onToggleToolGroup(group.id)}
    >
      {group.items.map((toolItem) =>
        isLive ? (
          <LiveToolRow
            key={toolItem.id}
            item={toolItem}
            expanded={Boolean(expandedToolIds[toolItem.toolUseId])}
            onToggleTool={onToggleTool}
          />
        ) : (
          <HistoricalToolCallRow
            key={toolItem.id}
            item={toolItem}
            expanded={Boolean(expandedToolIds[toolItem.toolUseId])}
            onToggle={onToggleTool}
          />
        ),
      )}
    </ToolCallGroup>
  )
})

const McpStatusGroupRow = memo(function McpStatusGroupRow({
  group,
  expandedGroup,
  onToggleGroup,
}: {
  group: { id: string; items: Array<Extract<TimelineItem, { kind: 'event' }>> }
  expandedGroup: boolean
  onToggleGroup: (groupId: string) => void
}) {
  const label = `${group.items.length} MCP status change${group.items.length === 1 ? '' : 's'}`
  const latestStatus = group.items.at(-1)?.body ?? 'MCP server status changed'

  return (
    <div
      className={`my-0.5 overflow-hidden rounded-md border transition-colors ${
        expandedGroup
          ? 'border-fd-border-default bg-fd-surface/40'
          : 'border-fd-border-subtle bg-fd-surface/20 hover:border-fd-border-default'
      }`}
    >
      <button
        aria-expanded={expandedGroup}
        aria-label={`${label}: ${latestStatus}`}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-fd-surface/50"
        type="button"
        onClick={() => onToggleGroup(group.id)}
      >
        <span className="shrink-0 text-fd-tertiary">
          {expandedGroup ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </span>
        <ServerCog className="size-3 shrink-0 text-fd-tertiary" />
        <span className="shrink-0 text-[11px] font-medium text-fd-secondary">{label}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-fd-tertiary">{latestStatus}</span>
      </button>

      {expandedGroup ? (
        <div className="flex flex-col gap-1 border-t border-fd-border-subtle p-1.5">
          {group.items.map((eventItem) => (
            <SystemEventCard key={eventItem.id} item={eventItem} />
          ))}
        </div>
      ) : null}
    </div>
  )
})

const HistoricalToolCallRow = memo(function HistoricalToolCallRow({
  item,
  expanded,
  onToggle,
}: {
  item: ToolTimelineItem
  expanded: boolean
  onToggle: (toolUseId: string) => void
}) {
  const handleToggle = useCallback(() => {
    onToggle(item.toolUseId)
  }, [onToggle, item.toolUseId])

  const transcriptEntry = useMemo(
    () => ({
      kind: 'tool_call' as const,
      id: item.id,
      toolUseId: item.toolUseId,
      occurredAt: item.occurredAt,
      toolName: item.toolName,
      status: item.status,
      inputMarkdown: item.inputMarkdown ?? '',
      resultMarkdown: item.resultMarkdown,
      resultIsError: item.resultIsError,
    }),
    [item],
  )

  return <ToolCallCard entry={transcriptEntry} expanded={expanded} onToggle={handleToggle} />
})

const TimelineItemRow = memo(function TimelineItemRow({
  item,
  isPending,
  onResolvePermissionRequest,
  onSubmitAskUserResponse,
  onForkFromMessage,
}: {
  item: TimelineItem
  isPending: boolean
  onResolvePermissionRequest?: (payload: { requestId: string; selectedOption: string }) => void
  onSubmitAskUserResponse?: (payload: {
    requestId: string
    answers: LiveSessionAskUserAnswerRecord[]
  }) => void
  onForkFromMessage?: (messageId: string) => void
}) {
  switch (item.kind) {
    case 'message':
      return <MessageCard item={item} onForkFromMessage={onForkFromMessage} />
    case 'thinking':
      return <ThinkingCard item={item} />
    case 'tool':
      return null
    case 'permission':
      return (
        <PermissionCard item={item} isPending={isPending} onResolve={onResolvePermissionRequest} />
      )
    case 'askUser':
      return <AskUserCard item={item} isPending={isPending} onSubmit={onSubmitAskUserResponse} />
    case 'event':
      return <SystemEventCard item={item} />
    default:
      return null
  }
})

function StandaloneToolWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="my-0.5 overflow-hidden rounded-md border border-fd-border-subtle bg-fd-surface/20 hover:border-fd-border-default transition-colors">
      {children}
    </div>
  )
}

function JumpToLatestButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) return null

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-10">
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Scroll to latest"
        className="pointer-events-auto rounded-full shadow-lg"
        onClick={onClick}
      >
        <ArrowDown className="size-3.5" />
      </Button>
    </div>
  )
}

function getLatestTimelineMarker(items: RenderItem[]): string {
  const latestItem = items.at(-1)
  if (!latestItem) return 'empty'

  if (latestItem.kind === 'tool-group') {
    const lastTool = latestItem.items.at(-1)
    return `${latestItem.id}:${latestItem.items.length}:${lastTool?.status ?? 'unknown'}:${lastTool?.progressHistory.length ?? 0}:${lastTool?.resultMarkdown?.length ?? 0}`
  }

  if (latestItem.kind === 'mcp-status-group') {
    const latestMcpStatus = latestItem.items.at(-1)
    return `${latestItem.id}:${latestItem.items.length}:${latestMcpStatus?.body ?? ''}`
  }

  switch (latestItem.item.kind) {
    case 'message':
      return `${latestItem.item.id}:${latestItem.item.status}:${latestItem.item.content.length}`
    case 'thinking':
      return `${latestItem.item.id}:${latestItem.item.status}:${latestItem.item.content.length}`
    case 'tool':
      return `${latestItem.item.id}:${latestItem.item.status}:${latestItem.item.progressHistory.length}:${latestItem.item.resultMarkdown?.length ?? 0}`
    case 'event':
      return `${latestItem.item.id}:${latestItem.item.body.length}`
    case 'permission':
      return `${latestItem.item.id}:${latestItem.item.selectedOption ?? 'pending'}`
    case 'askUser':
      return `${latestItem.item.id}:${latestItem.item.submittedAnswers?.length ?? 0}`
    default:
      return latestItem.item.id
  }
}
