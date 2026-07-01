import {
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  FileSearch,
  Loader2,
  ServerCog,
} from 'lucide-react'
import {
  type Dispatch,
  type MutableRefObject,
  memo,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import type {
  LiveSessionAskUserAnswerRecord,
  SessionSearchTarget,
  SessionTranscriptScrollState,
} from '../../../../shared/ipc/contracts'
import { logTranscriptPerformanceEvent } from '../../diagnostics/transcriptPerformance'
import type { ContentLayout } from '../../state/ui/ui.model'
import { ContentContainer } from '../app-shell/ContentContainer'
import { Button } from '../ui/button'
import { SkeletonBlock } from '../ui/skeleton'
import { StateCard } from '../ui/state-card'
import { AskUserCard } from './AskUserCard'
import { LiveSessionStatusPill } from './LiveSessionStatusPill'
import { LiveToolRow } from './LiveToolRow'
import type { LiveSessionStatusIndicator } from './liveSessionStatusIndicator'
import { MessageCard } from './MessageCard'
import { PermissionCard } from './PermissionCard'
import { parseMessageSegments } from './parseMessageSegments'
import { SystemEventCard } from './SystemEventCard'
import { ThinkingCard } from './ThinkingCard'
import { ToolCallCard } from './ToolCallCard'
import { ToolCallGroup } from './ToolCallGroup'
import {
  buildTranscriptUserMessageMarkers,
  TranscriptUserMessageRail,
} from './TranscriptUserMessageRail'
import type { TimelineItem, ToolTimelineItem } from './timelineTypes'
import { groupConsecutiveToolItems } from './toolCallGrouping'
import {
  getTimelineItemSearchText,
  TranscriptInlineSearchBar,
  useTranscriptInlineSearch,
  useTranscriptInlineSearchHighlights,
} from './transcriptInlineSearch'
import {
  getTranscriptScrollRequestKey,
  type TranscriptScrollRequest,
  type TranscriptScrollTarget,
} from './transcriptScrollTarget'
import { useTranscriptVirtualScroll } from './useTranscriptVirtualScroll'

const TRANSCRIPT_LOADING_ROW_IDS = [
  'transcript-loading-a',
  'transcript-loading-b',
  'transcript-loading-c',
]
const LIVE_STATUS_RESERVED_SPACE_PX = 56
const COLLAPSED_DISCLOSURE_ROW_ESTIMATE_PX = 42

export interface TranscriptRendererProps {
  items: TimelineItem[]
  isLive: boolean
  isLoading: boolean
  loadingError?: string | null
  scrollContextKey?: string
  searchTarget?: SessionSearchTarget | null
  scrollTargetRequest?: TranscriptScrollRequest | null
  scrollToBottomSignal?: number
  contentLayout?: ContentLayout
  bottomInsetPx?: number
  scrollPersistenceEnabled?: boolean
  scrollRestoreState?: SessionTranscriptScrollState | null
  primaryActionRef?: MutableRefObject<HTMLElement | null>
  pendingPermissionRequestIds?: string[]
  pendingAskUserRequestIds?: string[]
  statusIndicator?: LiveSessionStatusIndicator | null
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
  scrollTargetRequest = null,
  scrollToBottomSignal = 0,
  contentLayout = 'fixed',
  bottomInsetPx = 0,
  scrollPersistenceEnabled = false,
  scrollRestoreState = null,
  primaryActionRef,
  pendingPermissionRequestIds = [],
  pendingAskUserRequestIds = [],
  statusIndicator = null,
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
        contentLayout={contentLayout}
        bottomInsetPx={bottomInsetPx}
        scrollPersistenceEnabled={scrollPersistenceEnabled}
        scrollRestoreState={scrollRestoreState}
        searchTarget={searchTarget}
        scrollTargetRequest={scrollTargetRequest}
        primaryActionRef={primaryActionRef}
        pendingPermissionRequestIds={pendingPermissionRequestIds}
        pendingAskUserRequestIds={pendingAskUserRequestIds}
        statusIndicator={statusIndicator}
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
      scrollTargetRequest={scrollTargetRequest}
      loadingError={loadingError}
      scrollContextKey={resolvedScrollContextKey}
      scrollToBottomSignal={scrollToBottomSignal}
      contentLayout={contentLayout}
      bottomInsetPx={bottomInsetPx}
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

export function estimateRenderItemSize(item: RenderItem | undefined): number {
  if (!item) {
    return 220
  }

  if (item.kind === 'tool-group') {
    return COLLAPSED_DISCLOSURE_ROW_ESTIMATE_PX
  }

  if (item.kind === 'mcp-status-group') {
    return COLLAPSED_DISCLOSURE_ROW_ESTIMATE_PX
  }

  switch (item.item.kind) {
    case 'message':
      return estimateMessageRenderItemSize(item.item)
    case 'thinking':
      return 128
    case 'tool':
      return COLLAPSED_DISCLOSURE_ROW_ESTIMATE_PX
    case 'permission':
      return 230
    case 'askUser':
      return 240
    case 'event':
      return estimateEventRenderItemSize(item.item)
    default:
      return 200
  }
}

function estimateEventRenderItemSize(item: Extract<TimelineItem, { kind: 'event' }>): number {
  const bodyLineCount = item.body ? Math.max(1, Math.ceil(item.body.length / 96)) : 0
  const inlineDetailCount =
    item.detailsLayout === 'disclosure'
      ? 0
      : item.details.filter((detail) => detail.length <= 120 && !detail.includes('\n')).length
  const chipRows = Math.ceil(Math.min(inlineDetailCount, 4) / 3)
  const baseHeight = item.layout === 'compact' ? 44 : 54

  return Math.min(180, baseHeight + bodyLineCount * 16 + chipRows * 18)
}

function estimateMessageRenderItemSize(item: Extract<TimelineItem, { kind: 'message' }>): number {
  const textContent = getMessageTextContent(item)
  const segments = item.role === 'user' ? parseMessageSegments(textContent) : []
  const visibleTextLength =
    item.role === 'user'
      ? segments
          .filter((segment) => segment.kind === 'text')
          .reduce((total, segment) => total + segment.content.length, 0)
      : textContent.length
  const collapsedReminderCount =
    item.role === 'user'
      ? segments.filter((segment) => segment.kind === 'system-reminder').length
      : 0
  const lineEstimate = Math.max(
    visibleTextLength > 0 ? 1 : 0,
    Math.ceil(visibleTextLength / (item.role === 'user' ? 64 : 82)),
  )
  const imageBlockCount = item.contentBlocks?.filter((block) => block.type === 'image').length ?? 0
  const thinkingBlockCount =
    item.contentBlocks?.filter((block) => block.type === 'thinking').length ?? 0
  const markdownHeight =
    item.role === 'assistant' || item.role === 'system'
      ? estimateMarkdownRenderHeight(textContent)
      : null
  const base = item.role === 'user' ? 76 : 96
  const lineHeight = item.role === 'user' ? 24 : 24
  const collapsedReminderHeight = collapsedReminderCount * 28
  const plainTextHeight = base + lineEstimate * lineHeight
  const textHeight =
    markdownHeight === null ? plainTextHeight : Math.max(plainTextHeight, markdownHeight)

  return Math.min(
    item.role === 'user' ? 3600 : 4800,
    textHeight + thinkingBlockCount * 28 + imageBlockCount * 220 + collapsedReminderHeight,
  )
}

function estimateMarkdownRenderHeight(markdown: string): number {
  const fencedBlocks = getFencedCodeBlocks(markdown)
  const markdownWithoutFences = fencedBlocks.reduce(
    (content, block) => content.replace(block.fullMatch, '\n'),
    markdown,
  )
  const textHeight = estimateMarkdownTextHeight(markdownWithoutFences)
  const codeHeight = fencedBlocks.reduce(
    (total, block) => total + estimateCodeBlockHeight(block.code),
    0,
  )

  return 72 + textHeight + codeHeight
}

function getFencedCodeBlocks(markdown: string): Array<{ fullMatch: string; code: string }> {
  return [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/gu)].map((match) => ({
    fullMatch: match[0],
    code: match[1] ?? '',
  }))
}

function estimateCodeBlockHeight(code: string): number {
  const lines = code.length > 0 ? code.split('\n') : ['']
  const wrappedLineCount = lines.reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / 92)),
    0,
  )

  return 72 + wrappedLineCount * 20
}

function estimateMarkdownTextHeight(markdown: string): number {
  const visibleLength = markdown.replace(/\s+/gu, ' ').trim().length
  const explicitLineCount = markdown.split('\n').filter((line) => line.trim()).length
  const wrappedLineCount = Math.ceil(visibleLength / 76)
  const lineCount = Math.max(explicitLineCount, wrappedLineCount)

  return lineCount * 24
}

function getMessageTextContent(item: Extract<TimelineItem, { kind: 'message' }>): string {
  const textFromBlocks = item.contentBlocks
    ?.flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n\n')

  return textFromBlocks && textFromBlocks.length > 0 ? textFromBlocks : item.content
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

function getRenderItemKey(item: RenderItem | undefined, index: number): string | number {
  return item?.id ?? index
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

function renderItemMatchesScrollTarget(item: RenderItem, target: TranscriptScrollTarget): boolean {
  switch (target.kind) {
    case 'message':
      return getRenderItemMessageId(item) === target.messageId
    case 'tool':
      return Boolean(getRenderItemToolCallId(item)?.split(' ').includes(target.toolUseId))
    case 'timelineItem':
      return item.id === target.id || (item.kind === 'timeline-item' && item.item.id === target.id)
    case 'row':
      return false
    default:
      return false
  }
}

function findRenderItemSearchTargetIndex(items: RenderItem[], target: SessionSearchTarget): number {
  return items.findIndex((item) => renderItemMatchesSearchTarget(item, target))
}

function findRenderItemScrollTargetIndex(
  items: RenderItem[],
  request: TranscriptScrollRequest,
): number {
  if (request.target.kind === 'row') {
    return request.target.index >= 0 && request.target.index < items.length
      ? request.target.index
      : -1
  }

  return items.findIndex((item) => renderItemMatchesScrollTarget(item, request.target))
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

function getRenderItemProfileKind(item: RenderItem): string {
  if (item.kind === 'tool-group' || item.kind === 'mcp-status-group') {
    return item.kind
  }

  return item.item.kind
}

function getRenderItemToolCount(item: RenderItem): number | undefined {
  if (item.kind === 'tool-group' || item.kind === 'mcp-status-group') {
    return item.items.length
  }

  return item.item.kind === 'tool' ? 1 : undefined
}

function getRenderItemExpandedState(
  item: RenderItem,
  expandedToolGroupIds: Record<string, boolean>,
  expandedToolIds: Record<string, boolean>,
  expandedMcpStatusGroupIds: Record<string, boolean>,
): boolean | undefined {
  if (item.kind === 'tool-group') {
    return Boolean(expandedToolGroupIds[item.id])
  }

  if (item.kind === 'mcp-status-group') {
    return Boolean(expandedMcpStatusGroupIds[item.id])
  }

  if (item.item.kind === 'tool') {
    return Boolean(expandedToolIds[item.item.toolUseId])
  }

  return undefined
}

function getExpandedToolCount(
  item: RenderItem,
  expandedToolGroupIds: Record<string, boolean>,
  expandedToolIds: Record<string, boolean>,
  expandedMcpStatusGroupIds: Record<string, boolean>,
): number | undefined {
  if (item.kind === 'tool-group') {
    if (!expandedToolGroupIds[item.id]) return 0
    return Math.max(1, item.items.filter((toolItem) => expandedToolIds[toolItem.toolUseId]).length)
  }

  if (item.kind === 'mcp-status-group') {
    return expandedMcpStatusGroupIds[item.id] ? item.items.length : 0
  }

  if (item.item.kind === 'tool') {
    return expandedToolIds[item.item.toolUseId] ? 1 : 0
  }

  return undefined
}

function rowDatasetMatchesSearchTarget(row: HTMLElement, target: SessionSearchTarget): boolean {
  if (target.messageId && row.dataset.searchMessageId === target.messageId) {
    return true
  }

  if (target.toolCallId && row.dataset.searchToolCallId?.split(' ').includes(target.toolCallId)) {
    return true
  }

  return (
    row.dataset.searchMessageId === target.sourceId ||
    row.dataset.searchToolCallId === target.sourceId
  )
}

function getRenderedSearchTargetKey(target: SessionSearchTarget, scrollContextKey: string): string {
  return [
    scrollContextKey,
    target.sessionId,
    target.sourceKind,
    target.sourceId,
    target.messageId ?? '',
    target.toolCallId ?? '',
  ].join(':')
}

function getScrollTargetToolUseId(
  scrollTargetRequest: TranscriptScrollRequest | null | undefined,
): string | null {
  return scrollTargetRequest?.target.kind === 'tool' ? scrollTargetRequest.target.toolUseId : null
}

function findContainingToolGroup(
  items: RenderItem[],
  toolUseId: string,
): Extract<RenderItem, { kind: 'tool-group' }> | null {
  return (
    items.find(
      (item): item is Extract<RenderItem, { kind: 'tool-group' }> =>
        item.kind === 'tool-group' &&
        item.items.some((toolItem) => toolItem.toolUseId === toolUseId),
    ) ?? null
  )
}

function useOpenToolTarget({
  items,
  setExpandedToolGroupIds,
  setExpandedToolIds,
  toolUseId,
}: {
  items: RenderItem[]
  setExpandedToolGroupIds: Dispatch<SetStateAction<Record<string, boolean>>>
  setExpandedToolIds: Dispatch<SetStateAction<Record<string, boolean>>>
  toolUseId: string | null | undefined
}) {
  useLayoutEffect(() => {
    if (!toolUseId) return

    setExpandedToolIds((current) => ({ ...current, [toolUseId]: true }))

    const containingGroup = findContainingToolGroup(items, toolUseId)
    if (containingGroup) {
      setExpandedToolGroupIds((current) => ({ ...current, [containingGroup.id]: true }))
    }
  }, [items, setExpandedToolGroupIds, setExpandedToolIds, toolUseId])
}

function useRevealRenderedToolTarget({
  behavior,
  requestKey,
  scrollAreaRef,
  toolUseId,
}: {
  behavior?: ScrollBehavior
  requestKey: string | null
  scrollAreaRef: MutableRefObject<HTMLDivElement | null>
  toolUseId: string | null
}) {
  useEffect(() => {
    if (!requestKey || !toolUseId) return

    let frame = 0
    let attempts = 0
    const scrollRenderedToolIntoView = () => {
      const scrollArea = scrollAreaRef.current
      const targetTool = scrollArea ? findRenderedToolElement(scrollArea, toolUseId) : null

      if (targetTool) {
        targetTool.scrollIntoView?.({
          block: 'center',
          behavior: behavior ?? 'auto',
        })
        return
      }

      attempts += 1
      if (attempts < 6) {
        frame = requestAnimationFrame(scrollRenderedToolIntoView)
      }
    }

    frame = requestAnimationFrame(scrollRenderedToolIntoView)

    return () => cancelAnimationFrame(frame)
  }, [behavior, requestKey, scrollAreaRef, toolUseId])
}

function findRenderedToolElement(scrollArea: HTMLElement, toolUseId: string): HTMLElement | null {
  return (
    Array.from(scrollArea.querySelectorAll<HTMLElement>('[data-transcript-tool-use-id]')).find(
      (element) => element.dataset.transcriptToolUseId === toolUseId,
    ) ?? null
  )
}

function LiveTranscriptView({
  items,
  scrollContextKey,
  scrollToBottomSignal,
  contentLayout,
  bottomInsetPx,
  scrollPersistenceEnabled,
  scrollRestoreState,
  searchTarget,
  scrollTargetRequest,
  primaryActionRef,
  pendingPermissionRequestIds,
  pendingAskUserRequestIds,
  statusIndicator,
  onResolvePermissionRequest,
  onSubmitAskUserResponse,
  onForkFromMessage,
  onScrollStateChange,
}: {
  items: RenderItem[]
  scrollContextKey: string
  scrollToBottomSignal: number
  contentLayout: ContentLayout
  bottomInsetPx: number
  scrollPersistenceEnabled: boolean
  scrollRestoreState: SessionTranscriptScrollState | null
  searchTarget?: SessionSearchTarget | null
  scrollTargetRequest?: TranscriptScrollRequest | null
  primaryActionRef?: MutableRefObject<HTMLElement | null>
  pendingPermissionRequestIds: string[]
  pendingAskUserRequestIds: string[]
  statusIndicator: LiveSessionStatusIndicator | null
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
  const scrollTargetToolUseId = getScrollTargetToolUseId(scrollTargetRequest)
  const scrollTargetRequestKey = getTranscriptScrollRequestKey(scrollTargetRequest)

  useOpenToolTarget({
    items,
    setExpandedToolGroupIds,
    setExpandedToolIds,
    toolUseId: scrollTargetToolUseId,
  })

  const latestTimelineMarker = useMemo(() => getLatestTimelineMarker(items), [items])
  const statusReservedSpace = statusIndicator ? LIVE_STATUS_RESERVED_SPACE_PX : 0
  const transcriptScroll = useTranscriptVirtualScroll({
    endPaddingPx: statusReservedSpace + bottomInsetPx,
    estimateSize: estimateRenderItemSize,
    findSearchTargetIndex: findRenderItemSearchTargetIndex,
    findScrollTargetIndex: findRenderItemScrollTargetIndex,
    getItemKey: getRenderItemKey,
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
    scrollTargetRequest,
  })
  const inlineSearchTexts = useMemo(() => items.map(getRenderItemSearchText), [items])
  const inlineSearch = useTranscriptInlineSearch({
    searchTexts: inlineSearchTexts,
    onNavigateToRow: transcriptScroll.navigateToRow,
  })
  const userMessageMarkers = useMemo(() => buildTranscriptUserMessageMarkers(items), [items])
  useTranscriptInlineSearchHighlights({
    containerRef: transcriptScroll.scrollAreaRef,
    isOpen: inlineSearch.isOpen,
    query: inlineSearch.query,
  })
  useRevealRenderedToolTarget({
    behavior: scrollTargetRequest?.behavior,
    requestKey: scrollTargetRequestKey,
    scrollAreaRef: transcriptScroll.scrollAreaRef,
    toolUseId: scrollTargetToolUseId,
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
        className="flex-1 overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable_both-edges]"
        role="region"
        tabIndex={0}
        ref={transcriptScroll.setScrollElement}
        onScroll={transcriptScroll.handleScroll}
      >
        {items.length === 0 ? (
          <TranscriptContentFrame contentLayout={contentLayout}>
            <div className="flex items-center gap-2 py-8 text-fd-tertiary">
              <span className="size-1.5 animate-pulse rounded-full bg-fd-session-active" />
              <span className="text-sm">Waiting for output...</span>
            </div>
          </TranscriptContentFrame>
        ) : (
          <div
            className="relative w-full"
            data-testid="live-transcript-virtual-spacer"
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
                  ref={transcriptScroll.measureElement}
                  data-index={virtualRow.index}
                  data-transcript-expanded-tool-count={getExpandedToolCount(
                    renderItem,
                    expandedToolGroupIds,
                    expandedToolIds,
                    expandedMcpStatusGroupIds,
                  )}
                  data-transcript-row-expanded={getRenderItemExpandedState(
                    renderItem,
                    expandedToolGroupIds,
                    expandedToolIds,
                    expandedMcpStatusGroupIds,
                  )}
                  data-transcript-row-kind={getRenderItemProfileKind(renderItem)}
                  data-transcript-source-id={renderItem.id}
                  data-transcript-tool-count={getRenderItemToolCount(renderItem)}
                  data-testid="live-transcript-row"
                  className="absolute left-0 top-0 w-full pb-1.5"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <TranscriptContentFrame contentLayout={contentLayout}>
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
                      <StandaloneToolWrapper toolUseId={renderItem.item.toolUseId}>
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
                  </TranscriptContentFrame>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {items.length > 0 ? (
        <TranscriptUserMessageRail
          markers={userMessageMarkers}
          bottomInsetPx={bottomInsetPx}
          onNavigate={transcriptScroll.navigateToRow}
        />
      ) : null}

      <JumpToLatestButton
        visible={transcriptScroll.showJumpButton && items.length > 0}
        bottomInsetPx={bottomInsetPx}
        onClick={() => transcriptScroll.scrollToLatest('smooth')}
      />
      {statusIndicator ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-10"
          style={{ bottom: `${bottomInsetPx + 8}px` }}
        >
          <ContentContainer layout={contentLayout}>
            <LiveSessionStatusPill status={statusIndicator} className="pointer-events-auto" />
          </ContentContainer>
        </div>
      ) : null}
    </section>
  )
}

function HistoricalTranscriptView({
  items,
  isLoading,
  loadingError,
  scrollContextKey,
  searchTarget,
  scrollTargetRequest,
  scrollToBottomSignal,
  contentLayout,
  bottomInsetPx,
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
  scrollTargetRequest: TranscriptScrollRequest | null
  scrollToBottomSignal: number
  contentLayout: ContentLayout
  bottomInsetPx: number
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
  const scrollTargetToolUseId = getScrollTargetToolUseId(scrollTargetRequest)
  const scrollTargetRequestKey = getTranscriptScrollRequestKey(scrollTargetRequest)

  useOpenToolTarget({
    items,
    setExpandedToolGroupIds,
    setExpandedToolIds,
    toolUseId: searchTarget?.toolCallId,
  })
  useOpenToolTarget({
    items,
    setExpandedToolGroupIds,
    setExpandedToolIds,
    toolUseId: scrollTargetToolUseId,
  })

  const transcriptScroll = useTranscriptVirtualScroll({
    endPaddingPx: bottomInsetPx,
    estimateSize: estimateRenderItemSize,
    findSearchTargetIndex: findRenderItemSearchTargetIndex,
    findScrollTargetIndex: findRenderItemScrollTargetIndex,
    getItemKey: getRenderItemKey,
    items,
    onScrollStateChange,
    overscan: 8,
    primaryActionRef,
    scrollContextKey,
    scrollPersistenceEnabled,
    scrollRestoreState,
    scrollToBottomSignal,
    searchTarget,
    scrollTargetRequest,
  })
  const inlineSearchTexts = useMemo(() => items.map(getRenderItemSearchText), [items])
  const inlineSearch = useTranscriptInlineSearch({
    searchTexts: inlineSearchTexts,
    onNavigateToRow: transcriptScroll.navigateToRow,
  })
  const userMessageMarkers = useMemo(() => buildTranscriptUserMessageMarkers(items), [items])
  useTranscriptInlineSearchHighlights({
    containerRef: transcriptScroll.scrollAreaRef,
    isOpen: inlineSearch.isOpen,
    query: inlineSearch.query,
  })
  useRevealRenderedToolTarget({
    behavior: scrollTargetRequest?.behavior,
    requestKey: scrollTargetRequestKey,
    scrollAreaRef: transcriptScroll.scrollAreaRef,
    toolUseId: scrollTargetToolUseId,
  })
  const renderedSearchTargetKey = searchTarget
    ? getRenderedSearchTargetKey(searchTarget, scrollContextKey)
    : null
  useEffect(() => {
    if (!searchTarget || !renderedSearchTargetKey) {
      return
    }

    let frame = 0
    let attempts = 0
    const scrollRenderedTargetIntoView = () => {
      const scrollArea = transcriptScroll.scrollAreaRef.current

      if (!scrollArea) {
        attempts += 1
        if (attempts < 6) {
          frame = requestAnimationFrame(scrollRenderedTargetIntoView)
        }
        return
      }

      const targetRow = Array.from(
        scrollArea.querySelectorAll<HTMLElement>('[data-testid="transcript-row"]'),
      ).find((row) => rowDatasetMatchesSearchTarget(row, searchTarget))

      if (targetRow) {
        targetRow.scrollIntoView?.({ block: 'center' })
        return
      }

      attempts += 1
      if (attempts < 6) {
        frame = requestAnimationFrame(scrollRenderedTargetIntoView)
      }
    }

    frame = requestAnimationFrame(scrollRenderedTargetIntoView)

    return () => cancelAnimationFrame(frame)
  }, [renderedSearchTargetKey, searchTarget, transcriptScroll.scrollAreaRef])

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
        className="flex-1 overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable_both-edges]"
        onScroll={transcriptScroll.handleScroll}
      >
        {isLoading && !hasTranscript ? (
          <TranscriptContentFrame contentLayout={contentLayout}>
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
          </TranscriptContentFrame>
        ) : loadingError && !hasTranscript ? (
          <TranscriptContentFrame contentLayout={contentLayout}>
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
          </TranscriptContentFrame>
        ) : items.length === 0 ? (
          <TranscriptContentFrame contentLayout={contentLayout}>
            <StateCard
              icon={FileSearch}
              eyebrow="Transcript"
              title="Transcript unavailable"
              description="Choose a session with artifact-backed transcript data to inspect its chronological conversation history."
            />
          </TranscriptContentFrame>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${transcriptScroll.estimatedTotalHeight}px` }}
          >
            {transcriptScroll.rowsToRender.map((virtualRow) => {
              const entry = items[virtualRow.index]
              if (!entry) return null
              const isSearchTargetMatch = searchTarget
                ? renderItemMatchesSearchTarget(entry, searchTarget)
                : false

              return (
                <div
                  key={virtualRow.key}
                  ref={transcriptScroll.measureElement}
                  data-index={virtualRow.index}
                  data-search-message-id={getRenderItemMessageId(entry) ?? undefined}
                  data-search-tool-call-id={getRenderItemToolCallId(entry) ?? undefined}
                  data-transcript-expanded-tool-count={getExpandedToolCount(
                    entry,
                    expandedToolGroupIds,
                    expandedToolIds,
                    expandedMcpStatusGroupIds,
                  )}
                  data-transcript-row-expanded={getRenderItemExpandedState(
                    entry,
                    expandedToolGroupIds,
                    expandedToolIds,
                    expandedMcpStatusGroupIds,
                  )}
                  data-transcript-row-kind={getRenderItemProfileKind(entry)}
                  data-transcript-source-id={entry.id}
                  data-transcript-tool-count={getRenderItemToolCount(entry)}
                  data-testid="transcript-row"
                  className={`absolute left-0 top-0 w-full pb-1.5 ${
                    isSearchTargetMatch
                      ? 'rounded-lg bg-fd-ember-400/[0.06] ring-1 ring-inset ring-fd-ember-400/30'
                      : ''
                  }`}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <TranscriptContentFrame contentLayout={contentLayout}>
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
                      <StandaloneToolWrapper toolUseId={entry.item.toolUseId}>
                        <HistoricalToolCallRow
                          item={entry.item}
                          expanded={Boolean(expandedToolIds[entry.item.toolUseId])}
                          onToggle={toggleToolCall}
                        />
                      </StandaloneToolWrapper>
                    ) : (
                      <TimelineItemRow item={entry.item} onForkFromMessage={onForkFromMessage} />
                    )}
                  </TranscriptContentFrame>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {hasTranscript ? (
        <TranscriptUserMessageRail
          markers={userMessageMarkers}
          bottomInsetPx={bottomInsetPx}
          onNavigate={transcriptScroll.navigateToRow}
        />
      ) : null}
      <JumpToLatestButton
        visible={transcriptScroll.showJumpButton && hasTranscript}
        bottomInsetPx={bottomInsetPx}
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
          <div key={toolItem.id} data-transcript-tool-use-id={toolItem.toolUseId}>
            <LiveToolRow
              item={toolItem}
              expanded={Boolean(expandedToolIds[toolItem.toolUseId])}
              onToggleTool={onToggleTool}
            />
          </div>
        ) : (
          <div key={toolItem.id} data-transcript-tool-use-id={toolItem.toolUseId}>
            <HistoricalToolCallRow
              item={toolItem}
              expanded={Boolean(expandedToolIds[toolItem.toolUseId])}
              onToggle={onToggleTool}
            />
          </div>
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

function StandaloneToolWrapper({
  children,
  toolUseId,
}: {
  children: ReactNode
  toolUseId: string
}) {
  return (
    <div
      className="my-0.5 overflow-hidden rounded-md border border-fd-border-subtle bg-fd-surface/20 hover:border-fd-border-default transition-colors"
      data-transcript-tool-use-id={toolUseId}
    >
      {children}
    </div>
  )
}

function JumpToLatestButton({
  visible,
  bottomInsetPx = 0,
  onClick,
}: {
  visible: boolean
  bottomInsetPx?: number
  onClick: () => void
}) {
  if (!visible) return null

  return (
    <div
      className="pointer-events-none absolute right-3 z-10"
      style={{ bottom: `${bottomInsetPx + 12}px` }}
    >
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

function TranscriptContentFrame({
  contentLayout,
  children,
}: {
  contentLayout: ContentLayout
  children: ReactNode
}) {
  return (
    <ContentContainer layout={contentLayout} data-testid="transcript-content-frame">
      {children}
    </ContentContainer>
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
