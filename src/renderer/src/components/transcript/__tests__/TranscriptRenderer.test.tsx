// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react'

import type { LiveSessionSnapshot, SessionTranscript } from '../../../../../shared/ipc/contracts'
import { buildHistoricalTimeline } from '../buildHistoricalTimeline'
import { buildLiveTimeline } from '../buildLiveTimeline'
import { TranscriptRenderer } from '../TranscriptRenderer'

function createSnapshot(overrides: Partial<LiveSessionSnapshot> = {}): LiveSessionSnapshot {
  return {
    sessionId: 'session-live-1',
    title: 'Streaming session',
    status: 'active',
    transport: 'stream-jsonrpc',
    processId: 4242,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/live-session',
    parentSessionId: null,
    availableModels: [],
    settings: {},
    messages: [],
    events: [],
    ...overrides,
  }
}

const IMAGE_DATA = 'ZmFrZS1pbWFnZS1ieXRlcw=='

function createTranscript(entryCount = 2): SessionTranscript {
  const entries = [
    {
      kind: 'message' as const,
      id: 'message-user',
      occurredAt: '2026-03-25T01:00:00.000Z',
      role: 'user' as const,
      markdown:
        '# Heading\n\n1. First item\n2. Second item\n\nUse `inline` code and [Docs](https://example.com).\n\n```ts\nconst value = 1\n```',
    },
    {
      kind: 'tool_call' as const,
      id: 'tool-1',
      toolName: 'Read',
      toolUseId: 'tool-1',
      occurredAt: '2026-03-25T01:01:00.000Z',
      status: 'completed' as const,
      inputMarkdown: '```json\n{\n  "file_path": "/tmp/file.ts"\n}\n```',
      resultMarkdown: 'Loaded the file successfully.',
      resultIsError: false,
    },
    {
      kind: 'tool_call' as const,
      id: 'tool-2',
      toolName: 'TodoWrite',
      toolUseId: 'tool-2',
      occurredAt: '2026-03-25T01:02:00.000Z',
      status: 'running' as const,
      inputMarkdown: '```json\n{\n  "todos": "1. [in_progress] Render transcript"\n}\n```',
      resultMarkdown: null,
      resultIsError: false,
    },
    {
      kind: 'message' as const,
      id: 'message-assistant',
      occurredAt: '2026-03-25T01:03:00.000Z',
      role: 'assistant' as const,
      markdown: 'Transcript rendering complete.',
    },
  ]

  return {
    sessionId: 'session-1',
    sourcePath: '/tmp/session-1.jsonl',
    loadedAt: '2026-03-25T01:03:30.000Z',
    entries:
      entryCount > entries.length
        ? Array.from({ length: entryCount }, (_, index) => ({
            kind: 'message' as const,
            id: `message-${index}`,
            occurredAt: '2026-03-25T01:03:00.000Z',
            role: index % 2 === 0 ? ('assistant' as const) : ('user' as const),
            markdown: `Virtualized row ${index}`,
          }))
        : entries,
  }
}

describe('TranscriptRenderer (live)', () => {
  let scrollToMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollToMock = vi.fn(function scrollTo(
      this: HTMLElement,
      options?: ScrollToOptions | number,
      top?: number,
    ) {
      if (typeof options === 'number') {
        this.scrollTop = top ?? 0
        return
      }
      if (typeof options?.top === 'number') {
        this.scrollTop = options.top
      }
    })

    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps thinking as a collapsible row and renders resumed assistant text after tool rows', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'message.delta',
                messageId: 'thinking-1',
                delta: 'Let me think about that first.',
                channel: 'thinking',
              },
              {
                type: 'message.delta',
                messageId: 'assistant-1',
                delta: 'First reply before tools.',
                channel: 'assistant',
              },
              {
                type: 'tool.progress',
                toolUseId: 'tool-1',
                toolName: 'Read',
                status: 'running',
                detail: 'Scanning session artifact…',
              },
              {
                type: 'message.delta',
                messageId: 'assistant-1',
                delta: 'Continuation after tools.',
                channel: 'assistant',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(screen.getByRole('button', { name: /toggle thinking/i })).toBeTruthy()
    expect(screen.queryByText('Let me think about that first.')).toBeNull()
    expect(screen.getByText('First reply before tools.')).toBeTruthy()
    expect(screen.getByText('Continuation after tools.')).toBeTruthy()

    const transcriptText =
      screen.getByRole('region', { name: /live transcript events/i }).textContent ?? ''
    expect(transcriptText.indexOf('First reply before tools.')).toBeLessThan(
      transcriptText.indexOf('Read'),
    )
    expect(transcriptText.indexOf('Read')).toBeLessThan(
      transcriptText.indexOf('Continuation after tools.'),
    )

    fireEvent.click(screen.getByRole('button', { name: /toggle thinking/i }))

    expect(screen.getByText('Let me think about that first.')).toBeTruthy()
  })

  it('renders assistant image attachments from live completed messages without malformed fallbacks', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'message.completed',
                messageId: 'assistant-image-1',
                content: '',
                role: 'assistant',
                contentBlocks: [
                  {
                    type: 'image',
                    mediaType: 'image/png',
                    data: IMAGE_DATA,
                  },
                ],
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(screen.getByRole('img', { name: /assistant attachment 1/i })).toBeTruthy()
    expect(screen.queryByText('Malformed message event.')).toBeNull()
  })

  it('renders pure assistant json-render payloads with the dedicated renderer', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'message.completed',
                messageId: 'assistant-json-render-1',
                role: 'assistant',
                content:
                  '<json-render>{"root":"box","elements":{"box":{"type":"Box","props":{"flexDirection":"column","padding":1},"children":["heading","table"]},"heading":{"type":"Heading","props":{"text":"Your Answers","level":"h2"},"children":[]},"table":{"type":"Table","props":{"headerColor":"cyan","columns":[{"header":"#","key":"num","width":4},{"header":"Question","key":"question","width":35},{"header":"Answer","key":"answer","width":30}],"rows":[{"num":"1","question":"Preferred programming language","answer":"TypeScript"},{"num":"2","question":"Type of projects","answer":"Web apps"},{"num":"3","question":"Preferred feedback style","answer":"Concise inline comments"}]},"children":[]}}}</json-render>',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(screen.getByTestId('json-render-root')).toBeTruthy()
    expect(screen.getByText('Your Answers')).toBeTruthy()
    expect(screen.getByText('TypeScript')).toBeTruthy()
  })

  it('renders embedded assistant json-render payloads alongside surrounding markdown', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'message.completed',
                messageId: 'assistant-json-render-2',
                role: 'assistant',
                content:
                  '```json\n{"type":"thinking","thinking":"Now I need to show a table with the answers using the json-render format."}\n```\n\n<json-render>{"root":"box","elements":{"box":{"type":"Box","props":{"flexDirection":"column","padding":1},"children":["heading","table"]},"heading":{"type":"Heading","props":{"text":"Rendered Answers","level":"h2"},"children":[]},"table":{"type":"Table","props":{"headerColor":"cyan","columns":[{"header":"Question","key":"question","width":20},{"header":"Answer","key":"answer","width":20}],"rows":[{"question":"Preferred programming language","answer":"TypeScript"}]},"children":[]}}}</json-render>',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(
      screen.getAllByText(
        (_, node) =>
          node?.textContent?.includes(
            'Now I need to show a table with the answers using the json-render format.',
          ) ?? false,
      )[0],
    ).toBeTruthy()
    expect(screen.getByTestId('json-render-root')).toBeTruthy()
    expect(screen.getByText('Rendered Answers')).toBeTruthy()
    expect(screen.queryByText(/<json-render>/)).toBeNull()
  })

  it('does not duplicate live messages that already exist in the snapshot message list', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            messages: [
              {
                id: 'message-user-1',
                role: 'user',
                content: 'Can you find the latest changes on the apartment project?',
              },
              {
                id: 'message-assistant-1',
                role: 'assistant',
                content: 'Found the apartment project. Let me check what files exist.',
              },
            ],
            events: [
              {
                type: 'message.completed',
                messageId: 'message-user-1',
                role: 'user',
                content: 'Can you find the latest changes on the apartment project?',
              },
              {
                type: 'message.completed',
                messageId: 'message-assistant-1',
                role: 'assistant',
                content: 'Found the apartment project. Let me check what files exist.',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(
      screen.getAllByText('Can you find the latest changes on the apartment project?'),
    ).toHaveLength(1)
    expect(
      screen.getAllByText('Found the apartment project. Let me check what files exist.'),
    ).toHaveLength(1)
  })

  it('does not duplicate a streamed assistant segment when the final completed message repeats the same pre-tool text', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'message.delta',
                messageId: 'assistant-1',
                delta:
                  'Let me check the full apartment project folder and recent git changes for it.',
                channel: 'assistant',
              },
              {
                type: 'tool.progress',
                toolUseId: 'tool-1',
                toolName: 'LS',
                status: 'running',
                detail: '```json\n{\n  "directory_path": "/tmp/apartment"\n}\n```',
              },
              {
                type: 'message.completed',
                messageId: 'assistant-1',
                role: 'assistant',
                content:
                  'Let me check the full apartment project folder and recent git changes for it.',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(
      screen.getAllByText(
        'Let me check the full apartment project folder and recent git changes for it.',
      ),
    ).toHaveLength(1)
  })

  it('does not duplicate segmented assistant text when the completed event contains the full final message', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'message.delta',
                messageId: 'assistant-1',
                delta: 'Before tool. ',
                channel: 'assistant',
              },
              {
                type: 'tool.progress',
                toolUseId: 'tool-1',
                toolName: 'Read',
                status: 'running',
                detail: 'Reading...',
              },
              {
                type: 'message.delta',
                messageId: 'assistant-1',
                delta: 'After tool.',
                channel: 'assistant',
              },
              {
                type: 'message.completed',
                messageId: 'assistant-1',
                role: 'assistant',
                content: 'Before tool. After tool.',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(screen.getByText('Before tool.')).toBeTruthy()
    expect(screen.getByText('After tool.')).toBeTruthy()
    expect(screen.queryByLabelText(/typing indicator/i)).toBeNull()

    const transcriptText =
      screen.getByRole('region', { name: /live transcript events/i }).textContent ?? ''
    expect(transcriptText.indexOf('Before tool.')).toBeLessThan(transcriptText.indexOf('Read'))
    expect(transcriptText.indexOf('Read')).toBeLessThan(transcriptText.indexOf('After tool.'))
  })

  it('keeps tool names stable and shows both input and output details for live tool calls', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'tool.progress',
                toolUseId: 'tool-1',
                toolName: 'Read',
                status: 'running',
                detail: '```json\n{\n  "file_path": "/tmp/demo.ts"\n}\n```',
              },
              {
                type: 'tool.progress',
                toolUseId: 'tool-1',
                status: 'running',
                detail: 'Scanning session artifact…',
              },
              {
                type: 'tool.result',
                toolUseId: 'tool-1',
                toolName: 'Unknown tool',
                content: { loaded: true },
                isError: false,
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(screen.getByRole('button', { name: /toggle details for read/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /toggle details for unknown tool/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /toggle details for read/i }))

    expect(screen.getByText('Input')).toBeTruthy()
    expect(screen.getByText('Result')).toBeTruthy()
    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes('/tmp/demo.ts') ?? false)[0],
    ).toBeTruthy()
    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes('"loaded": true') ?? false)[0],
    ).toBeTruthy()
  })

  it('hides session metadata events from the live transcript', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'session.statusChanged',
                status: 'streaming_assistant_message',
              },
              {
                type: 'session.statusChanged',
                status: 'idle',
              },
              {
                type: 'session.settingsChanged',
                settings: {
                  modelId: 'custom:claude',
                  interactionMode: 'spec',
                },
              },
              {
                type: 'session.tokenUsageChanged',
                tokenUsage: {
                  inputTokens: 10,
                  outputTokens: 20,
                  cacheCreationTokens: 0,
                  cacheReadTokens: 0,
                  thinkingTokens: 3,
                },
              },
              {
                type: 'session.titleChanged',
                title: 'Updated title',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(screen.queryByText('streaming_assistant_message')).toBeNull()
    expect(screen.queryByText('idle')).toBeNull()
    expect(screen.queryByText('Updated title')).toBeNull()
    expect(screen.queryByText(/Input 10/)).toBeNull()
    expect(screen.queryByText(/Model custom:claude/)).toBeNull()
    expect(screen.getByText('Waiting for output...')).toBeTruthy()
  })

  it('renders key live event types and expands tool details while suppressing metadata noise', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            messages: [
              {
                id: 'message-user-1',
                role: 'user',
                content: 'Kick off the stream',
              },
            ],
            events: [
              {
                type: 'message.delta',
                messageId: 'assistant-1',
                delta: 'Streaming repl',
                channel: 'assistant',
              },
              {
                type: 'message.completed',
                messageId: 'assistant-1',
                content: 'Streaming reply',
                role: 'assistant',
              },
              {
                type: 'tool.progress',
                toolUseId: 'tool-1',
                toolName: 'Read',
                status: 'running',
                detail: 'Scanning session artifact\u2026',
              },
              {
                type: 'tool.result',
                toolUseId: 'tool-1',
                toolName: 'Read',
                content: { loaded: true },
                isError: false,
              },
              {
                type: 'permission.requested',
                requestId: 'permission-1',
                options: ['approve', 'deny'],
                toolUseIds: ['tool-1'],
                reason: 'Needs permission to open the workspace.',
              },
              {
                type: 'permission.resolved',
                requestId: 'permission-1',
                toolUseIds: ['tool-1'],
                selectedOption: 'approve',
              },
              {
                type: 'askUser.requested',
                requestId: 'ask-1',
                prompt: 'Choose the next action',
                options: ['continue', 'stop'],
                defaultOption: 'continue',
              },
              {
                type: 'askUser.resolved',
                requestId: 'ask-1',
                selectedOption: 'continue',
              },
              {
                type: 'session.statusChanged',
                status: 'active',
                previousStatus: 'waiting',
              },
              {
                type: 'session.titleChanged',
                title: 'Renamed live session',
                previousTitle: 'Streaming session',
              },
              {
                type: 'session.settingsChanged',
                settings: {
                  modelId: 'gpt-5.4-mini',
                  autonomyLevel: 'medium',
                  reasoningEffort: 'high',
                },
              },
              {
                type: 'session.tokenUsageChanged',
                tokenUsage: {
                  inputTokens: 21,
                  outputTokens: 13,
                  cacheCreationTokens: 0,
                  cacheReadTokens: 3,
                  thinkingTokens: 5,
                },
              },
              {
                type: 'stream.warning',
                warning: 'The stream briefly stalled.',
                kind: 'latency',
              },
              {
                type: 'stream.error',
                error: 'Recoverable stream hiccup',
                recoverable: true,
              },
              {
                type: 'stream.completed',
                reason: 'completed',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(screen.getByText('Kick off the stream')).toBeTruthy()
    expect(screen.getByText('Streaming reply')).toBeTruthy()
    expect(screen.getByText('Permission request')).toBeTruthy()
    expect(screen.getByText('Ask user')).toBeTruthy()
    expect(screen.getByText('Stream warning')).toBeTruthy()
    expect(screen.getByText(/Connection lost/i)).toBeTruthy()
    expect(screen.getByText('Stream completed')).toBeTruthy()
    expect(screen.queryByText('Status changed')).toBeNull()
    expect(screen.queryByText('Title updated')).toBeNull()
    expect(screen.queryByText('Settings updated')).toBeNull()
    expect(screen.queryByText('Token usage updated')).toBeNull()

    expect(screen.getByText('Read')).toBeTruthy()
    expect(screen.getByRole('button', { name: /toggle details for read/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /toggle details for read/i }))

    expect(screen.getByText('Scanning session artifact\u2026')).toBeTruthy()
    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes('"loaded": true') ?? false)[0],
    ).toBeTruthy()
    expect(screen.getByText('Needs permission to open the workspace.')).toBeTruthy()
    expect(screen.getByText('Choose the next action')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getByText('Submitted answer')).toBeTruthy()
    expect(screen.getByText('Recoverable stream hiccup')).toBeTruthy()
  })

  it('groups consecutive tool calls behind a collapsed summary and reveals nested tool details progressively', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'tool.progress',
                toolUseId: 'tool-1',
                toolName: 'Read',
                status: 'running',
                detail: 'Scanning session artifact\u2026',
              },
              {
                type: 'tool.result',
                toolUseId: 'tool-1',
                toolName: 'Read',
                content: { loaded: true },
                isError: false,
              },
              {
                type: 'tool.progress',
                toolUseId: 'tool-2',
                toolName: 'TodoWrite',
                status: 'running',
                detail: 'Recording implementation progress\u2026',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    const groupToggle = screen.getByRole('button', { name: /2 tool calls/i })
    expect(screen.getByText(/Read, TodoWrite/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /toggle details for read/i })).toBeNull()
    expect(screen.queryByText('Scanning session artifact\u2026')).toBeNull()

    fireEvent.click(groupToggle)
    fireEvent.click(screen.getByRole('button', { name: /toggle details for read/i }))

    expect(screen.getByText('Scanning session artifact\u2026')).toBeTruthy()
    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes('"loaded": true') ?? false)[0],
    ).toBeTruthy()
  })

  it('renders recoverable stream errors as a connection-lost state with reconnect guidance', () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            status: 'reconnecting',
            events: [
              {
                type: 'message.delta',
                messageId: 'assistant-1',
                delta: 'Partial answer',
                channel: 'assistant',
              },
              {
                type: 'stream.error',
                error: 'droid exec exited unexpectedly with code 17',
                recoverable: true,
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    expect(screen.getByText('Partial answer')).toBeTruthy()
    expect(screen.getByText(/Connection lost/i)).toBeTruthy()
    expect(screen.getByText(/Attempting to reconnect/i)).toBeTruthy()
  })

  it('renders concurrent permission cards and routes each approval decision with the matching request id', () => {
    const onResolvePermissionRequest = vi.fn()

    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'permission.requested',
                requestId: 'permission-1',
                reason: 'Run npm publish',
                riskLevel: 'high',
                options: ['proceed_once', 'cancel'],
              },
              {
                type: 'permission.requested',
                requestId: 'permission-2',
                reason: 'Read README.md',
                riskLevel: 'low',
                options: ['proceed_once', 'cancel'],
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
        onResolvePermissionRequest={onResolvePermissionRequest}
      />,
    )

    const first = screen.getByTestId('permission-card-permission-1')
    const second = screen.getByTestId('permission-card-permission-2')

    expect(within(first).getByText('Run npm publish')).toBeTruthy()
    expect(within(first).getByText(/high risk/i)).toBeTruthy()
    expect(within(second).getByText('Read README.md')).toBeTruthy()
    expect(within(second).getByText(/low risk/i)).toBeTruthy()

    fireEvent.click(within(first).getByRole('button', { name: /approve/i }))

    expect(onResolvePermissionRequest).toHaveBeenCalledTimes(1)
    expect(onResolvePermissionRequest).toHaveBeenCalledWith({
      requestId: 'permission-1',
      selectedOption: 'proceed_once',
    })
    expect(
      within(second)
        .getByRole('button', { name: /approve/i })
        .getAttribute('disabled'),
    ).toBeNull()
  })

  it('submits ask-user answers and shows resolved states as read-only', () => {
    const onSubmitAskUserResponse = vi.fn()
    const snapshot1 = createSnapshot({
      events: [
        {
          type: 'permission.requested',
          requestId: 'permission-3',
          reason: 'Apply patch to session store',
          riskLevel: 'medium',
          options: ['proceed_once', 'cancel'],
        },
        {
          type: 'askUser.requested',
          requestId: 'ask-1',
          prompt: 'Which word should I answer with?',
          options: ['ALPHA', 'BETA'],
          questions: [
            {
              index: 0,
              topic: 'Choice',
              question: 'Which word should I answer with?',
              options: ['ALPHA', 'BETA'],
            },
            {
              index: 1,
              topic: 'Follow-up',
              question: 'Should I continue?',
              options: ['YES', 'NO'],
            },
          ],
        },
      ],
    })

    const { rerender } = render(
      <TranscriptRenderer
        items={buildLiveTimeline(snapshot1)}
        isLive
        isLoading={false}
        onSubmitAskUserResponse={onSubmitAskUserResponse}
      />,
    )

    fireEvent.change(screen.getByLabelText(/answer for ask-1 question 1/i), {
      target: { value: 'ALPHA' },
    })
    fireEvent.change(screen.getByLabelText(/answer for ask-1 question 2/i), {
      target: { value: 'YES' },
    })
    fireEvent.click(screen.getByRole('button', { name: /submit response/i }))

    expect(onSubmitAskUserResponse).toHaveBeenCalledWith({
      requestId: 'ask-1',
      answers: [
        {
          index: 0,
          question: 'Which word should I answer with?',
          answer: 'ALPHA',
        },
        {
          index: 1,
          question: 'Should I continue?',
          answer: 'YES',
        },
      ],
    })

    rerender(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'permission.requested',
                requestId: 'permission-3',
                reason: 'Apply patch to session store',
                riskLevel: 'medium',
                options: ['proceed_once', 'cancel'],
              },
              {
                type: 'permission.resolved',
                requestId: 'permission-3',
                toolUseIds: [],
                selectedOption: 'proceed_once',
              },
              {
                type: 'askUser.requested',
                requestId: 'ask-1',
                prompt: 'Which word should I answer with?',
                options: ['ALPHA', 'BETA'],
                questions: [
                  {
                    index: 0,
                    topic: 'Choice',
                    question: 'Which word should I answer with?',
                    options: ['ALPHA', 'BETA'],
                  },
                  {
                    index: 1,
                    topic: 'Follow-up',
                    question: 'Should I continue?',
                    options: ['YES', 'NO'],
                  },
                ],
              },
              {
                type: 'askUser.resolved',
                requestId: 'ask-1',
                selectedOption: 'ALPHA',
                answers: [
                  {
                    index: 0,
                    question: 'Which word should I answer with?',
                    answer: 'ALPHA',
                  },
                  {
                    index: 1,
                    question: 'Should I continue?',
                    answer: 'YES',
                  },
                ],
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
        onSubmitAskUserResponse={onSubmitAskUserResponse}
      />,
    )

    const resolvedPerm = screen.getByTestId('permission-card-permission-3')
    expect(within(resolvedPerm).getByText(/approved/i)).toBeTruthy()
    expect(
      within(resolvedPerm)
        .getByRole('button', { name: /approve/i })
        .getAttribute('disabled'),
    ).not.toBeNull()

    const resolvedAsk = screen.getByTestId('ask-user-card-ask-1')
    expect(within(resolvedAsk).getByText(/submitted answer/i)).toBeTruthy()
    expect(within(resolvedAsk).getByText('ALPHA')).toBeTruthy()
    expect(within(resolvedAsk).getByText('YES')).toBeTruthy()
    expect(
      within(resolvedAsk).queryByRole('button', {
        name: /submit response/i,
      }),
    ).toBeNull()
  })

  it('auto-scrolls while pinned to the bottom, then suspends and resumes on demand', async () => {
    let scrollHeight = 900

    const snapshot1 = createSnapshot({
      events: [
        {
          type: 'message.delta',
          messageId: 'assistant-1',
          delta: 'First chunk',
          channel: 'assistant',
        },
      ],
    })

    const view = render(
      <TranscriptRenderer items={buildLiveTimeline(snapshot1)} isLive isLoading={false} />,
    )

    const scrollRegion = screen.getByRole('region', {
      name: 'Live transcript events',
    })

    Object.defineProperty(scrollRegion, 'clientHeight', {
      configurable: true,
      value: 300,
    })
    Object.defineProperty(scrollRegion, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeight
      },
    })

    await act(async () => {
      scrollRegion.scrollTop = scrollHeight - 300
      fireEvent.scroll(scrollRegion)
    })

    const initialCalls = scrollToMock.mock.calls.length
    scrollHeight = 1280

    view.rerender(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'message.delta',
                messageId: 'assistant-1',
                delta: 'First chunk and more output',
                channel: 'assistant',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(scrollToMock.mock.calls.length).toBeGreaterThan(initialCalls)

    await act(async () => {
      scrollRegion.scrollTop = 24
      fireEvent.scroll(scrollRegion)
    })

    // Wait for debounced jump button visibility update
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200))
    })

    expect(screen.getByRole('button', { name: 'Scroll to latest' })).toBeTruthy()

    const callsWhilePaused = scrollToMock.mock.calls.length
    scrollHeight = 1560

    view.rerender(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: [
              {
                type: 'message.delta',
                messageId: 'assistant-1',
                delta: 'First chunk and more output plus another chunk',
                channel: 'assistant',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(scrollToMock.mock.calls.length).toBe(callsWhilePaused)

    fireEvent.click(screen.getByRole('button', { name: 'Scroll to latest' }))

    expect(scrollToMock.mock.calls.length).toBeGreaterThan(callsWhilePaused)
    expect(screen.queryByRole('button', { name: 'Scroll to latest' })).toBeNull()
  })

  it('scrolls to the latest event when a notification deep link requests it', async () => {
    const items = buildLiveTimeline(
      createSnapshot({
        events: [
          {
            type: 'message.completed',
            messageId: 'assistant-1',
            content: 'Background completion received.',
            role: 'assistant',
          },
        ],
      }),
    )

    const { rerender } = render(
      <TranscriptRenderer items={items} isLive isLoading={false} scrollToBottomSignal={0} />,
    )

    scrollToMock.mockClear()

    rerender(<TranscriptRenderer items={items} isLive isLoading={false} scrollToBottomSignal={1} />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(scrollToMock).toHaveBeenCalled()
  })

  it('jumps to the latest live message when a different session opens', async () => {
    const { rerender } = render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            sessionId: 'session-live-1',
            events: [
              {
                type: 'message.completed',
                messageId: 'assistant-1',
                content: 'First session output.',
                role: 'assistant',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
        scrollContextKey="session-live-1"
      />,
    )

    scrollToMock.mockClear()

    rerender(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            sessionId: 'session-live-2',
            events: [
              {
                type: 'message.completed',
                messageId: 'assistant-2',
                content: 'Second session output.',
                role: 'assistant',
              },
            ],
          }),
        )}
        isLive
        isLoading={false}
        scrollContextKey="session-live-2"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(scrollToMock).toHaveBeenCalled()
  })

  it('virtualizes large live transcripts instead of mounting every row', async () => {
    render(
      <TranscriptRenderer
        items={buildLiveTimeline(
          createSnapshot({
            events: Array.from({ length: 200 }, (_, index) => ({
              type: 'message.completed' as const,
              messageId: `assistant-${index + 1}`,
              content: `Virtualized live row ${index + 1}`,
              role: 'assistant',
            })),
          }),
        )}
        isLive
        isLoading={false}
        scrollContextKey="session-live-virtualized"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    const renderedRows = screen.getAllByTestId('live-transcript-row')
    expect(renderedRows.length).toBeLessThan(60)
    expect(scrollToMock).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }))
    expect(
      renderedRows.at(-1)
        ? within(renderedRows.at(-1) as HTMLElement).getByText(/Virtualized live row/i)
        : null,
    ).toBeTruthy()
  })
})

describe('TranscriptRenderer (historical)', () => {
  let scrollToMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollToMock = vi.fn()

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        return {
          bottom: 56,
          height: 56,
          left: 0,
          right: 400,
          top: 0,
          width: 400,
          x: 0,
          y: 0,
          toJSON() {
            return {}
          },
        }
      },
    })

    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value(options?: ScrollToOptions) {
        scrollToMock(options)
        if (typeof options?.top === 'number') {
          this.scrollTop = options.top
        }
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders markdown, sync state, and grouped progressive-disclosure tool calls', async () => {
    const transcript = createTranscript()

    render(
      <TranscriptRenderer
        items={buildHistoricalTimeline(transcript.entries)}
        isLive={false}
        isLoading={true}
        loadingError="Refresh failed"
      />,
    )

    expect(screen.getByText('Syncing latest transcript...')).toBeTruthy()
    expect(screen.getByText('Refresh failed')).toBeTruthy()
    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes('# Heading') ?? false)[0],
    ).toBeTruthy()

    const toolGroupToggle = screen.getByRole('button', {
      name: /2 tool calls/i,
    })
    expect(screen.queryByText('Loaded the file successfully.')).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: /toggle details for read/i,
      }),
    ).toBeNull()
    expect(screen.getByText(/Read, TodoWrite/i)).toBeTruthy()

    fireEvent.click(toolGroupToggle)
    const toolToggles = screen.getAllByRole('button', {
      name: /toggle details for/i,
    })

    fireEvent.click(toolToggles[0])
    expect(screen.getByText('Loaded the file successfully.')).toBeTruthy()
    // The TodoWrite context label ("1. [in_progress] Render transcript") is now
    // visible in the collapsed accordion title via the fallback label extractor.
    expect(screen.getByText('1. [in_progress] Render transcript')).toBeTruthy()

    fireEvent.click(toolToggles[1])
    expect(
      screen.getAllByText(
        (_, node) => node?.textContent?.includes('1. [in_progress] Render transcript') ?? false,
      )[0],
    ).toBeTruthy()
  })

  it('renders historical json-render messages with the dedicated renderer and falls back for malformed payloads', () => {
    render(
      <TranscriptRenderer
        items={buildHistoricalTimeline([
          {
            id: 'historical-json-render',
            kind: 'message',
            role: 'assistant',
            occurredAt: '2026-04-04T00:00:00.000Z',
            markdown:
              '<json-render>{"root":"box","elements":{"box":{"type":"Box","props":{"flexDirection":"column","padding":1},"children":["heading"]},"heading":{"type":"Heading","props":{"text":"Historical Answers","level":"h2"},"children":[]}}}</json-render>',
          },
          {
            id: 'historical-json-render-malformed',
            kind: 'message',
            role: 'assistant',
            occurredAt: '2026-04-04T00:01:00.000Z',
            markdown: '<json-render>{not valid json}</json-render>',
          },
        ] as SessionTranscript['entries'])}
        isLive={false}
        isLoading={false}
      />,
    )

    expect(screen.getByText('Historical Answers')).toBeTruthy()
    expect(screen.getByText('<json-render>{not valid json}</json-render>')).toBeTruthy()
  })

  it('renders loading and retry states before transcript data is available', async () => {
    const onRetry = vi.fn()

    const { rerender } = render(
      <TranscriptRenderer items={[]} isLive={false} isLoading={true} onRetry={onRetry} />,
    )

    expect(document.querySelectorAll('.oxox-skeleton').length).toBeGreaterThan(0)

    rerender(
      <TranscriptRenderer
        items={[]}
        isLive={false}
        isLoading={false}
        loadingError="Transcript unavailable"
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText('Unable to load transcript')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry transcript' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('opens at the latest transcript row and removes the dead top/bottom arrow controls', async () => {
    render(
      <TranscriptRenderer
        items={buildHistoricalTimeline(createTranscript(200).entries)}
        isLive={false}
        isLoading={false}
        scrollContextKey="session-history-1"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    const renderedRows = screen.getAllByTestId('transcript-row')
    expect(renderedRows.length).toBeLessThan(60)
    expect(scrollToMock).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }))
    expect(screen.queryByRole('button', { name: 'Scroll to top' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Scroll to bottom' })).toBeNull()

    const lastVisibleRow = renderedRows.at(-1)
    expect(
      lastVisibleRow ? within(lastVisibleRow).getByText(/Virtualized row/i) : null,
    ).toBeTruthy()
  })

  it('shows a floating jump-to-latest button when the historical transcript is scrolled away from the bottom', async () => {
    render(
      <TranscriptRenderer
        items={buildHistoricalTimeline(createTranscript(40).entries)}
        isLive={false}
        isLoading={false}
        scrollContextKey="session-history-2"
      />,
    )

    const scrollRegion = screen.getByRole('region', {
      name: 'Transcript messages',
    })

    Object.defineProperty(scrollRegion, 'clientHeight', {
      configurable: true,
      value: 300,
    })
    Object.defineProperty(scrollRegion, 'scrollHeight', {
      configurable: true,
      value: 1200,
    })

    await act(async () => {
      scrollRegion.scrollTop = 24
      fireEvent.scroll(scrollRegion)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200))
    })

    expect(screen.getByRole('button', { name: 'Scroll to latest' })).toBeTruthy()

    scrollToMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Scroll to latest' }))

    expect(scrollToMock).toHaveBeenCalledWith(
      expect.objectContaining({ top: expect.any(Number), behavior: 'smooth' }),
    )
  })

  it('scrolls to the latest transcript entry when a notification deep link requests it', async () => {
    const items = buildHistoricalTimeline(createTranscript(16).entries)

    const { rerender } = render(
      <TranscriptRenderer
        items={items}
        isLive={false}
        isLoading={false}
        scrollToBottomSignal={0}
      />,
    )

    scrollToMock.mockClear()

    rerender(
      <TranscriptRenderer
        items={items}
        isLive={false}
        isLoading={false}
        scrollToBottomSignal={1}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(scrollToMock).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }))
  })

  it('jumps to the latest transcript row when a different historical session opens', async () => {
    const firstItems = buildHistoricalTimeline(createTranscript(16).entries)
    const secondItems = buildHistoricalTimeline(
      createTranscript(18).entries.map((entry, index) => ({
        ...entry,
        id: `${entry.id}-session-2-${index}`,
      })),
    )

    const { rerender } = render(
      <TranscriptRenderer
        items={firstItems}
        isLive={false}
        isLoading={false}
        scrollContextKey="session-history-a"
      />,
    )

    scrollToMock.mockClear()

    rerender(
      <TranscriptRenderer
        items={secondItems}
        isLive={false}
        isLoading={false}
        scrollContextKey="session-history-b"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(scrollToMock).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }))
  })

  it('jumps to the latest row when a selected historical session finishes loading', async () => {
    const items = buildHistoricalTimeline(createTranscript(20).entries)
    const { rerender } = render(
      <TranscriptRenderer
        items={[]}
        isLive={false}
        isLoading={true}
        scrollContextKey="session-history-loading"
      />,
    )

    scrollToMock.mockClear()

    rerender(
      <TranscriptRenderer
        items={items}
        isLive={false}
        isLoading={false}
        scrollContextKey="session-history-loading"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(scrollToMock).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }))
  })

  it('shows the jump-to-latest button after a selected historical session finishes loading and the user scrolls up', async () => {
    const items = buildHistoricalTimeline(createTranscript(40).entries)
    const { rerender } = render(
      <TranscriptRenderer
        items={[]}
        isLive={false}
        isLoading={true}
        scrollContextKey="session-history-loading-2"
      />,
    )

    rerender(
      <TranscriptRenderer
        items={items}
        isLive={false}
        isLoading={false}
        scrollContextKey="session-history-loading-2"
      />,
    )

    const scrollRegion = screen.getByRole('region', {
      name: 'Transcript messages',
    })

    Object.defineProperty(scrollRegion, 'clientHeight', {
      configurable: true,
      value: 300,
    })
    Object.defineProperty(scrollRegion, 'scrollHeight', {
      configurable: true,
      value: 1200,
    })

    await act(async () => {
      scrollRegion.scrollTop = 24
      fireEvent.scroll(scrollRegion)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200))
    })

    expect(screen.getByRole('button', { name: 'Scroll to latest' })).toBeTruthy()
  })

  it('recovers and scrolls to the latest row when historical transcript height expands after first paint', async () => {
    let scrollHeight = 0
    const items = buildHistoricalTimeline(createTranscript(40).entries)
    const { rerender } = render(
      <TranscriptRenderer
        items={items}
        isLive={false}
        isLoading={false}
        scrollContextKey="session-history-late-layout"
      />,
    )

    const scrollRegion = screen.getByRole('region', {
      name: 'Transcript messages',
    })

    Object.defineProperty(scrollRegion, 'clientHeight', {
      configurable: true,
      value: 300,
    })
    Object.defineProperty(scrollRegion, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeight
      },
    })

    scrollToMock.mockClear()
    scrollHeight = 1200

    rerender(
      <TranscriptRenderer
        items={items}
        isLive={false}
        isLoading={false}
        scrollContextKey="session-history-late-layout"
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(scrollToMock).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }))
  })

  it('renders user image attachments inline and keeps bubbles overflow-hidden', () => {
    const imageEntry = Object.assign(
      {
        kind: 'message' as const,
        id: 'message-user-image',
        occurredAt: '2026-03-25T01:04:00.000Z',
        role: 'user' as const,
        markdown: 'Screenshot for reference',
      },
      {
        contentBlocks: [
          { type: 'text' as const, text: 'Screenshot for reference' },
          {
            type: 'image' as const,
            mediaType: 'image/png',
            data: IMAGE_DATA,
          },
        ],
      },
    )

    render(
      <TranscriptRenderer
        items={buildHistoricalTimeline([imageEntry as SessionTranscript['entries'][number]])}
        isLive={false}
        isLoading={false}
      />,
    )

    const image = screen.getByRole('img', {
      name: /user attachment 1/i,
    })
    expect(image.getAttribute('src')).toBe(`data:image/png;base64,${IMAGE_DATA}`)

    const bubble = screen.getByText('Screenshot for reference').closest('div.rounded-lg')
    expect(bubble?.className).toContain('overflow-hidden')
  })
})
