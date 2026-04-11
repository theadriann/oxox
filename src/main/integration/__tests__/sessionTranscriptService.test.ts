import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadSessionTranscriptFromFile, parseSessionTranscript } from '../transcripts/service'

describe('session transcript service', () => {
  it('parses markdown messages and combines tool calls with their results', () => {
    const transcript = parseSessionTranscript(
      'session-1',
      join(tmpdir(), 'session-1.jsonl'),
      [
        JSON.stringify({
          type: 'session_start',
          id: 'session-1',
          title: 'Transcript parsing',
          cwd: '/tmp/project',
        }),
        JSON.stringify({
          type: 'message',
          id: 'message-user',
          timestamp: '2026-03-25T01:00:00.000Z',
          message: {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '# Heading\n\n- item\n- second item\n\nUse `inline` code and [Docs](https://example.com).\n\n```ts\nconst value = 1\n```',
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'message',
          id: 'message-assistant',
          timestamp: '2026-03-25T01:01:00.000Z',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Read',
                input: {
                  file_path: '/tmp/project/README.md',
                },
              },
              {
                type: 'text',
                text: 'Finished reading the transcript fixture.',
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'message',
          id: 'message-tool-result',
          timestamp: '2026-03-25T01:01:02.000Z',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: 'README contents loaded successfully.',
              },
            ],
          },
        }),
      ].join('\n'),
    )

    expect(transcript.entries).toEqual([
      expect.objectContaining({
        kind: 'message',
        id: 'message-user:0',
        role: 'user',
      }),
      expect.objectContaining({
        kind: 'tool_call',
        id: 'tool-1',
        toolName: 'Read',
        status: 'completed',
        resultMarkdown: 'README contents loaded successfully.',
      }),
      expect.objectContaining({
        kind: 'message',
        id: 'message-assistant:1',
        role: 'assistant',
        markdown: 'Finished reading the transcript fixture.',
      }),
    ])
    expect(transcript.entries[0]).toMatchObject({
      markdown:
        '# Heading\n\n- item\n- second item\n\nUse `inline` code and [Docs](https://example.com).\n\n```ts\nconst value = 1\n```',
    })
    expect(transcript.entries[1]).toMatchObject({
      inputMarkdown: '```json\n{\n  "file_path": "/tmp/project/README.md"\n}\n```',
    })
  })

  it('loads transcript entries from a JSONL file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'oxox-transcript-'))
    const filePath = join(directory, 'session-2.jsonl')
    writeFileSync(
      filePath,
      [
        JSON.stringify({
          type: 'session_start',
          id: 'session-2',
          title: 'Load transcript from disk',
        }),
        JSON.stringify({
          type: 'message',
          id: 'message-1',
          timestamp: '2026-03-25T01:03:00.000Z',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Loaded from disk.' }],
          },
        }),
      ].join('\n'),
      'utf8',
    )

    await expect(loadSessionTranscriptFromFile('session-2', filePath)).resolves.toMatchObject({
      sessionId: 'session-2',
      sourcePath: filePath,
      entries: [
        expect.objectContaining({
          kind: 'message',
          markdown: 'Loaded from disk.',
          role: 'assistant',
        }),
      ],
    })
  })

  it('preserves image content blocks instead of serializing them as JSON', () => {
    const transcript = parseSessionTranscript(
      'session-image',
      join(tmpdir(), 'session-image.jsonl'),
      [
        JSON.stringify({
          type: 'message',
          id: 'message-user-image',
          timestamp: '2026-03-25T01:05:00.000Z',
          message: {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Screenshot for reference',
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'ZmFrZS1pbWFnZS1ieXRlcw==',
                },
              },
            ],
          },
        }),
      ].join('\n'),
    )

    expect(transcript.entries).toMatchObject([
      expect.objectContaining({
        kind: 'message',
        markdown: 'Screenshot for reference',
        contentBlocks: [
          { type: 'text', text: 'Screenshot for reference' },
          {
            type: 'image',
            mediaType: 'image/png',
            data: 'ZmFrZS1pbWFnZS1ieXRlcw==',
          },
        ],
      }),
    ])
  })
})
