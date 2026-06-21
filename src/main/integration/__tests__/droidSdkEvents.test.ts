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
  extractEmbeddedSessionEventsFromDroidMessage,
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

  it('maps SDK default assistant, user, tool_call, and hook stream messages', () => {
    const assistantMessage = mapDroidMessageToSessionEvent(
      {
        type: 'assistant',
        text: 'Done',
        message: {
          id: 'assistant-1',
          role: 'assistant',
          createdAt: 1,
          updatedAt: 1,
          content: [{ type: 'text', text: 'Done' }],
        },
      } satisfies DroidMessage,
      'session-1',
    )
    const userMessage = mapDroidMessageToSessionEvent(
      {
        type: 'user',
        message: {
          id: 'user-1',
          role: 'user',
          createdAt: 2,
          updatedAt: 2,
          content: [{ type: 'text', text: 'Run tests' }],
        },
      } satisfies DroidMessage,
      'session-1',
      { rewindBoundaryMessageId: 'client-user-1' },
    )
    const toolCall = mapDroidMessageToSessionEvent(
      {
        type: 'tool_call',
        toolUse: {
          type: 'tool_use',
          id: 'tool-1',
          name: 'Read',
          input: { file_path: '/tmp/demo.ts' },
        },
      } satisfies DroidMessage,
      'session-1',
    )
    const hook = mapDroidMessageToSessionEvent(
      {
        type: 'hook',
        hookId: 'hook-1',
        eventName: 'PostToolUse',
        matcher: 'Read',
        toolCallId: 'tool-1',
        command: 'npm test',
        timeout: 60_000,
        status: 'completed',
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      } satisfies DroidMessage,
      'session-1',
    )

    expect(assistantMessage).toEqual({
      type: 'message.completed',
      sessionId: 'session-1',
      messageId: 'assistant-1',
      content: 'Done',
      contentBlocks: [{ type: 'text', text: 'Done' }],
      role: 'assistant',
    })
    expect(userMessage).toEqual({
      type: 'message.completed',
      sessionId: 'session-1',
      messageId: 'user-1',
      content: 'Run tests',
      rewindBoundaryMessageId: 'client-user-1',
      contentBlocks: [{ type: 'text', text: 'Run tests' }],
      role: 'user',
    })
    expect(toolCall).toEqual({
      type: 'tool.progress',
      sessionId: 'session-1',
      toolUseId: 'tool-1',
      toolName: 'Read',
      status: 'running',
      detail: '```json\n{\n  "file_path": "/tmp/demo.ts"\n}\n```',
    })
    expect(hook).toEqual({
      type: 'hook.execution',
      sessionId: 'session-1',
      hookId: 'hook-1',
      eventName: 'PostToolUse',
      matcher: 'Read',
      toolCallId: 'tool-1',
      command: 'npm test',
      timeout: 60_000,
      status: 'completed',
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
    })
  })

  it('extracts embedded tool results from SDK default user messages', () => {
    expect(
      extractEmbeddedSessionEventsFromDroidMessage(
        {
          type: 'user',
          message: {
            id: 'user-tool-result-1',
            role: 'user',
            createdAt: 2,
            updatedAt: 2,
            content: [
              {
                type: 'tool_result',
                toolUseId: 'tool-1',
                isError: false,
                content: 'Read complete.',
              },
            ],
          },
        } satisfies DroidMessage,
        'session-1',
      ),
    ).toEqual([
      {
        type: 'tool.result',
        sessionId: 'session-1',
        toolUseId: 'tool-1',
        toolName: 'Unknown tool',
        content: 'Read complete.',
        isError: false,
      },
    ])
  })

  it('uses default assistant message ids when matching embedded tool results', () => {
    expect(
      extractEmbeddedSessionEventsFromDroidMessage(
        {
          type: 'assistant',
          text: '',
          message: {
            id: 'assistant-tool-message-1',
            role: 'assistant',
            createdAt: 2,
            updatedAt: 2,
            content: [
              {
                type: 'tool_use',
                name: 'Read',
                input: { file_path: '/tmp/demo.ts' },
              },
              {
                type: 'tool_result',
                tool_use_id: 'assistant-tool-message-1:tool-use:0',
                is_error: false,
                content: 'Read complete.',
              },
            ],
          },
        } satisfies DroidMessage,
        'session-1',
      ),
    ).toEqual([
      {
        type: 'tool.result',
        sessionId: 'session-1',
        toolUseId: 'assistant-tool-message-1:tool-use:0',
        toolName: 'Read',
        content: 'Read complete.',
        isError: false,
      },
    ])
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
          enabledToolIds: ['read-cli', 'glob-cli'],
          disabledToolIds: ['execute-cli'],
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
        enabledToolIds: ['read-cli', 'glob-cli'],
        disabledToolIds: ['execute-cli'],
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

  it('maps latest SDK result, MCP auth, MCP status, and mission messages', () => {
    expect(
      mapDroidMessageToSessionEvent(
        {
          type: 'result',
          sessionId: 'session-1',
          durationMs: 1234,
          numTurns: 1,
          result: '{"status":"ok"}',
          tokenUsage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheCreationTokens: 0,
            cacheReadTokens: 2,
            thinkingTokens: 1,
          },
          messages: [],
          text: '{"status":"ok"}',
          turnCount: 1,
          subtype: 'success',
          isError: false,
          success: true,
          structuredOutput: { status: 'ok' },
          structuredOutputError: null,
          error: null,
        } satisfies DroidMessage,
        'session-1',
      ),
    ).toEqual({
      type: 'session.result',
      sessionId: 'session-1',
      success: true,
      text: '{"status":"ok"}',
      durationMs: 1234,
      turnCount: 1,
      structuredOutput: { status: 'ok' },
      structuredOutputError: null,
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheCreationTokens: 0,
        cacheReadTokens: 2,
        thinkingTokens: 1,
      },
      error: null,
    })

    expect(
      mapDroidMessageToSessionEvent(
        {
          type: 'mcp_auth_required',
          serverName: 'figma',
          authUrl: 'https://mcp.figma.com/oauth',
          message: 'Authenticate Figma MCP',
          state: 'state-1',
        } satisfies DroidMessage,
        'session-1',
      ),
    ).toEqual({
      type: 'mcp.authRequired',
      sessionId: 'session-1',
      serverName: 'figma',
      authUrl: 'https://mcp.figma.com/oauth',
      message: 'Authenticate Figma MCP',
      state: 'state-1',
    })

    expect(
      mapDroidMessageToSessionEvent(
        {
          type: 'mcp_status_changed',
          servers: [
            {
              name: 'figma',
              status: 'connected',
              source: 'user',
              isManaged: false,
            },
          ],
          summary: {
            total: 1,
            connected: 1,
            connecting: 0,
            failed: 0,
            disabled: 0,
          },
        } satisfies DroidMessage,
        'session-1',
      ),
    ).toEqual({
      type: 'mcp.statusChanged',
      sessionId: 'session-1',
      servers: [
        {
          name: 'figma',
          status: 'connected',
          source: 'user',
          isManaged: false,
        },
      ],
      summary: {
        total: 1,
        connected: 1,
        connecting: 0,
        failed: 0,
        disabled: 0,
      },
    })

    expect(
      mapDroidMessageToSessionEvent(
        {
          type: 'mission_worker_started',
          workerSessionId: 'worker-session-1',
        } satisfies DroidMessage,
        'session-1',
      ),
    ).toEqual({
      type: 'mission.workerStarted',
      sessionId: 'session-1',
      workerSessionId: 'worker-session-1',
    })
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

  it('maps latest raw tool_call notifications with a toolUse block', () => {
    expect(
      mapDroidNotificationPayloadToSessionEvents(
        {
          type: 'tool_call',
          toolUse: {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: {
              file_path: '/tmp/demo.ts',
            },
          },
        },
        'session-1',
      ),
    ).toEqual([
      {
        type: 'tool.progress',
        sessionId: 'session-1',
        toolUseId: 'tool-1',
        toolName: 'Read',
        status: 'running',
        detail: '```json\n{\n  "file_path": "/tmp/demo.ts"\n}\n```',
      },
    ])
  })

  it('does not let empty raw tool inputs hide populated notification parameters', () => {
    expect(
      mapDroidNotificationPayloadToSessionEvents(
        {
          type: 'tool_call',
          toolUse: {
            type: 'tool_use',
            id: 'tool-1',
            name: 'TodoWrite',
            input: {},
          },
          parameters: {
            todos: '1. [in_progress] Fix live tool calls',
          },
        },
        'session-1',
      ),
    ).toEqual([
      {
        type: 'tool.progress',
        sessionId: 'session-1',
        toolUseId: 'tool-1',
        toolName: 'TodoWrite',
        status: 'running',
        detail: '```json\n{\n  "todos": "1. [in_progress] Fix live tool calls"\n}\n```',
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
      options: [{ label: 'Proceed once', value: ToolConfirmationOutcome.ProceedOnce }],
      toolUseIds: ['tool-use-1'],
      reason: 'rm -rf /tmp/demo',
      riskLevel: 'high',
    })
  })

  it('preserves permission labels for unknown SDK option values', () => {
    const params: RequestPermissionRequestParams = {
      toolUses: [],
      options: [
        {
          label: 'Always allow tool',
          value: 'proceed_always_tools',
        },
        {
          label: 'Cancel',
          value: ToolConfirmationOutcome.Cancel,
        },
      ],
    }

    expect(createPermissionRequestedEvent('request-1', params).options).toEqual([
      { label: 'Always allow tool', value: 'proceed_always_tools' },
      { label: 'Cancel', value: ToolConfirmationOutcome.Cancel },
    ])
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
