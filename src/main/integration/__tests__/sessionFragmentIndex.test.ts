import { describe, expect, it } from 'vitest'

import type { TranscriptEntry } from '../../../shared/ipc/contracts'
import type { TranscriptRecord } from '../artifacts/jsonlParser'
import { extractTranscriptSearchFragments } from '../search/sessionFragmentIndex'

function createSourceRecord(
  overrides: Partial<TranscriptRecord> & Pick<TranscriptRecord, 'type' | 'payload'>,
): TranscriptRecord {
  return {
    byteLength: 100,
    byteOffset: 0,
    compactionSummaryId: null,
    lineNo: 1,
    parentRecordId: null,
    rawHash: 'hash',
    recordId: null,
    timestamp: '2026-06-11T10:00:00.000Z',
    ...overrides,
  }
}

describe('extractTranscriptSearchFragments', () => {
  it('normalizes messages and paired tool calls into jumpable fragment documents', () => {
    const entries: TranscriptEntry[] = [
      {
        kind: 'message',
        id: 'message-1:0',
        sourceMessageId: 'message-1',
        occurredAt: '2026-06-11T10:00:00.000Z',
        role: 'user',
        markdown: 'Find daemon transport failures in contracts.ts',
      },
      {
        kind: 'tool_call',
        id: 'tool-1',
        toolUseId: 'tool-1',
        occurredAt: '2026-06-11T10:00:02.000Z',
        toolName: 'Execute',
        status: 'failed',
        inputMarkdown: 'pnpm test daemonTransport.test.ts',
        resultMarkdown: 'FAIL daemonTransport.test.ts ResizeObserver is not defined',
        resultIsError: true,
      },
    ]

    const fragments = extractTranscriptSearchFragments({
      entries,
      sessionId: 'session-1',
      projectId: 'project-1',
    })

    expect(fragments).toEqual([
      expect.objectContaining({
        id: 'session-1:message:message-1:0',
        sessionId: 'session-1',
        projectId: 'project-1',
        sourceKind: 'block',
        sourceId: 'message-1:0',
        messageId: 'message-1',
        role: 'user',
        title: 'User message',
        body: 'find daemon transport failures in contracts.ts',
      }),
      expect.objectContaining({
        id: 'session-1:tool:tool-1',
        sessionId: 'session-1',
        sourceKind: 'tool_call',
        sourceId: 'tool-1',
        messageId: null,
        toolCallId: 'tool-1',
        toolName: 'execute',
        status: 'error',
        title: 'Execute',
        body: expect.stringContaining('daemontransport.test.ts'),
      }),
      expect.objectContaining({
        id: 'session-1:tool-result:tool-1',
        sessionId: 'session-1',
        sourceKind: 'tool_result',
        sourceId: 'tool-1',
        messageId: null,
        toolCallId: 'tool-1',
        toolName: 'execute',
        status: 'error',
        title: 'Execute',
        subtitle: 'Tool error',
        body: expect.stringContaining('daemontransport.test.ts'),
      }),
    ])
  })

  it('indexes structured todos, compactions, settings, snapshots, and concise tool entities', () => {
    const entries: TranscriptEntry[] = [
      {
        kind: 'tool_call',
        id: 'tool-execute',
        toolUseId: 'tool-execute',
        occurredAt: '2026-06-11T10:03:00.000Z',
        toolName: 'Execute',
        status: 'failed',
        inputMarkdown: '```json\n{"command":"pnpm test --filter daemon/transport.ts"}\n```',
        resultMarkdown: `${'noise '.repeat(200)}\nFAIL daemon/transport.ts ResizeObserver is not defined\nexit code 1`,
        resultIsError: true,
      },
      {
        kind: 'tool_call',
        id: 'tool-patch',
        toolUseId: 'tool-patch',
        occurredAt: '2026-06-11T10:04:00.000Z',
        toolName: 'ApplyPatch',
        status: 'completed',
        inputMarkdown: '*** Update File: src/shared/ipc/contracts.ts\n+type Added = true\n',
        resultMarkdown: 'Done',
        resultIsError: false,
      },
    ]

    const fragments = extractTranscriptSearchFragments({
      entries,
      sessionId: 'session-58',
      projectId: 'project-1',
      settings: {
        autonomyMode: 'high',
        compactionTokenLimit: 300_000,
        modelId: 'claude-opus-4-6',
        reasoningEffort: 'high',
      },
      sourceRecords: [
        createSourceRecord({
          type: 'todo_state',
          recordId: 'todo-record',
          payload: {
            todos: [
              { content: 'Fix OXO-41 contracts.ts search', status: 'in_progress' },
              { text: 'Run pnpm test', status: 'pending' },
            ],
          },
        }),
        createSourceRecord({
          type: 'compaction_state',
          recordId: 'compaction-record',
          compactionSummaryId: 'summary-1',
          payload: {
            summary: {
              id: 'summary-1',
              text: 'Remember daemon/transport.ts retry behavior and OXO-41 Linear context.',
              tokenCount: 1200,
            },
            removedCount: 5,
          },
        }),
      ],
      snapshots: [
        {
          capturedAt: 1_780_000_000_000,
          contentHash: 'abc123',
          filePath: '/repo/src/shared/ipc/contracts.ts',
          messageId: 'message-1',
          sizeBytes: 2048,
          toolCallId: 'tool-patch',
        },
      ],
    })

    expect(fragments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKind: 'settings',
          sourceId: 'session-58:settings',
          body: expect.stringContaining('claude-opus-4-6'),
        }),
        expect.objectContaining({
          sourceKind: 'todo',
          sourceId: 'todo-record',
          body: expect.stringContaining('oxo-41 contracts.ts search'),
        }),
        expect.objectContaining({
          sourceKind: 'compaction',
          sourceId: 'summary-1',
          body: expect.stringContaining('daemon/transport.ts retry behavior'),
        }),
        expect.objectContaining({
          sourceKind: 'file_snapshot',
          filePath: '/repo/src/shared/ipc/contracts.ts',
          body: expect.stringContaining('abc123'),
        }),
        expect.objectContaining({
          sourceKind: 'tool_call',
          sourceId: 'tool-execute',
          body: expect.stringContaining('pnpm test --filter daemon/transport.ts'),
          status: 'error',
        }),
        expect.objectContaining({
          sourceKind: 'tool_call',
          sourceId: 'tool-patch',
          body: expect.stringContaining('src/shared/ipc/contracts.ts'),
        }),
      ]),
    )
    const executeFragment = fragments.find((fragment) => fragment.sourceId === 'tool-execute')
    expect(executeFragment?.body).toContain('resizeobserver is not defined')
    expect(executeFragment?.body.length).toBeLessThan(650)
  })
})
