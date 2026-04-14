import { ArrowUp, Loader2, Plug, Square } from 'lucide-react'
import { type KeyboardEvent, useCallback, useEffect, useRef } from 'react'

import type { LiveSessionModel } from '../../../../shared/ipc/contracts'
import type { ComposerContextUsageState } from '../../stores/composerContextUsage'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { ModelSelector } from './ModelSelector'

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

export interface SessionComposerProps {
  draft: string
  selectedModelId: string
  selectedMode: string
  selectedReasoningEffort: string
  selectedAutonomyLevel: string
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
  onDraftChange: (value: string) => void
  onModelChange: (value: string) => void
  onModeChange: (value: string) => void
  onReasoningEffortChange: (value: string) => void
  onAutonomyLevelChange: (value: string) => void
  onSubmit: (payload: {
    text: string
    modelId: string
    interactionMode: string
    reasoningEffort?: string
    autonomyLevel: string
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
  onDraftChange,
  onModelChange,
  onModeChange,
  onReasoningEffortChange,
  onAutonomyLevelChange,
  onSubmit,
  onAttach,
  onInterrupt,
}: SessionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const trimmedDraft = draft.trim()
  const isRecovering = status === 'reconnecting' || status === 'orphaned' || status === 'error'
  const isWorking = isAttached && (status === 'active' || status === 'waiting')
  const isCompleted = status === 'completed'
  const isConnected = isAttached && !isRecovering && !isCompleted
  const canUseComposer = isConnected || canComposeDetached
  const areSelectorsDisabled =
    isCompleted || isSubmitting || isAttaching || (!isConnected && !canComposeDetached)
  const isEditorDisabled =
    isSubmitting || isAttaching || isCompleted || (!isConnected && !canComposeDetached) || isWorking
  const isSendDisabled = isEditorDisabled || trimmedDraft.length === 0
  const attachActionLabel = isRecovering ? 'Reconnect' : 'Attach'
  const modelOptions =
    availableModels.length > 0
      ? availableModels
      : selectedModelId
        ? [{ id: selectedModelId, name: selectedModelId }]
        : []
  const selectedModel = modelOptions.find((model) => model.id === selectedModelId)
  const reasoningEffortOptions = selectedModel?.supportedReasoningEfforts ?? []

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
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
      <textarea
        ref={textareaRef}
        aria-label="Message composer"
        className="w-full resize-none border-0 bg-transparent px-3 py-2 text-[13px] leading-[18px] text-fd-primary outline-none transition-colors placeholder:text-fd-tertiary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isEditorDisabled}
        placeholder={
          isWorking
            ? 'Agent is generating...'
            : canUseComposer
              ? 'Ask anything, @tag files/folders, or use / to show available commands'
              : 'Connect to send a message'
        }
        rows={2}
        style={{ maxHeight: `${TEXTAREA_MAX_HEIGHT}px` }}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="flex items-center justify-between gap-2 border-t border-fd-border-subtle px-2 py-1.5">
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

          <ModelSelector
            models={modelOptions}
            selectedModelId={selectedModelId}
            disabled={areSelectorsDisabled}
            onModelChange={onModelChange}
          />

          <Select value={selectedMode} onValueChange={onModeChange} disabled={areSelectorsDisabled}>
            <SelectTrigger
              aria-label="Mode selector"
              size="sm"
              className="h-6 min-w-0 gap-1 border-input bg-transparent px-2 text-[11px] text-fd-tertiary dark:bg-transparent"
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
                className="h-6 min-w-0 gap-1 border-input bg-transparent px-2 text-[11px] text-fd-tertiary dark:bg-transparent"
              >
                <span className="mr-0.5 text-[10px] text-fd-quaternary">Reasoning</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className="min-w-[110px]">
                {reasoningEffortOptions.map((effort) => (
                  <SelectItem key={effort} value={effort}>
                    <span className="text-xs">
                      {REASONING_LABELS[effort] ?? effort}
                    </span>
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
              className="h-6 min-w-0 gap-1 border-input bg-transparent px-2 text-[11px] text-fd-tertiary dark:bg-transparent"
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
              className="flex size-6 cursor-pointer items-center justify-center rounded-md bg-fd-ember-400 text-white transition-colors hover:bg-fd-ember-500 disabled:opacity-40"
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
              className="flex size-6 cursor-pointer items-center justify-center rounded-md bg-fd-primary text-fd-canvas transition-colors hover:bg-fd-primary/80 disabled:opacity-30 disabled:cursor-not-allowed"
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
    ? `${usage.usedPercentage}% · ${formatCompactTokens(usage.usedContext)}/${formatCompactTokens(usage.contextLimit)} context used\nTotal processed: ${formatCompactTokens(usage.totalProcessedTokens)} tokens`
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
              <p className="opacity-70">
                Total processed: {formatCompactTokens(usage.totalProcessedTokens)} tokens
              </p>
              <p className="opacity-50">Automatically compacts its context when needed.</p>
            </div>
          ) : (
            <p className="text-[11px] opacity-70">Context usage is unavailable yet.</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function formatCompactTokens(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 0,
  })
    .format(value)
    .toLowerCase()
}
