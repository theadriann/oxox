import type {
  AskUserRequestParams,
  DroidMessage,
  RequestPermissionRequestParams,
} from '@factory/droid-sdk'
import { ToolConfirmationOutcome } from '@factory/droid-sdk'
import { describe, expect, it } from 'vitest'

import {
  createAskUserRequestedEvent,
  createPermissionRequestedEvent,
  mapDroidMessageToSessionEvent,
  mapDroidNotificationPayloadToSessionEvents,
} from '../droidSdk/events'

describe('mapDroidMessageToSessionEvent', () => {
  it('maps official SDK stream messages onto OXOX session events', () => {
    const assistantDelta = mapDroidMessageToSessionEvent(
      {
        type: 'assistant_text_delta',
        messageId: 'message-1',
        blockIndex: 0,
        text: 'Hello',
      } satisfies DroidMessage,
      'session-1',
    )
    const thinkingDelta = mapDroidMessageToSessionEvent(
      {
        type: 'thinking_text_delta',
        messageId: 'message-1',
        blockIndex: 1,
        text: 'Thinking',
      } satisfies DroidMessage,
      'session-1',
    )
    const tokenUsage = mapDroidMessageToSessionEvent(
      {
        type: 'token_usage_update',
        inputTokens: 11,
        outputTokens: 7,
        cacheReadTokens: 5,
        cacheWriteTokens: 3,
        thinkingTokens: 2,
      } satisfies DroidMessage,
      'session-1',
    )

    expect(assistantDelta).toEqual({
      type: 'message.delta',
      sessionId: 'session-1',
      messageId: 'message-1',
      delta: 'Hello',
      channel: 'assistant',
      blockIndex: 0,
    })
    expect(thinkingDelta).toEqual({
      type: 'message.delta',
      sessionId: 'session-1',
      messageId: 'message-1',
      delta: 'Thinking',
      channel: 'thinking',
      blockIndex: 1,
    })
    expect(tokenUsage).toEqual({
      type: 'session.tokenUsageChanged',
      sessionId: 'session-1',
      tokenUsage: {
        inputTokens: 11,
        outputTokens: 7,
        cacheCreationTokens: 3,
        cacheReadTokens: 5,
        thinkingTokens: 2,
      },
    })
  })

  it('maps SDK tool_use stream messages into named in-progress tool events', () => {
    const toolUse = mapDroidMessageToSessionEvent(
      {
        type: 'tool_use',
        toolName: 'kova___search_chunks',
        toolInput: {
          vault: 'life',
          query: 'my name',
        },
        toolUseId: 'tool-1',
      } satisfies DroidMessage,
      'session-1',
    )

    expect(toolUse).toEqual({
      type: 'tool.progress',
      sessionId: 'session-1',
      toolUseId: 'tool-1',
      toolName: 'kova___search_chunks',
      status: 'running',
      detail: '```json\n{\n  "vault": "life",\n  "query": "my name"\n}\n```',
    })
  })

  it('maps completed messages, settings updates, and process errors onto OXOX events', () => {
    const completedMessage = mapDroidMessageToSessionEvent(
      {
        type: 'create_message',
        messageId: 'message-2',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Summary ready',
          },
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: {
              file_path: '/tmp/demo.ts',
            },
          },
        ],
      } satisfies DroidMessage,
      'session-1',
    )
    const settingsUpdate = mapDroidMessageToSessionEvent(
      {
        type: 'settings_updated',
        settings: {
          interactionMode: 'plan',
          modelId: 'claude-sonnet-4',
          autonomyLevel: 'high',
          autonomyMode: 'full-auto',
          specModeModelId: 'claude-opus-4.1',
          specModeReasoningEffort: 'high',
          enabledToolIds: ['Read', 'Glob'],
          disabledToolIds: ['Execute'],
        },
      } satisfies DroidMessage,
      'session-1',
    )
    const processError = mapDroidMessageToSessionEvent(
      {
        type: 'error',
        message: 'Transport exploded',
        errorType: 'transport_error',
        timestamp: '2026-04-03T00:00:00.000Z',
      } satisfies DroidMessage,
      'session-1',
    )

    expect(completedMessage).toEqual({
      type: 'message.completed',
      sessionId: 'session-1',
      messageId: 'message-2',
      content: 'Summary ready',
      contentBlocks: [{ type: 'text', text: 'Summary ready' }],
      role: 'assistant',
    })
    expect(settingsUpdate).toEqual({
      type: 'session.settingsChanged',
      sessionId: 'session-1',
      settings: {
        interactionMode: 'plan',
        modelId: 'claude-sonnet-4',
        autonomyLevel: 'high',
        autonomyMode: 'full-auto',
        specModeModelId: 'claude-opus-4.1',
        specModeReasoningEffort: 'high',
        enabledToolIds: ['Read', 'Glob'],
        disabledToolIds: ['Execute'],
      },
    })
    expect(processError).toEqual({
      type: 'stream.error',
      sessionId: 'session-1',
      error: new Error('Transport exploded'),
      recoverable: true,
    })
  })

  it('preserves image blocks for completed messages and ignores tool-only create_message payloads', () => {
    const imageMessage = mapDroidMessageToSessionEvent(
      {
        type: 'create_message',
        messageId: 'message-image-1',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'See attached screenshot.',
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              mediaType: 'image/png',
              data: 'ZmFrZS1pbWFnZS1ieXRlcw==',
            },
          },
        ],
      } satisfies DroidMessage,
      'session-1',
    )
    const toolOnlyMessage = mapDroidMessageToSessionEvent(
      {
        type: 'create_message',
        messageId: 'message-tool-only',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: { file_path: '/tmp/demo.ts' },
          },
        ],
      } satisfies DroidMessage,
      'session-1',
    )

    expect(imageMessage).toEqual({
      type: 'message.completed',
      sessionId: 'session-1',
      messageId: 'message-image-1',
      content: 'See attached screenshot.',
      contentBlocks: [
        { type: 'text', text: 'See attached screenshot.' },
        {
          type: 'image',
          mediaType: 'image/png',
          data: 'ZmFrZS1pbWFnZS1ieXRlcw==',
        },
      ],
      role: 'assistant',
    })
    expect(toolOnlyMessage).toBeNull()
  })
})

describe('mapDroidNotificationPayloadToSessionEvents', () => {
  it('preserves exact context-window fields from raw token usage notifications', () => {
    expect(
      mapDroidNotificationPayloadToSessionEvents(
        {
          type: 'session_token_usage_changed',
          sessionId: 'session-1',
          tokenUsage: {
            inputTokens: 1000,
            outputTokens: 500,
            cacheCreationTokens: 50,
            cacheReadTokens: 200,
            thinkingTokens: 100,
          },
          lastCallTokenUsage: {
            inputTokens: 78000,
            cacheReadTokens: 0,
          },
        },
        'session-1',
      ),
    ).toEqual([
      {
        type: 'session.tokenUsageChanged',
        sessionId: 'session-1',
        tokenUsage: {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationTokens: 50,
          cacheReadTokens: 200,
          thinkingTokens: 100,
        },
        lastCallTokenUsage: {
          inputTokens: 78000,
          cacheReadTokens: 0,
        },
      },
    ])
  })
})

describe('mapDroidNotificationPayloadToSessionEvents', () => {
  it('maps legacy raw tool_call notifications before the SDK fallback path', () => {
    expect(
      mapDroidNotificationPayloadToSessionEvents(
        {
          type: 'tool_call',
          toolUseId: 'tool-1',
          toolName: 'kova___search_chunks',
          parameters: {
            vault: 'life',
            query: 'my name',
          },
        },
        'session-1',
      ),
    ).toEqual([
      {
        type: 'tool.progress',
        sessionId: 'session-1',
        toolUseId: 'tool-1',
        toolName: 'kova___search_chunks',
        status: 'running',
        detail: '```json\n{\n  "vault": "life",\n  "query": "my name"\n}\n```',
      },
    ])

    expect(
      mapDroidNotificationPayloadToSessionEvents(
        {
          type: 'tool_result',
          tool_use_id: 'tool-1',
          toolName: 'kova___search_chunks',
          content: 'Adrian Brojbeanu',
        },
        'session-1',
      ),
    ).toEqual([
      {
        type: 'tool.result',
        sessionId: 'session-1',
        toolUseId: 'tool-1',
        toolName: 'kova___search_chunks',
        content: 'Adrian Brojbeanu',
        isError: false,
      },
    ])
  })
})

describe('createPermissionRequestedEvent', () => {
  it('derives OXOX permission request events from official SDK request params', () => {
    const params: RequestPermissionRequestParams = {
      toolUses: [
        {
          toolUse: {
            id: 'tool-use-1',
            name: 'Execute',
            input: {},
          },
          confirmationType: 'exec',
          details: {
            type: 'exec',
            fullCommand: 'rm -rf /tmp/demo',
            impactLevel: 'high',
          },
        },
      ],
      options: [
        {
          label: 'Proceed once',
          value: ToolConfirmationOutcome.ProceedOnce,
        },
      ],
    }

    expect(createPermissionRequestedEvent('request-1', params, 'session-1')).toEqual({
      type: 'permission.requested',
      sessionId: 'session-1',
      requestId: 'request-1',
      options: [ToolConfirmationOutcome.ProceedOnce],
      toolUseIds: ['tool-use-1'],
      reason: 'rm -rf /tmp/demo',
      riskLevel: 'high',
    })
  })
})

describe('createAskUserRequestedEvent', () => {
  it('derives OXOX ask-user events from official SDK request params', () => {
    const params: AskUserRequestParams = {
      toolCallId: 'tool-call-1',
      questions: [
        {
          index: 0,
          topic: 'Features',
          question: 'Which feature should we enable?',
          options: ['Auth', 'Search'],
        },
        {
          index: 1,
          topic: 'Database',
          question: 'Which database should we use?',
          options: ['SQLite', 'PostgreSQL'],
        },
      ],
    }

    expect(createAskUserRequestedEvent('request-2', params, 'session-1')).toEqual({
      type: 'askUser.requested',
      sessionId: 'session-1',
      requestId: 'request-2',
      toolCallId: 'tool-call-1',
      prompt: 'Which feature should we enable?',
      options: ['Auth', 'Search'],
      questions: [
        {
          index: 0,
          topic: 'Features',
          question: 'Which feature should we enable?',
          options: ['Auth', 'Search'],
        },
        {
          index: 1,
          topic: 'Database',
          question: 'Which database should we use?',
          options: ['SQLite', 'PostgreSQL'],
        },
      ],
    })
  })
})
