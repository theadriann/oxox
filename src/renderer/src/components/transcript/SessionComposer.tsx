import { ArrowUp, Loader2, Plug, Square, X } from 'lucide-react'
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import type {
  LiveSessionMessageImageSource,
  LiveSessionModel,
} from '../../../../shared/ipc/contracts'
import type { ComposerImageAttachment } from '../../state/composer/composer.types'
import type { ComposerContextUsageState } from '../../state/composer/composer-context-usage.selectors'
import type { ModelPickerViewModel } from '../../state/model-picker/model-picker.model'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { ModelPicker } from './ModelPicker'

const MODE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'spec', label: 'Spec' },
  { value: 'agi', label: 'AGI' },
] as const

const AUTONOMY_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const

const REASONING_LABELS: Record<string, string> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
  xhigh: 'XHigh',
  minimal: 'Minimal',
  none: 'None',
}

const TEXTAREA_MAX_HEIGHT = 200
const ACCEPTED_IMAGE_TYPES = new Set<LiveSessionMessageImageSource['mediaType']>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

export interface WorkspaceFileSearchState {
  enabled: boolean
  files: string[]
  isLoading: boolean
  onQueryChange: (query: string) => void
}

interface ActiveWorkspaceFileMention {
  start: number
  end: number
  query: string
}

export interface SessionComposerProps {
  draft: string
  selectedModelId: string
  selectedMode: string
  selectedReasoningEffort: string
  selectedAutonomyLevel: string
  imageAttachments: ComposerImageAttachment[]
  availableModels: LiveSessionModel[]
  status: 'idle' | 'active' | 'waiting' | 'completed' | 'reconnecting' | 'orphaned' | 'error'
  isAttached: boolean
  canAttach: boolean
  canComposeDetached?: boolean
  isSubmitting: boolean
  isAttaching: boolean
  isInterrupting: boolean
  composerContextUsage: ComposerContextUsageState | null
  composerContextUsageDisplayMode: 'percentage' | 'tokens'
  workspaceFileSearch?: WorkspaceFileSearchState
  modelPickerViewModel: ModelPickerViewModel
  onDraftChange: (value: string) => void
  onModelChange: (value: string) => void
  onModeChange: (value: string) => void
  onReasoningEffortChange: (value: string) => void
  onAutonomyLevelChange: (value: string) => void
  onImageAttachmentsAdd: (attachments: ComposerImageAttachment[]) => void
  onImageAttachmentRemove: (attachmentId: string) => void
  onImageAttachmentsClear: () => void
  onModelPickerSearchChange: (query: string) => void
  onModelPickerToggleFavorite: (modelId: string) => void
  onModelPickerCategoryChange: (category: string) => void
  onSubmit: (payload: {
    text: string
    modelId: string
    interactionMode: string
    reasoningEffort?: string
    autonomyLevel: string
    images?: LiveSessionMessageImageSource[]
  }) => void
  onAttach: () => void
  onInterrupt: () => void
}

export function SessionComposer({
  draft,
  selectedModelId,
  selectedMode,
  selectedReasoningEffort,
  selectedAutonomyLevel,
  imageAttachments,
  availableModels,
  status,
  isAttached,
  canAttach,
  canComposeDetached = canAttach,
  isSubmitting,
  isAttaching,
  isInterrupting,
  composerContextUsage,
  composerContextUsageDisplayMode,
  workspaceFileSearch,
  modelPickerViewModel,
  onDraftChange,
  onModelChange,
  onModeChange,
  onReasoningEffortChange,
  onAutonomyLevelChange,
  onImageAttachmentsAdd,
  onImageAttachmentRemove,
  onImageAttachmentsClear,
  onModelPickerSearchChange,
  onModelPickerToggleFavorite,
  onModelPickerCategoryChange,
  onSubmit,
  onAttach,
  onInterrupt,
}: SessionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [activeWorkspaceFileMention, setActiveWorkspaceFileMention] =
    useState<ActiveWorkspaceFileMention | null>(null)
  const trimmedDraft = draft.trim()
  const isRecovering = status === 'reconnecting' || status === 'orphaned' || status === 'error'
  const isWorking = isAttached && (status === 'active' || status === 'waiting')
  const isCompleted = status === 'completed'
  const isConnected = isAttached && !isRecovering && !isCompleted
  const canUseComposer = isConnected || canComposeDetached
  const areSelectorsDisabled =
    isCompleted || isSubmitting || isAttaching || (!isConnected && !canComposeDetached)
  const isEditorDisabled =
    isSubmitting || isAttaching || isCompleted || (!isConnected && !canComposeDetached)
  const isSendDisabled =
    isEditorDisabled || (trimmedDraft.length === 0 && imageAttachments.length === 0)
  const attachActionLabel = isRecovering ? 'Reconnect' : 'Attach'
  const modelOptions =
    availableModels.length > 0
      ? availableModels
      : selectedModelId
        ? [{ id: selectedModelId, name: selectedModelId }]
        : []
  const selectedModel = modelOptions.find((model) => model.id === selectedModelId)
  const reasoningEffortOptions = selectedModel?.supportedReasoningEfforts ?? []
  const isWorkspaceFileSearchEnabled = Boolean(workspaceFileSearch?.enabled && !isEditorDisabled)
  const isWorkspaceFilePopoverVisible =
    isWorkspaceFileSearchEnabled && activeWorkspaceFileMention !== null

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: draft triggers textarea resize
  useEffect(() => {
    resizeTextarea()
  }, [draft, resizeTextarea])

  const handleSubmit = () => {
    if (isSendDisabled) return
    onSubmit({
      text: trimmedDraft,
      modelId: selectedModelId,
      interactionMode: selectedMode,
      ...(reasoningEffortOptions.length > 0 && selectedReasoningEffort
        ? { reasoningEffort: selectedReasoningEffort }
        : {}),
      autonomyLevel: selectedAutonomyLevel,
      ...(imageAttachments.length > 0
        ? { images: imageAttachments.map(toMessageImageSource) }
        : {}),
    })
  }

  const syncWorkspaceFileMention = useCallback(
    (value: string, cursor: number) => {
      if (!isWorkspaceFileSearchEnabled || !workspaceFileSearch) {
        setActiveWorkspaceFileMention(null)
        return
      }

      const mention = getActiveWorkspaceFileMention(value, cursor)
      setActiveWorkspaceFileMention(mention)

      if (mention) {
        workspaceFileSearch.onQueryChange(mention.query)
      }
    },
    [isWorkspaceFileSearchEnabled, workspaceFileSearch],
  )

  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextDraft = event.currentTarget.value
    const cursor = event.currentTarget.selectionStart ?? nextDraft.length

    onDraftChange(nextDraft)
    syncWorkspaceFileMention(nextDraft, cursor)
  }

  const handleTextareaSelect = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    syncWorkspaceFileMention(
      event.currentTarget.value,
      event.currentTarget.selectionStart ?? event.currentTarget.value.length,
    )
  }

  const handleWorkspaceFileSelect = (filePath: string) => {
    if (!activeWorkspaceFileMention) {
      return
    }

    const mentionText = `@${filePath}`
    const nextDraft = replaceWorkspaceFileMention(draft, activeWorkspaceFileMention, mentionText)
    onDraftChange(nextDraft)
    setActiveWorkspaceFileMention(null)

    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      const nextCursor = activeWorkspaceFileMention.start + mentionText.length + 1
      textarea.focus()
      textarea.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const handleImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter(isAcceptedImageFile)
      if (imageFiles.length === 0 || isEditorDisabled) return

      const attachments = await Promise.all(imageFiles.map(readImageFileAsAttachment))
      onImageAttachmentsAdd(attachments)
    },
    [isEditorDisabled, onImageAttachmentsAdd],
  )

  const handleDroppedFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || isEditorDisabled) return

      const imageFiles = files.filter(isAcceptedImageFile)
      const droppedPaths = files
        .filter((file) => !isAcceptedImageFile(file))
        .flatMap((file) => {
          const path = getDroppedFilePath(file)
          return path ? [path] : []
        })

      if (droppedPaths.length > 0) {
        onDraftChange(appendDroppedPaths(draft, droppedPaths))
      }

      if (imageFiles.length > 0) {
        const attachments = await Promise.all(imageFiles.map(readImageFileAsAttachment))
        onImageAttachmentsAdd(attachments)
      }
    },
    [draft, isEditorDisabled, onDraftChange, onImageAttachmentsAdd],
  )

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = extractImageFilesFromItems(event.clipboardData.items)
    if (files.length === 0) return

    event.preventDefault()
    void handleImageFiles(files)
  }

  const handleDragOver = (event: DragEvent<HTMLTextAreaElement>) => {
    if (isEditorDisabled || !hasFileDataTransferItems(event.dataTransfer.items)) return
    event.preventDefault()
  }

  const handleDrop = (event: DragEvent<HTMLTextAreaElement>) => {
    const files = extractFilesFromDataTransfer(event.dataTransfer)
    if (files.length === 0) return

    event.preventDefault()
    void handleDroppedFiles(files)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === ' ') {
      setActiveWorkspaceFileMention(null)
    }

    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    handleSubmit()
  }

  const statusText = isCompleted
    ? 'Session ended'
    : status === 'orphaned'
      ? 'Reconnect to continue'
      : status === 'reconnecting'
        ? 'Reconnecting...'
        : status === 'error'
          ? 'Error — reconnect'
          : !isAttached && canAttach
            ? 'Detached'
            : !isAttached
              ? 'Ended'
              : isWorking
                ? 'Generating...'
                : 'Ready'

  return (
    <>
      {imageAttachments.length > 0 ? (
        <div
          data-testid="image-attachment-container"
          className="max-h-[150px] overflow-y-auto border-b border-fd-border-subtle bg-fd-surface/30 px-3 py-2"
        >
          <div className="flex flex-wrap gap-2">
            {imageAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group flex max-w-[180px] items-center gap-2 rounded-md border border-fd-border-subtle bg-fd-surface-elevated/70 p-1.5"
              >
                <img
                  alt={`${attachment.name} attachment preview`}
                  className="size-9 rounded border border-fd-border-subtle object-cover"
                  src={`data:${attachment.mediaType};base64,${attachment.data}`}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-fd-secondary">
                  {attachment.name}
                </span>
                <button
                  aria-label={`Remove ${attachment.name} attachment`}
                  className="ox-icon-button flex size-5 shrink-0 items-center justify-center"
                  type="button"
                  onClick={() => onImageAttachmentRemove(attachment.id)}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
          {imageAttachments.length > 1 ? (
            <div className="mt-2 flex justify-start">
              <button
                aria-label="Clear all image attachments"
                className="rounded px-2 py-1 text-[10px] font-medium text-fd-tertiary transition-colors hover:bg-fd-surface-hover hover:text-fd-primary"
                type="button"
                onClick={onImageAttachmentsClear}
              >
                Clear all
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isWorkspaceFilePopoverVisible ? (
        <WorkspaceFileMentionPopover
          files={workspaceFileSearch?.files ?? []}
          isLoading={workspaceFileSearch?.isLoading ?? false}
          onSelect={handleWorkspaceFileSelect}
        />
      ) : null}

      <textarea
        ref={textareaRef}
        aria-label="Message composer"
        className="w-full resize-none border-0 bg-transparent px-3 py-2.5 text-[13px] leading-[19px] text-fd-primary outline-none transition-colors placeholder:text-fd-quaternary focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isEditorDisabled}
        placeholder={
          isWorking
            ? 'Queue a follow-up for the next turn'
            : canUseComposer
              ? 'Ask anything, @tag files/folders, or use / to show available commands'
              : 'Connect to send a message'
        }
        rows={2}
        style={{ maxHeight: `${TEXTAREA_MAX_HEIGHT}px` }}
        value={draft}
        onChange={handleDraftChange}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onSelect={handleTextareaSelect}
      />

      <div className="flex items-center justify-between gap-2 border-t border-fd-border-subtle bg-fd-surface/25 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          {(!isConnected || !isAttached) && canAttach ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={attachActionLabel}
                    disabled={isAttaching}
                    onClick={onAttach}
                  >
                    {isAttaching ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plug className="size-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  {attachActionLabel}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}

          <ModelPicker
            models={modelOptions}
            selectedModelId={selectedModelId}
            disabled={areSelectorsDisabled}
            onModelChange={onModelChange}
            viewModel={modelPickerViewModel}
            onSearchChange={onModelPickerSearchChange}
            onToggleFavorite={onModelPickerToggleFavorite}
            onCategoryChange={onModelPickerCategoryChange}
          />

          <Select value={selectedMode} onValueChange={onModeChange} disabled={areSelectorsDisabled}>
            <SelectTrigger
              aria-label="Mode selector"
              size="sm"
              className="h-6 min-w-0 gap-1 border-fd-border-subtle bg-fd-surface/35 px-2 text-[11px] text-fd-tertiary dark:bg-fd-surface/35"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={6} className="min-w-[100px]">
              {MODE_OPTIONS.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  <span className="text-xs">{mode.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {reasoningEffortOptions.length > 0 ? (
            <Select
              value={selectedReasoningEffort}
              onValueChange={onReasoningEffortChange}
              disabled={areSelectorsDisabled}
            >
              <SelectTrigger
                aria-label="Reasoning effort selector"
                size="sm"
                className="h-6 min-w-0 gap-1 border-fd-border-subtle bg-fd-surface/35 px-2 text-[11px] text-fd-tertiary dark:bg-fd-surface/35"
              >
                <span className="mr-0.5 text-[10px] text-fd-quaternary">Reasoning</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className="min-w-[110px]">
                {reasoningEffortOptions.map((effort) => (
                  <SelectItem key={effort} value={effort}>
                    <span className="text-xs">{REASONING_LABELS[effort] ?? effort}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Select
            value={selectedAutonomyLevel}
            onValueChange={onAutonomyLevelChange}
            disabled={areSelectorsDisabled}
          >
            <SelectTrigger
              aria-label="Autonomy level selector"
              size="sm"
              className="h-6 min-w-0 gap-1 border-fd-border-subtle bg-fd-surface/35 px-2 text-[11px] text-fd-tertiary dark:bg-fd-surface/35"
            >
              <span className="text-[10px] text-fd-quaternary mr-0.5">Autonomy</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={6} className="min-w-[100px]">
              {AUTONOMY_OPTIONS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  <span className="text-xs">{level.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-fd-tertiary">{statusText}</span>
          <ContextUsageIndicator
            usage={composerContextUsage}
            displayMode={composerContextUsageDisplayMode}
          />

          {isWorking ? (
            <button
              aria-label="Stop generation"
              className="flex size-6 cursor-pointer items-center justify-center rounded-md bg-fd-warning text-fd-canvas shadow-sm transition-colors hover:bg-fd-warning/90 disabled:opacity-40"
              disabled={isInterrupting}
              type="button"
              onClick={onInterrupt}
            >
              {isInterrupting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Square className="size-3" />
              )}
            </button>
          ) : (
            <button
              aria-label="Send message"
              className="flex size-6 cursor-pointer items-center justify-center rounded-md bg-fd-primary text-fd-canvas shadow-sm transition-colors hover:bg-fd-primary/90 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={isSendDisabled}
              type="button"
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <ArrowUp className="size-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function WorkspaceFileMentionPopover({
  files,
  isLoading,
  onSelect,
}: {
  files: string[]
  isLoading: boolean
  onSelect: (filePath: string) => void
}) {
  const [scrollState, setScrollState] = useState({
    canScrollDown: false,
    canScrollUp: false,
    fileCount: -1,
  })
  const hasMeasuredCurrentList = scrollState.fileCount === files.length
  const showTopShadow = hasMeasuredCurrentList && scrollState.canScrollUp
  const showBottomShadow =
    !isLoading && (hasMeasuredCurrentList ? scrollState.canScrollDown : files.length > 6)

  const handleScroll = (event: SyntheticEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    const canScrollUp = element.scrollTop > 0
    const canScrollDown = element.scrollTop + element.clientHeight < element.scrollHeight - 1

    setScrollState({
      canScrollDown,
      canScrollUp,
      fileCount: files.length,
    })
  }

  return (
    <div
      data-testid="workspace-file-search-panel"
      className="relative border-b border-fd-border-subtle bg-fd-surface-elevated/95 shadow-[0_-1px_0_rgba(255,255,255,0.03)_inset]"
    >
      {showTopShadow ? (
        <div
          data-testid="workspace-file-search-top-shadow"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-linear-to-b from-fd-canvas/45 to-transparent"
        />
      ) : null}
      <div
        aria-label="Workspace files"
        role="listbox"
        className="max-h-48 overflow-y-auto p-1"
        onScroll={handleScroll}
      >
        {isLoading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-[12px] text-fd-tertiary">
            <Loader2 className="size-3 animate-spin" />
            Searching files…
          </div>
        ) : files.length === 0 ? (
          <div className="px-2 py-2 text-[12px] text-fd-tertiary">No matching files</div>
        ) : (
          files.map((filePath) => (
            <button
              key={filePath}
              type="button"
              role="option"
              aria-selected="false"
              className="flex w-full min-w-0 items-center rounded-md px-2 py-1.5 text-left text-[12px] text-fd-secondary transition-colors hover:bg-fd-surface-hover hover:text-fd-primary"
              onClick={() => onSelect(filePath)}
            >
              <span className="truncate font-mono">{filePath}</span>
            </button>
          ))
        )}
      </div>
      {showBottomShadow ? (
        <div
          data-testid="workspace-file-search-bottom-shadow"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 bg-linear-to-t from-fd-canvas/55 to-transparent"
        />
      ) : null}
    </div>
  )
}

function ContextUsageIndicator({
  usage,
  displayMode,
}: {
  usage: ComposerContextUsageState | null
  displayMode: 'percentage' | 'tokens'
}) {
  const label =
    usage === null
      ? '--'
      : displayMode === 'tokens'
        ? `${formatCompactTokens(usage.usedContext)}/${formatCompactTokens(usage.contextLimit)}`
        : `${usage.usedPercentage}%`
  const tooltipSummary = usage
    ? [
        `${usage.usedPercentage}% · ${formatCompactTokens(usage.usedContext)}/${formatCompactTokens(usage.contextLimit)} context used`,
        formatContextUsageAccuracy(usage),
        usage.totalProcessedTokens === null
          ? null
          : `Total processed: ${formatCompactTokens(usage.totalProcessedTokens)} tokens`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n')
    : 'Context usage is unavailable yet.'

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Context usage"
            title={tooltipSummary}
            className="inline-flex min-w-8 items-center justify-center rounded-full border border-fd-border-default px-2 py-0.5 text-[10px] font-medium tabular-nums text-fd-secondary"
          >
            {label}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-[260px]">
          {usage ? (
            <div className="space-y-1 text-[11px]">
              <p className="font-medium">
                {`${usage.usedPercentage}% · ${formatCompactTokens(usage.usedContext)}/${formatCompactTokens(usage.contextLimit)} context used`}
              </p>
              <p className="opacity-70">{formatContextUsageAccuracy(usage)}</p>
              {usage.totalProcessedTokens === null ? null : (
                <p className="opacity-70">
                  Total processed: {formatCompactTokens(usage.totalProcessedTokens)} tokens
                </p>
              )}
              <p className="opacity-50">
                Token processing can include cached reads without increasing context in use.
              </p>
            </div>
          ) : (
            <p className="text-[11px] opacity-70">Context usage is unavailable yet.</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function getActiveWorkspaceFileMention(
  value: string,
  cursor: number,
): ActiveWorkspaceFileMention | null {
  if (cursor < 1 || cursor > value.length) {
    return null
  }

  const beforeCursor = value.slice(0, cursor)
  const tokenStart = Math.max(
    beforeCursor.lastIndexOf(' '),
    beforeCursor.lastIndexOf('\n'),
    beforeCursor.lastIndexOf('\t'),
  )
  const start = tokenStart + 1
  const token = beforeCursor.slice(start)

  if (!token.startsWith('@') || /\s/.test(token) || token.length < 1) {
    return null
  }

  return {
    start,
    end: cursor,
    query: token.slice(1),
  }
}

function replaceWorkspaceFileMention(
  draft: string,
  mention: ActiveWorkspaceFileMention,
  mentionText: string,
): string {
  const suffix = draft.slice(mention.end)
  const separator = suffix.startsWith(' ') ? '' : ' '
  return `${draft.slice(0, mention.start)}${mentionText}${separator}${suffix}`
}

function formatContextUsageAccuracy(usage: ComposerContextUsageState): string {
  if (usage.source !== 'sdk-context-stats') {
    return 'Estimated from the latest token usage event.'
  }

  return usage.accuracy === 'exact'
    ? 'Exact actual context in use from Droid.'
    : 'Estimated actual context in use from Droid.'
}

function formatCompactTokens(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 0,
  })
    .format(value)
    .toLowerCase()
}

function isAcceptedImageFile(
  file: File,
): file is File & { type: LiveSessionMessageImageSource['mediaType'] } {
  return ACCEPTED_IMAGE_TYPES.has(file.type as LiveSessionMessageImageSource['mediaType'])
}

function extractImageFilesFromItems(items: DataTransferItemList): File[] {
  return Array.from(items)
    .filter((item) => item.kind === 'file')
    .flatMap((item) => {
      const file = item.getAsFile()
      return file && isAcceptedImageFile(file) ? [file] : []
    })
}

function extractFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const itemFiles = dataTransfer.items ? extractFilesFromItems(dataTransfer.items) : []
  if (itemFiles.length > 0) return itemFiles

  return Array.from(dataTransfer.files)
}

function extractFilesFromItems(items: DataTransferItemList): File[] {
  return Array.from(items)
    .filter((item) => item.kind === 'file')
    .flatMap((item) => {
      const file = item.getAsFile()
      return file ? [file] : []
    })
}

function hasFileDataTransferItems(items: DataTransferItemList): boolean {
  return Array.from(items).some((item) => item.kind === 'file')
}

function getDroppedFilePath(file: File): string | null {
  const bridgePath = window.oxox?.dialog.getPathForFile?.(file)
  if (bridgePath) return bridgePath

  const path = Reflect.get(file, 'path')
  return typeof path === 'string' && path.length > 0 ? path : null
}

function appendDroppedPaths(draft: string, paths: string[]): string {
  const pathText = paths.map(quoteDroppedPath).join('\n')
  if (draft.length === 0) return pathText
  return draft.endsWith('\n') ? `${draft}${pathText}` : `${draft}\n${pathText}`
}

function quoteDroppedPath(path: string): string {
  return `"${path.replaceAll('"', '\\"')}"`
}

function readImageFileAsAttachment(file: File): Promise<ComposerImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const data = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result

      resolve({
        id: createImageAttachmentId(file),
        name: file.name,
        size: file.size,
        type: 'base64',
        mediaType: file.type as LiveSessionMessageImageSource['mediaType'],
        data,
      })
    }

    reader.readAsDataURL(file)
  })
}

function createImageAttachmentId(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2)}`
}

function toMessageImageSource(attachment: ComposerImageAttachment): LiveSessionMessageImageSource {
  return {
    type: 'base64',
    mediaType: attachment.mediaType,
    data: attachment.data,
  }
}
