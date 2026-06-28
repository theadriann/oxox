import { describe, expect, it } from 'vitest'

import type { LiveSessionSnapshot } from '../../../../../shared/ipc/contracts'
import { deriveLiveSessionStatusIndicator } from '../liveSessionStatusIndicator'
import type { TimelineItem } from '../timelineTypes'

function createSnapshot(overrides: Partial<LiveSessionSnapshot> = {}): LiveSessionSnapshot {
  return {
    sessionId: 'session-live-1',
    title: 'Streaming session',
    status: 'idle',
    transport: 'stream-jsonrpc',
    processId: 4242,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/project',
    parentSessionId: null,
    availableModels: [],
    settings: {},
    messages: [],
    events: [],
    ...overrides,
  }
}

describe('deriveLiveSessionStatusIndicator', () => {
  it('prioritizes compacting, waiting, tools, and streaming states', () => {
    expect(
      deriveLiveSessionStatusIndicator(createSnapshot({ status: 'compacting_conversation' }), [])
        ?.label,
    ).toBe('Compressing context')

    expect(
      deriveLiveSessionStatusIndicator(createSnapshot(), [
        {
          kind: 'permission',
          id: 'permission-1',
          requestId: 'permission-1',
          description: 'Approve Execute',
          riskLevel: 'medium',
          options: [{ label: 'Approve', value: 'proceed_once' }],
          toolUseIds: ['tool-1'],
          selectedOption: null,
        },
      ])?.label,
    ).toBe('Waiting for approval')

    expect(
      deriveLiveSessionStatusIndicator(createSnapshot(), [
        {
          kind: 'tool',
          id: 'tool-1',
          toolUseId: 'tool-1',
          toolName: 'Read',
          status: 'running',
          occurredAt: null,
          inputMarkdown: null,
          resultMarkdown: null,
          resultIsError: false,
          progressHistory: [],
          progressSummary: 'Reading package.json',
        },
      ])?.label,
    ).toBe('Using Read')

    expect(
      deriveLiveSessionStatusIndicator(createSnapshot(), [
        {
          kind: 'message',
          id: 'message-1',
          messageId: 'message-1',
          role: 'assistant',
          content: 'Hello',
          status: 'streaming',
          occurredAt: null,
        },
      ])?.label,
    ).toBe('Streaming response')
  })

  it('includes latest output token details when available', () => {
    const status = deriveLiveSessionStatusIndicator(
      createSnapshot({
        status: 'active',
        events: [
          {
            type: 'session.tokenUsageChanged',
            tokenUsage: {
              inputTokens: 10,
              outputTokens: 51,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
              thinkingTokens: 0,
            },
          },
        ],
      }),
      [] satisfies TimelineItem[],
    )

    expect(status).toMatchObject({
      label: 'Generating',
      detail: '51 output tokens',
      isActive: true,
    })
  })
})
