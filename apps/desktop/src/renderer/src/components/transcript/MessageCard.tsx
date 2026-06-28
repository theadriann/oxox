import { Check, Copy, GitBranch } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'

import type { TranscriptMessageContentBlock } from '../../../../shared/ipc/contracts'
import { Button } from '../ui/button'
import { JsonRenderMessage, parseJsonRenderContentSegments } from './JsonRenderMessage'
import { MarkdownRenderer } from './MarkdownRenderer'
import { parseMessageSegments } from './parseMessageSegments'
import { SystemReminderBlock } from './SystemReminderBlock'
import { ThinkingCard } from './ThinkingCard'
import type { MessageTimelineItem, ThinkingTimelineItem } from './timelineTypes'

export const MessageCard = memo(function MessageCard({
  item,
  onForkFromMessage,
}: {
  item: MessageTimelineItem
  onForkFromMessage?: (messageId: string) => void
}) {
  if (item.role === 'user') {
    return <UserMessageCard item={item} onForkFromMessage={onForkFromMessage} />
  }

  if (item.role === 'system') {
    return (
      <div className="border-l-2 border-fd-border-subtle py-0.5 pl-3">
        <div className="flex flex-col gap-1">
          <MarkdownRenderer markdown={item.content} />
        </div>
      </div>
    )
  }

  return <AssistantMessageCard item={item} onForkFromMessage={onForkFromMessage} />
})

function UserMessageCard({
  item,
  onForkFromMessage,
}: {
  item: MessageTimelineItem
  onForkFromMessage?: (messageId: string) => void
}) {
  const contentBlocks = item.contentBlocks ?? [{ type: 'text' as const, text: item.content }]
  const textContent = useMemo(
    () =>
      contentBlocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n'),
    [contentBlocks],
  )
  const segments = useMemo(() => parseMessageSegments(textContent), [textContent])
  const textSegments = segments.filter((s) => s.kind === 'text')
  const reminderSegments = segments.filter((s) => s.kind === 'system-reminder')
  const imageBlocks = contentBlocks.filter(
    (block): block is Extract<TranscriptMessageContentBlock, { type: 'image' }> =>
      block.type === 'image',
  )
  const visibleText = textSegments.map((s) => s.content).join('\n\n')
  const hasVisibleContent = visibleText.trim().length > 0 || imageBlocks.length > 0

  return (
    <div className="py-1">
      {hasVisibleContent ? (
        <div className="group/message">
          {textSegments.length > 0 ? (
            <div className="flex justify-end">
              <div className="max-w-[85%] min-w-0">
                <div className="ox-user-bubble overflow-hidden rounded-lg px-3 py-1.5">
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fd-primary">
                    {visibleText}
                  </p>
                  {renderImageBlocks(item.id, imageBlocks, 'User')}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <div className="max-w-[85%] min-w-0">
                <div className="ox-user-bubble overflow-hidden rounded-lg px-3 py-1.5">
                  {renderImageBlocks(item.id, imageBlocks, 'User')}
                </div>
              </div>
            </div>
          )}
          <div className="mt-1">
            <MessageActionRail
              align="right"
              copyText={visibleText}
              item={item}
              onForkFromMessage={onForkFromMessage}
            />
          </div>
        </div>
      ) : null}
      {reminderSegments.map((segment, index) => (
        <SystemReminderBlock key={createReminderKey(item.id, index)} content={segment.content} />
      ))}
    </div>
  )
}

function AssistantMessageCard({
  item,
  onForkFromMessage,
}: {
  item: MessageTimelineItem
  onForkFromMessage?: (messageId: string) => void
}) {
  const contentBlocks = item.contentBlocks ?? [{ type: 'text' as const, text: item.content }]
  const legacyThinkingResult = useMemo(
    () => parseLegacyThinkingMarkdown(item.content),
    [item.content],
  )
  const assistantContent =
    legacyThinkingResult.blocks.length > 0 ? legacyThinkingResult.remainingMarkdown : item.content
  const contentSegments = useMemo(
    () => (item.status === 'streaming' ? [] : parseJsonRenderContentSegments(assistantContent)),
    [assistantContent, item.status],
  )
  const imageBlocks = contentBlocks.filter(
    (block): block is Extract<TranscriptMessageContentBlock, { type: 'image' }> =>
      block.type === 'image',
  )
  const thinkingBlocks = contentBlocks.filter(
    (block): block is Extract<TranscriptMessageContentBlock, { type: 'thinking' }> =>
      block.type === 'thinking',
  )
  const allThinkingBlocks = [...thinkingBlocks, ...legacyThinkingResult.blocks]
  const thinkingDurationMs = allThinkingBlocks.find(
    (block) => typeof block.durationMs === 'number',
  )?.durationMs
  const renderableContentSegments = contentSegments.filter(
    (segment) => segment.kind === 'json-render' || segment.content.trim().length > 0,
  )

  return (
    <div className="group/message py-1">
      {item.status === 'streaming' ? (
        <span
          aria-label="Typing indicator"
          className="mb-0.5 inline-flex items-center gap-1 text-[10px] text-fd-tertiary"
          role="status"
        >
          <span className="size-1 animate-pulse rounded-full bg-fd-tertiary" />
          <span className="size-1 animate-pulse rounded-full bg-fd-tertiary [animation-delay:120ms]" />
          <span className="size-1 animate-pulse rounded-full bg-fd-tertiary [animation-delay:240ms]" />
        </span>
      ) : null}
      {allThinkingBlocks.map((block, index) => (
        <ThinkingCard
          key={createThinkingBlockKey(item.id, index)}
          item={toThinkingTimelineItem(item.id, block)}
        />
      ))}
      <div className="text-[14px] leading-[1.7]">
        {item.status === 'streaming' ? (
          <StreamingMessagePreview content={item.content} />
        ) : (
          renderableContentSegments.map((segment, index) =>
            segment.kind === 'json-render' ? (
              <JsonRenderMessage
                key={createAssistantSegmentKey(item.id, index, segment)}
                spec={segment.spec}
              />
            ) : (
              <MarkdownRenderer
                key={createAssistantSegmentKey(item.id, index, segment)}
                markdown={segment.content}
              />
            ),
          )
        )}
        {imageBlocks.length > 0 ? (
          <div className="mt-2">{renderImageBlocks(item.id, imageBlocks, 'Assistant')}</div>
        ) : null}
      </div>
      <MessageActionRail
        copyText={assistantContent}
        durationMs={thinkingDurationMs}
        item={item}
        onForkFromMessage={onForkFromMessage}
      />
    </div>
  )
}

function MessageActionRail({
  item,
  copyText,
  durationMs,
  align = 'left',
  onForkFromMessage,
}: {
  item: MessageTimelineItem
  copyText: string
  durationMs?: number
  align?: 'left' | 'right'
  onForkFromMessage?: (messageId: string) => void
}) {
  const [hasCopied, setHasCopied] = useState(false)
  const rewindTargetMessageId = item.rewindBoundaryMessageId ?? item.messageId
  const canFork = Boolean(onForkFromMessage && rewindTargetMessageId.trim().length > 0)

  const handleCopy = useCallback(async () => {
    if (!navigator.clipboard?.writeText) return

    await navigator.clipboard.writeText(copyText)
    setHasCopied(true)
    window.setTimeout(() => setHasCopied(false), 1400)
  }, [copyText])

  return (
    <div
      className={`flex h-6 items-center ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      data-testid="message-action-rail"
    >
      <div className="pointer-events-none inline-flex items-center gap-1 rounded-md border border-transparent bg-fd-panel/70 px-0.5 opacity-0 transition-opacity duration-150 group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100">
        <Button
          aria-label="Copy message"
          className="size-5"
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => void handleCopy()}
        >
          {hasCopied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
        </Button>
        <Button
          aria-label="Fork from here"
          className="size-5"
          disabled={!canFork}
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => {
            if (!canFork) return
            onForkFromMessage?.(rewindTargetMessageId)
          }}
        >
          <GitBranch className="size-2.5" />
        </Button>
        {item.occurredAt ? (
          <time
            className="px-1 text-[10px] tabular-nums text-fd-tertiary"
            dateTime={item.occurredAt}
            title={item.occurredAt}
          >
            {formatMessageTimestamp(item.occurredAt, durationMs)}
          </time>
        ) : null}
      </div>
    </div>
  )
}

function parseLegacyThinkingMarkdown(markdown: string): {
  blocks: Array<Extract<TranscriptMessageContentBlock, { type: 'thinking' }>>
  remainingMarkdown: string
} {
  const blocks: Array<Extract<TranscriptMessageContentBlock, { type: 'thinking' }>> = []
  let remainingMarkdown = markdown

  remainingMarkdown = remainingMarkdown.replace(
    /```json\s*([\s\S]*?)```/gi,
    (fullMatch, rawJson: string) => {
      const block = parseThinkingJsonBlock(rawJson)
      if (!block) return fullMatch

      blocks.push(block)
      return ''
    },
  )

  if (blocks.length === 0) {
    const block = parseThinkingJsonBlock(markdown)
    if (block) {
      blocks.push(block)
      remainingMarkdown = ''
    }
  }

  return { blocks, remainingMarkdown: remainingMarkdown.trim() }
}

function parseThinkingJsonBlock(
  rawJson: string,
): Extract<TranscriptMessageContentBlock, { type: 'thinking' }> | null {
  try {
    const parsed: unknown = JSON.parse(rawJson.trim())
    if (!isRecord(parsed) || parsed.type !== 'thinking' || typeof parsed.thinking !== 'string') {
      return null
    }

    return {
      type: 'thinking',
      thinking: parsed.thinking,
      signature: typeof parsed.signature === 'string' ? parsed.signature : undefined,
      signatureProvider:
        typeof parsed.signatureProvider === 'string' ? parsed.signatureProvider : undefined,
      durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : undefined,
    }
  } catch {
    return null
  }
}

function formatMessageTimestamp(occurredAt: string, durationMs?: number): string {
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) {
    return typeof durationMs === 'number'
      ? `${occurredAt} · ${formatDuration(durationMs)} thinking`
      : occurredAt
  }

  const now = new Date()
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const label = formatMessageDateLabel(date, now)

  return typeof durationMs === 'number'
    ? `${label} at ${time} · ${formatDuration(durationMs)} thinking`
    : `${label} at ${time}`
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000))
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
}

function formatMessageDateLabel(date: Date, now: Date): string {
  if (isSameLocalDate(date, now)) return 'Today'

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameLocalDate(date, yesterday)) return 'Yesterday'

  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toThinkingTimelineItem(
  messageId: string,
  block: Extract<TranscriptMessageContentBlock, { type: 'thinking' }>,
): ThinkingTimelineItem {
  return {
    kind: 'thinking',
    id: `${messageId}:thinking`,
    messageId,
    content: block.thinking,
    status: 'completed',
  }
}

function createThinkingBlockKey(itemId: string, index: number) {
  return `${itemId}:thinking:${index}`
}

function StreamingMessagePreview({ content }: { content: string }) {
  return (
    <p
      data-testid="streaming-message-preview"
      className="my-2 whitespace-pre-wrap break-words text-[14px] leading-[1.7] text-fd-primary/95"
    >
      {content}
    </p>
  )
}

function renderImageBlocks(
  itemId: string,
  imageBlocks: Array<Extract<TranscriptMessageContentBlock, { type: 'image' }>>,
  roleLabel: 'User' | 'Assistant',
) {
  if (imageBlocks.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      {imageBlocks.map((block, index) => (
        <img
          key={createImageBlockKey(itemId, index)}
          alt={`${roleLabel} attachment ${index + 1}`}
          className="max-h-[420px] max-w-full rounded-md border border-fd-border-subtle object-contain"
          src={`data:${block.mediaType};base64,${block.data}`}
        />
      ))}
    </div>
  )
}

function createAssistantSegmentKey(
  itemId: string,
  index: number,
  segment:
    | { kind: 'markdown'; content: string }
    | { kind: 'json-render'; spec: { root: string; elements: Record<string, unknown> } },
) {
  return `${itemId}:${segment.kind}:${index}`
}

function createReminderKey(itemId: string, index: number) {
  return `${itemId}:reminder:${index}`
}

function createImageBlockKey(itemId: string, index: number) {
  return `${itemId}:image:${index}`
}
