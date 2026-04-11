import { AlertTriangle, ArrowRight, Database, FolderSearch, Search } from 'lucide-react'
import { type RefObject, useMemo } from 'react'

import type {
  FoundationBootstrap,
  LiveSessionAskUserAnswerRecord,
  LiveSessionSnapshot,
  SessionTranscript,
} from '../../../../shared/ipc/contracts'
import type { SessionPreview } from '../../stores/SessionStore'
import { buildHistoricalTimeline } from '../transcript/buildHistoricalTimeline'
import { TranscriptRenderer } from '../transcript/TranscriptRenderer'
import type { TimelineItem } from '../transcript/timelineTypes'
import { Button } from '../ui/button'
import { SkeletonBlock } from '../ui/skeleton'
import { StateCard } from '../ui/state-card'

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
  transcriptScrollSignal: number
  pendingPermissionRequestIds: string[]
  pendingAskUserRequestIds: string[]
  transcriptPrimaryActionRef: RefObject<HTMLElement | null>
  isSidebarHidden: boolean
  sidebarWidth: number
  transportProtocol: string
  onPickDirectory: () => void
  onRefreshFoundation: () => void
  onRetrySelectedTranscript: () => void
  onBrowseSessions: () => void
  onResolvePermissionRequest: (payload: { requestId: string; selectedOption: string }) => void
  onSubmitAskUserResponse: (payload: {
    requestId: string
    answers: LiveSessionAskUserAnswerRecord[]
  }) => void
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
  transcriptScrollSignal,
  pendingPermissionRequestIds,
  pendingAskUserRequestIds,
  transcriptPrimaryActionRef,
  isSidebarHidden: _isSidebarHidden,
  sidebarWidth: _sidebarWidth,
  transportProtocol,
  onPickDirectory,
  onRefreshFoundation,
  onRetrySelectedTranscript,
  onBrowseSessions,
  onResolvePermissionRequest,
  onSubmitAskUserResponse,
}: DetailPanelProps) {
  if (showNewSessionForm) {
    return (
      <div className="rounded-lg border border-fd-border-default bg-fd-surface px-3 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight text-fd-primary">New session</h2>
            <p className="text-sm text-fd-secondary">
              Pick a workspace, then use the composer below to send the first message and kick off
              the session only when you are ready.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="text-[10px] font-medium uppercase tracking-wider text-fd-tertiary"
              htmlFor="new-session-path"
            >
              Workspace directory
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[18rem] flex-1">
                <FolderSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fd-tertiary" />
                <input
                  id="new-session-path"
                  readOnly
                  className="h-8 w-full rounded-md border border-fd-border-default bg-fd-panel pl-10 pr-3 text-sm text-fd-primary outline-none"
                  placeholder="Choose a workspace folder"
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
        </div>
      </div>
    )
  }

  if (isFoundationLoading) {
    return (
      <div className="flex flex-col gap-3">
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
      </div>
    )
  }

  if (hasFoundationError) {
    return (
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
    )
  }

  if (isDroidMissing) {
    return (
      <>
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
      </>
    )
  }

  if (selectedLiveSession) {
    return (
      <LiveSessionTranscriptView
        sessionId={selectedLiveSession.sessionId}
        items={selectedLiveTimeline}
        transcriptPrimaryActionRef={transcriptPrimaryActionRef}
        transcriptScrollSignal={transcriptScrollSignal}
        pendingPermissionRequestIds={pendingPermissionRequestIds}
        pendingAskUserRequestIds={pendingAskUserRequestIds}
        onResolvePermissionRequest={onResolvePermissionRequest}
        onSubmitAskUserResponse={onSubmitAskUserResponse}
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
      <>
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
      </>
    )
  }

  if (!selectedSession) {
    return (
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
    )
  }

  return (
    <HistoricalTranscriptView
      transcript={selectedTranscript}
      sessionId={selectedSession.id}
      transcriptPrimaryActionRef={transcriptPrimaryActionRef}
      transcriptScrollSignal={transcriptScrollSignal}
      isRefreshing={isRefreshingTranscript}
      refreshError={selectedTranscriptRefreshError}
      onRetry={onRetrySelectedTranscript}
    />
  )
}

function LiveSessionTranscriptView({
  sessionId,
  items,
  transcriptPrimaryActionRef,
  transcriptScrollSignal,
  pendingPermissionRequestIds,
  pendingAskUserRequestIds,
  onResolvePermissionRequest,
  onSubmitAskUserResponse,
}: {
  sessionId: string
  items: TimelineItem[]
  transcriptPrimaryActionRef: RefObject<HTMLElement | null>
  transcriptScrollSignal: number
  pendingPermissionRequestIds: string[]
  pendingAskUserRequestIds: string[]
  onResolvePermissionRequest: (payload: { requestId: string; selectedOption: string }) => void
  onSubmitAskUserResponse: (payload: {
    requestId: string
    answers: LiveSessionAskUserAnswerRecord[]
  }) => void
}) {
  return (
    <TranscriptRenderer
      scrollContextKey={sessionId}
      items={items}
      isLive
      isLoading={false}
      scrollToBottomSignal={transcriptScrollSignal}
      primaryActionRef={transcriptPrimaryActionRef}
      pendingPermissionRequestIds={pendingPermissionRequestIds}
      pendingAskUserRequestIds={pendingAskUserRequestIds}
      onResolvePermissionRequest={onResolvePermissionRequest}
      onSubmitAskUserResponse={onSubmitAskUserResponse}
    />
  )
}

function HistoricalTranscriptView({
  transcript,
  sessionId,
  transcriptPrimaryActionRef,
  transcriptScrollSignal,
  isRefreshing,
  refreshError,
  onRetry,
}: {
  transcript: SessionTranscript | null
  sessionId: string
  transcriptPrimaryActionRef: RefObject<HTMLElement | null>
  transcriptScrollSignal: number
  isRefreshing: boolean
  refreshError: string | null
  onRetry: () => void
}) {
  const items = useMemo(() => buildHistoricalTimeline(transcript?.entries ?? []), [transcript])

  return (
    <TranscriptRenderer
      scrollContextKey={transcript?.sessionId ?? sessionId}
      items={items}
      isLive={false}
      isLoading={isRefreshing}
      loadingError={refreshError}
      scrollToBottomSignal={transcriptScrollSignal}
      primaryActionRef={transcriptPrimaryActionRef}
      onRetry={onRetry}
    />
  )
}
