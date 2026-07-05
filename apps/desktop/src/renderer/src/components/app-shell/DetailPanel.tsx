import { AlertTriangle, ArrowRight, Database, FolderSearch, Search } from 'lucide-react'
import { type ReactNode, type RefObject, useMemo } from 'react'

import type {
  FoundationBootstrap,
  LiveSessionAskUserAnswerRecord,
  LiveSessionSnapshot,
  SessionSearchTarget,
  SessionTranscript,
  SessionTranscriptScrollState,
  WorkspaceDirectoryEntry,
} from '../../../../shared/ipc/contracts'
import type { SessionPreview } from '../../state/sessions/session.model'
import type { ContentLayout } from '../../state/ui/ui.model'
import { buildHistoricalTimeline } from '../transcript/buildHistoricalTimeline'
import { deriveLiveSessionStatusIndicator } from '../transcript/liveSessionStatusIndicator'
import { type TranscriptEmptyState, TranscriptRenderer } from '../transcript/TranscriptRenderer'
import type { TimelineItem } from '../transcript/timelineTypes'
import { Button } from '../ui/button'
import { SkeletonBlock } from '../ui/skeleton'
import { StateCard } from '../ui/state-card'
import { ContentContainer } from './ContentContainer'

const DETAIL_LOADING_ROW_IDS = [
  'detail-loading-row-a',
  'detail-loading-row-b',
  'detail-loading-row-c',
]

export interface DetailPanelProps {
  showNewSessionForm: boolean
  isFoundationLoading: boolean
  hasFoundationError: boolean
  isDroidMissing: boolean
  hasIndexedSessions: boolean
  hasDeletedSelection: boolean
  selectedLiveSession: LiveSessionSnapshot | null
  selectedLiveTimeline: TimelineItem[]
  selectedSession: SessionPreview | undefined
  selectedTranscript: SessionTranscript | null
  selectedTranscriptRefreshError: string | null
  isRefreshingTranscript: boolean
  foundation: FoundationBootstrap
  newSessionPath: string
  newSessionError: string | null
  newSessionDirectoryPicker: {
    isOpen: boolean
    isLoading: boolean
    error: string | null
    currentPath: string
    parentPath: string | null
    homePath: string
    entries: WorkspaceDirectoryEntry[]
  }
  transcriptScrollSignal: number
  transcriptSearchTarget: SessionSearchTarget | null
  transcriptScrollPersistenceEnabled: boolean
  transcriptScrollState: SessionTranscriptScrollState | null | undefined
  transcriptBottomInsetPx: number
  pendingPermissionRequestIds: string[]
  pendingAskUserRequestIds: string[]
  transcriptPrimaryActionRef: RefObject<HTMLElement | null>
  transportProtocol: string
  contentLayout: ContentLayout
  onCancelNewSession: () => void
  onCloseNewSessionDirectoryPicker: () => void
  onNavigateNewSessionDirectoryPicker: (path: string | null) => void
  onNewSessionPathChange: (path: string) => void
  onPickDirectory: () => void
  onSelectNewSessionDirectory: (path?: string) => void
  onRefreshFoundation: () => void
  onRetrySelectedTranscript: () => void
  onBrowseSessions: () => void
  onTranscriptScrollStateChange: (state: SessionTranscriptScrollState) => void
  onResolvePermissionRequest: (payload: { requestId: string; selectedOption: string }) => void
  onSubmitAskUserResponse: (payload: {
    requestId: string
    answers: LiveSessionAskUserAnswerRecord[]
  }) => void
  onForkFromMessage?: (messageId: string) => void
}

export function DetailPanel({
  showNewSessionForm,
  isFoundationLoading,
  hasFoundationError,
  isDroidMissing,
  hasIndexedSessions,
  hasDeletedSelection,
  selectedLiveSession,
  selectedLiveTimeline,
  selectedSession,
  selectedTranscript,
  selectedTranscriptRefreshError,
  isRefreshingTranscript,
  foundation,
  newSessionPath,
  newSessionError,
  newSessionDirectoryPicker,
  transcriptScrollSignal,
  transcriptSearchTarget,
  transcriptScrollPersistenceEnabled,
  transcriptScrollState,
  transcriptBottomInsetPx,
  pendingPermissionRequestIds,
  pendingAskUserRequestIds,
  transcriptPrimaryActionRef,
  transportProtocol,
  contentLayout,
  onCancelNewSession,
  onCloseNewSessionDirectoryPicker,
  onNavigateNewSessionDirectoryPicker,
  onNewSessionPathChange,
  onPickDirectory,
  onSelectNewSessionDirectory,
  onRefreshFoundation,
  onRetrySelectedTranscript,
  onBrowseSessions,
  onTranscriptScrollStateChange,
  onResolvePermissionRequest,
  onSubmitAskUserResponse,
  onForkFromMessage,
}: DetailPanelProps) {
  const transcriptEmptyState = selectedSession
    ? getSessionTranscriptEmptyState(selectedSession, foundation)
    : null

  if (showNewSessionForm) {
    return (
      <DetailPanelContentFrame contentLayout={contentLayout}>
        <div className="rounded-lg border border-fd-border-default bg-fd-surface px-3 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold tracking-tight text-fd-primary">
                  New session
                </h2>
                <p className="text-sm text-fd-secondary">
                  Pick a workspace, then use the composer below to send the first message and kick
                  off the session only when you are ready.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="self-start"
                onClick={onCancelNewSession}
              >
                Cancel
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary"
                htmlFor="new-session-path"
              >
                Workspace directory
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <FolderSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fd-tertiary" />
                  <input
                    id="new-session-path"
                    className="h-8 w-full rounded-md border border-fd-border-default bg-fd-panel pl-10 pr-3 text-sm text-fd-primary outline-none"
                    placeholder="Choose a workspace folder"
                    onChange={(event) => onNewSessionPathChange(event.target.value)}
                    value={newSessionPath}
                  />
                </div>
                <Button type="button" variant="secondary" onClick={onPickDirectory}>
                  <FolderSearch />
                  Choose folder
                </Button>
              </div>
            </div>

            {newSessionError ? (
              <p className="rounded-md border border-fd-ember-400/30 bg-fd-ember-500/10 px-3 py-2 text-sm text-fd-ember-400">
                {newSessionError}
              </p>
            ) : null}

            {newSessionDirectoryPicker.isOpen ? (
              <WorkspaceDirectoryPicker
                picker={newSessionDirectoryPicker}
                onClose={onCloseNewSessionDirectoryPicker}
                onNavigate={onNavigateNewSessionDirectoryPicker}
                onSelect={onSelectNewSessionDirectory}
              />
            ) : null}
          </div>
        </div>
      </DetailPanelContentFrame>
    )
  }

  if (isFoundationLoading) {
    return (
      <DetailPanelContentFrame contentLayout={contentLayout} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-10 w-48" />
          <SkeletonBlock className="h-5 w-3/4" />
        </div>

        <div className="flex flex-col gap-2">
          {DETAIL_LOADING_ROW_IDS.map((rowId) => (
            <div
              key={rowId}
              className="rounded-md border border-fd-border-subtle bg-fd-panel px-3 py-2"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <SkeletonBlock className="h-5 w-20 rounded-md" />
                <SkeletonBlock className="h-3 w-28" />
              </div>
              <div className="flex flex-col gap-2">
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-4 w-5/6" />
                <SkeletonBlock className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </DetailPanelContentFrame>
    )
  }

  if (hasFoundationError) {
    return (
      <DetailPanelContentFrame contentLayout={contentLayout}>
        <StateCard
          icon={AlertTriangle}
          eyebrow="Recovery"
          title="Unable to load session data"
          description="OXOX could not refresh its session bootstrap. Retry to restore the latest sidebar, transcript, and context-panel data."
          actions={
            <Button type="button" onClick={onRefreshFoundation}>
              Retry loading sessions
            </Button>
          }
        />
      </DetailPanelContentFrame>
    )
  }

  if (isDroidMissing) {
    return (
      <DetailPanelContentFrame contentLayout={contentLayout} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-fd-primary">
            Droid CLI required
          </h2>
          <p className="text-sm leading-5 text-fd-secondary">
            Install or expose the `droid` binary on your PATH to enable live session control. OXOX
            initialized its local SQLite cache successfully, so the app can render a helpful
            recovery state instead of crashing.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-md border border-fd-border-subtle bg-fd-surface px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
              Searched locations
            </p>
            <code className="mt-1.5 block whitespace-pre-wrap font-mono text-xs leading-5 text-fd-primary">
              {foundation.droidCli.searchedLocations.join('\n') || 'PATH lookup unavailable'}
            </code>
          </div>
          <div className="rounded-md border border-fd-border-subtle bg-fd-surface px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
              SQLite foundation
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <Database className="size-4 text-fd-ember-400" />
              <div>
                <p className="text-sm font-medium text-fd-primary">
                  {foundation.database.journalMode.toUpperCase()} journal mode
                </p>
                <p className="text-xs text-fd-secondary">{foundation.database.path}</p>
              </div>
            </div>
          </div>
        </div>
      </DetailPanelContentFrame>
    )
  }

  if (selectedLiveSession) {
    return (
      <LiveSessionTranscriptView
        session={selectedLiveSession}
        sessionId={selectedLiveSession.sessionId}
        items={selectedLiveTimeline}
        transcriptPrimaryActionRef={transcriptPrimaryActionRef}
        transcriptSearchTarget={transcriptSearchTarget}
        transcriptEmptyState={transcriptEmptyState}
        transcriptScrollSignal={transcriptScrollSignal}
        transcriptScrollPersistenceEnabled={transcriptScrollPersistenceEnabled}
        transcriptScrollState={transcriptScrollState}
        contentLayout={contentLayout}
        bottomInsetPx={transcriptBottomInsetPx}
        pendingPermissionRequestIds={pendingPermissionRequestIds}
        pendingAskUserRequestIds={pendingAskUserRequestIds}
        onResolvePermissionRequest={onResolvePermissionRequest}
        onSubmitAskUserResponse={onSubmitAskUserResponse}
        onForkFromMessage={onForkFromMessage}
        onTranscriptScrollStateChange={onTranscriptScrollStateChange}
      />
    )
  }

  if (hasDeletedSelection) {
    return (
      <StateCard
        icon={AlertTriangle}
        eyebrow="Removed"
        title="Session no longer available"
        description="This session artifact disappeared from `~/.factory/sessions/`. OXOX removed it from the sidebar during the latest poll cycle and kept the app stable."
      />
    )
  }

  if (!hasIndexedSessions) {
    return (
      <DetailPanelContentFrame contentLayout={contentLayout} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold tracking-tight text-fd-primary">
            Waiting for your first indexed session
          </h2>
          <p className="text-sm leading-5 text-fd-secondary">
            As soon as the artifact scanner or daemon reports sessions, OXOX will group them here by
            project and keep the latest activity at the top.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onRefreshFoundation}>
            Refresh now
            <ArrowRight />
          </Button>
          <span className="rounded-md border border-fd-border-subtle bg-fd-surface px-2 py-0.5 text-xs text-fd-tertiary">
            SQLite ready · {transportProtocol}
          </span>
        </div>
      </DetailPanelContentFrame>
    )
  }

  if (!selectedSession) {
    return (
      <DetailPanelContentFrame contentLayout={contentLayout}>
        <StateCard
          icon={Search}
          eyebrow="Detail"
          title="Choose a session to inspect"
          description="Select a session from the sidebar to open its transcript, see workspace details, and jump back into live controls."
          actions={
            <Button type="button" variant="secondary" onClick={onBrowseSessions}>
              Focus session list
            </Button>
          }
        />
      </DetailPanelContentFrame>
    )
  }

  return (
    <HistoricalTranscriptView
      transcript={selectedTranscript}
      sessionId={selectedSession.id}
      transcriptEmptyState={transcriptEmptyState}
      transcriptPrimaryActionRef={transcriptPrimaryActionRef}
      transcriptSearchTarget={transcriptSearchTarget}
      transcriptScrollSignal={transcriptScrollSignal}
      transcriptScrollPersistenceEnabled={transcriptScrollPersistenceEnabled}
      transcriptScrollState={transcriptScrollState}
      contentLayout={contentLayout}
      bottomInsetPx={transcriptBottomInsetPx}
      isRefreshing={isRefreshingTranscript}
      refreshError={selectedTranscriptRefreshError}
      onRetry={onRetrySelectedTranscript}
      onForkFromMessage={onForkFromMessage}
      onTranscriptScrollStateChange={onTranscriptScrollStateChange}
    />
  )
}

function WorkspaceDirectoryPicker({
  picker,
  onClose,
  onNavigate,
  onSelect,
}: {
  picker: DetailPanelProps['newSessionDirectoryPicker']
  onClose: () => void
  onNavigate: (path: string | null) => void
  onSelect: (path?: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-fd-border-subtle bg-fd-panel">
      <div className="flex flex-col gap-2 border-b border-fd-border-subtle px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
            Browse daemon folders
          </p>
          <p className="truncate font-mono text-xs text-fd-primary" title={picker.currentPath}>
            {picker.currentPath || 'Loading…'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!picker.homePath || picker.isLoading}
            onClick={() => onNavigate(picker.homePath)}
          >
            Home
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!picker.parentPath || picker.isLoading}
            onClick={() => onNavigate(picker.parentPath)}
          >
            Up
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!picker.currentPath || picker.isLoading}
            onClick={() => onSelect()}
          >
            Use this folder
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {picker.error ? (
        <p className="m-3 rounded-md border border-fd-ember-400/30 bg-fd-ember-500/10 px-3 py-2 text-sm text-fd-ember-400">
          {picker.error}
        </p>
      ) : null}

      <div className="max-h-72 overflow-y-auto p-1.5">
        {picker.isLoading ? (
          <p className="px-2 py-4 text-center text-xs text-fd-tertiary">Loading folders…</p>
        ) : picker.entries.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {picker.entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-fd-secondary hover:bg-fd-surface-hover hover:text-fd-primary"
                onClick={() => onNavigate(entry.path)}
              >
                <FolderSearch className="size-3.5 shrink-0 text-fd-tertiary" />
                <span className="truncate">{entry.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-2 py-4 text-center text-xs text-fd-tertiary">No child folders found.</p>
        )}
      </div>
    </div>
  )
}

function LiveSessionTranscriptView({
  session,
  sessionId,
  items,
  transcriptPrimaryActionRef,
  transcriptSearchTarget,
  transcriptEmptyState,
  transcriptScrollSignal,
  transcriptScrollPersistenceEnabled,
  transcriptScrollState,
  contentLayout,
  bottomInsetPx,
  pendingPermissionRequestIds,
  pendingAskUserRequestIds,
  onResolvePermissionRequest,
  onSubmitAskUserResponse,
  onForkFromMessage,
  onTranscriptScrollStateChange,
}: {
  session: LiveSessionSnapshot
  sessionId: string
  items: TimelineItem[]
  transcriptPrimaryActionRef: RefObject<HTMLElement | null>
  transcriptSearchTarget: SessionSearchTarget | null
  transcriptEmptyState: TranscriptEmptyState | null
  transcriptScrollSignal: number
  transcriptScrollPersistenceEnabled: boolean
  transcriptScrollState: SessionTranscriptScrollState | null | undefined
  contentLayout: ContentLayout
  bottomInsetPx: number
  pendingPermissionRequestIds: string[]
  pendingAskUserRequestIds: string[]
  onResolvePermissionRequest: (payload: { requestId: string; selectedOption: string }) => void
  onSubmitAskUserResponse: (payload: {
    requestId: string
    answers: LiveSessionAskUserAnswerRecord[]
  }) => void
  onForkFromMessage?: (messageId: string) => void
  onTranscriptScrollStateChange: (state: SessionTranscriptScrollState) => void
}) {
  const statusIndicator = useMemo(
    () => deriveLiveSessionStatusIndicator(session, items),
    [session, items],
  )

  return (
    <TranscriptRenderer
      scrollContextKey={sessionId}
      items={items}
      isLive
      statusIndicator={statusIndicator}
      isLoading={false}
      emptyState={transcriptEmptyState}
      searchTarget={transcriptSearchTarget}
      scrollToBottomSignal={transcriptScrollSignal}
      scrollPersistenceEnabled={transcriptScrollPersistenceEnabled}
      scrollRestoreState={transcriptScrollState}
      contentLayout={contentLayout}
      bottomInsetPx={bottomInsetPx}
      primaryActionRef={transcriptPrimaryActionRef}
      pendingPermissionRequestIds={pendingPermissionRequestIds}
      pendingAskUserRequestIds={pendingAskUserRequestIds}
      onResolvePermissionRequest={onResolvePermissionRequest}
      onSubmitAskUserResponse={onSubmitAskUserResponse}
      onForkFromMessage={onForkFromMessage}
      onScrollStateChange={onTranscriptScrollStateChange}
    />
  )
}

function HistoricalTranscriptView({
  transcript,
  sessionId,
  transcriptEmptyState,
  transcriptPrimaryActionRef,
  transcriptSearchTarget,
  transcriptScrollSignal,
  transcriptScrollPersistenceEnabled,
  transcriptScrollState,
  contentLayout,
  bottomInsetPx,
  isRefreshing,
  refreshError,
  onRetry,
  onForkFromMessage,
  onTranscriptScrollStateChange,
}: {
  transcript: SessionTranscript | null
  sessionId: string
  transcriptEmptyState: TranscriptEmptyState | null
  transcriptPrimaryActionRef: RefObject<HTMLElement | null>
  transcriptSearchTarget: SessionSearchTarget | null
  transcriptScrollSignal: number
  transcriptScrollPersistenceEnabled: boolean
  transcriptScrollState: SessionTranscriptScrollState | null | undefined
  contentLayout: ContentLayout
  bottomInsetPx: number
  isRefreshing: boolean
  refreshError: string | null
  onRetry: () => void
  onForkFromMessage?: (messageId: string) => void
  onTranscriptScrollStateChange: (state: SessionTranscriptScrollState) => void
}) {
  const items = useMemo(() => buildHistoricalTimeline(transcript?.entries ?? []), [transcript])

  return (
    <TranscriptRenderer
      scrollContextKey={transcript?.sessionId ?? sessionId}
      items={items}
      isLive={false}
      isLoading={isRefreshing}
      emptyState={transcriptEmptyState}
      loadingError={refreshError}
      searchTarget={transcriptSearchTarget}
      scrollToBottomSignal={transcriptScrollSignal}
      scrollPersistenceEnabled={transcriptScrollPersistenceEnabled}
      scrollRestoreState={transcriptScrollState}
      contentLayout={contentLayout}
      bottomInsetPx={bottomInsetPx}
      primaryActionRef={transcriptPrimaryActionRef}
      onForkFromMessage={onForkFromMessage}
      onScrollStateChange={onTranscriptScrollStateChange}
      onRetry={onRetry}
    />
  )
}

function getSessionTranscriptEmptyState(
  session: SessionPreview,
  foundation: FoundationBootstrap,
): TranscriptEmptyState | null {
  if (session.derivationType !== 'compact') {
    return null
  }

  const parentLabel = getParentSessionLabel(session.parentSessionId, foundation)
  const parentReference = parentLabel ? ` from ${parentLabel}` : ''

  return {
    eyebrow: 'Compacted context',
    title: 'Fresh session after compaction',
    description: `Droid created this session${parentReference} with a fresh transcript and no copied message history. The previous conversation remains available in the parent session.`,
  }
}

function getParentSessionLabel(
  parentSessionId: string | null,
  foundation: FoundationBootstrap,
): string | null {
  if (!parentSessionId) {
    return null
  }

  const parent = foundation.sessions.find((session) => session.id === parentSessionId)
  const title = parent?.title?.trim()

  return title ? `"${title}"` : parentSessionId
}

function DetailPanelContentFrame({
  contentLayout,
  children,
  className,
}: {
  contentLayout: ContentLayout
  children: ReactNode
  className?: string
}) {
  return (
    <ContentContainer layout={contentLayout} className={className}>
      {children}
    </ContentContainer>
  )
}
