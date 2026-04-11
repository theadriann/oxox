import { memo, useMemo } from 'react'

import type { TranscriptMessageContentBlock } from '../../../../shared/ipc/contracts'
import { JsonRenderMessage, parseJsonRenderContentSegments } from './JsonRenderMessage'
import { MarkdownRenderer } from './MarkdownRenderer'
import { parseMessageSegments } from './parseMessageSegments'
import { SystemReminderBlock } from './SystemReminderBlock'
import type { MessageTimelineItem } from './timelineTypes'

export const MessageCard = memo(function MessageCard({ item }: { item: MessageTimelineItem }) {
  if (item.role === 'user') {
    return <UserMessageCard item={item} />
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

  return <AssistantMessageCard item={item} />
})

function UserMessageCard({ item }: { item: MessageTimelineItem }) {
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

  return (
    <div className="py-1">
      {textSegments.length > 0 ? (
        <div className="flex justify-end">
          <div className="max-w-[85%] min-w-0">
            <div className="overflow-hidden rounded-lg bg-fd-panel/60 px-3 py-1.5">
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fd-primary">
                {textSegments.map((s) => s.content).join('\n\n')}
              </p>
              {renderImageBlocks(item.id, imageBlocks, 'User')}
            </div>
          </div>
        </div>
      ) : imageBlocks.length > 0 ? (
        <div className="flex justify-end">
          <div className="max-w-[85%] min-w-0">
            <div className="overflow-hidden rounded-lg bg-fd-panel/60 px-3 py-1.5">
              {renderImageBlocks(item.id, imageBlocks, 'User')}
            </div>
          </div>
        </div>
      ) : null}
      {reminderSegments.map((segment, index) => (
        <SystemReminderBlock key={createReminderKey(item.id, index)} content={segment.content} />
      ))}
    </div>
  )
}

function AssistantMessageCard({ item }: { item: MessageTimelineItem }) {
  const contentBlocks = item.contentBlocks ?? [{ type: 'text' as const, text: item.content }]
  const contentSegments = useMemo(
    () => parseJsonRenderContentSegments(item.content),
    [item.content],
  )
  const imageBlocks = contentBlocks.filter(
    (block): block is Extract<TranscriptMessageContentBlock, { type: 'image' }> =>
      block.type === 'image',
  )

  return (
    <div className="py-1">
      {item.occurredAt ? (
        <time className="text-[10px] text-fd-tertiary">{item.occurredAt}</time>
      ) : null}
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
      <div className="text-[14px] leading-[1.7]">
        {contentSegments.map((segment, index) =>
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
        )}
        {imageBlocks.length > 0 ? (
          <div className="mt-2">{renderImageBlocks(item.id, imageBlocks, 'Assistant')}</div>
        ) : null}
      </div>
    </div>
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
