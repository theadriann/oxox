import type { LiveSessionSnapshot } from '../../../../../shared/ipc/contracts'
import { appendLiveTimelineEvents, createLiveTimelineAccumulator } from '../liveTimelineAccumulator'

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

describe('liveTimelineAccumulator', () => {
  it('uses session.result for metadata without rendering successful turns', () => {
    const accumulator = createLiveTimelineAccumulator(createSnapshot())

    const result = appendLiveTimelineEvents(accumulator, createSnapshot(), [
      {
        type: 'session.result',
        success: true,
        text: 'Created index.html and about.html.',
        durationMs: 10_500,
        turnCount: 1,
        structuredOutput: 'No additional details.',
      },
    ])

    expect(result.items).toEqual([])
  })

  it('replaces empty live tool input with later structured input updates', () => {
    const accumulator = createLiveTimelineAccumulator(createSnapshot())

    const result = appendLiveTimelineEvents(accumulator, createSnapshot(), [
      {
        type: 'tool.progress',
        toolUseId: 'tool-1',
        toolName: 'Edit',
        status: 'running',
        detail: '```json\n{}\n```',
      },
      {
        type: 'tool.progress',
        toolUseId: 'tool-1',
        toolName: 'Edit',
        status: 'running',
        detail:
          '```json\n{\n  "file_path": "/tmp/index.html",\n  "old_str": "<title>Home</title>",\n  "new_str": "<title>Test - Home</title>"\n}\n```',
      },
      {
        type: 'tool.result',
        toolUseId: 'tool-1',
        toolName: 'Edit',
        content: '{"success":true,"file_path":"/tmp/index.html"}',
        isError: false,
      },
    ])

    expect(result.items).toHaveLength(1)
    const [tool] = result.items
    expect(tool?.kind).toBe('tool')
    if (tool?.kind !== 'tool') return

    expect(tool.inputMarkdown).toContain('"file_path": "/tmp/index.html"')
    expect(tool.inputMarkdown).not.toBe('```json\n{}\n```')
    expect(tool.progressHistory).toEqual([])
    expect(tool.status).toBe('completed')
  })
})
