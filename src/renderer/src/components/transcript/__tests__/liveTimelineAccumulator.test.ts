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

  it('renders failed session results as compact notices with summarized error details', () => {
    const accumulator = createLiveTimelineAccumulator(createSnapshot())
    const providerError =
      '{"detail":"This model is not available due to your organization’s security settings.","status":403,"title":"Forbidden","requestId":"sin1::request"}'

    const result = appendLiveTimelineEvents(accumulator, createSnapshot(), [
      {
        type: 'session.result',
        success: false,
        text: 'Droid reported an error.',
        durationMs: 1300,
        turnCount: 1,
        structuredOutput: undefined,
        error: `403 ${providerError}`,
      },
    ])

    expect(result.items).toHaveLength(1)
    const [item] = result.items
    expect(item?.kind).toBe('event')
    if (item?.kind !== 'event') return

    expect(item).toMatchObject({
      title: 'Turn failed',
      body: '403 Forbidden — This model is not available due to your organization’s security settings.',
      typeLabel: 'session.result',
      tone: 'danger',
      layout: 'compact',
    })
    expect(item.details).toEqual(['Duration: 1.3s', 'Turns: 1', `Details: 403 ${providerError}`])
  })

  it('renders recoverable stream errors as compact reconnecting notices', () => {
    const accumulator = createLiveTimelineAccumulator(createSnapshot())

    const result = appendLiveTimelineEvents(accumulator, createSnapshot(), [
      {
        type: 'stream.error',
        error:
          '403 {"detail":"This model is not available due to your organization’s security settings.","status":403,"title":"Forbidden"}',
        recoverable: true,
      },
    ])

    expect(result.items).toHaveLength(1)
    const [item] = result.items
    expect(item?.kind).toBe('event')
    if (item?.kind !== 'event') return

    expect(item).toMatchObject({
      title: 'Connection interrupted',
      body: 'Reconnecting… partial response preserved.',
      typeLabel: 'stream.error',
      tone: 'warning',
      layout: 'compact',
    })
    expect(item.details).toEqual([
      'Details: 403 Forbidden — This model is not available due to your organization’s security settings.',
    ])
  })

  it('renders reconnected stream warnings as compact restored notices', () => {
    const accumulator = createLiveTimelineAccumulator(createSnapshot())

    const result = appendLiveTimelineEvents(accumulator, createSnapshot(), [
      {
        type: 'stream.warning',
        warning: 'Connection restored. Streaming resumed.',
        kind: 'reconnected',
      },
    ])

    expect(result.items).toHaveLength(1)
    const [item] = result.items
    expect(item?.kind).toBe('event')
    if (item?.kind !== 'event') return

    expect(item).toMatchObject({
      title: 'Connection restored',
      body: 'Streaming resumed.',
      typeLabel: 'stream.warning',
      tone: 'success',
      layout: 'compact',
    })
    expect(item.details).toEqual([])
  })

  it('renders session compaction as a compact transcript event', () => {
    const accumulator = createLiveTimelineAccumulator(createSnapshot())

    const result = appendLiveTimelineEvents(accumulator, createSnapshot(), [
      {
        type: 'session.compacted',
        summaryId: 'summary-1',
        removedCount: 42,
        visibleBoundaryMessageId: 'message-5',
      },
    ])

    expect(result.items).toHaveLength(1)
    const [item] = result.items
    expect(item?.kind).toBe('event')
    if (item?.kind !== 'event') return

    expect(item).toMatchObject({
      title: 'Conversation compressed',
      body: 'Removed 42 transcript items from active context.',
      typeLabel: 'session.compacted',
      tone: 'success',
      layout: 'compact',
    })
    expect(item.details).toEqual(['Summary: summary-1', 'Visible boundary: message-5'])
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
