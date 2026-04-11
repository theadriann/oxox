import { describe, expect, it } from 'vitest'

import { parseTranscriptFile } from '../artifacts/jsonlParser'

describe('parseTranscriptFile', () => {
  it('parses valid transcript lines and tracks byte offsets', async () => {
    const input = [
      JSON.stringify({
        type: 'session_start',
        timestamp: '2026-04-10T00:00:00.000Z',
        title: 'Session',
      }),
      JSON.stringify({
        type: 'message',
        timestamp: '2026-04-10T00:01:00.000Z',
        message: { role: 'user', content: 'hello' },
      }),
    ].join('\n')

    await expect(parseTranscriptFile(`${input}\n`)).resolves.toEqual({
      lastByteOffset: Buffer.byteLength(`${input}\n`, 'utf8'),
      records: [
        {
          type: 'session_start',
          timestamp: '2026-04-10T00:00:00.000Z',
          payload: { title: 'Session' },
        },
        {
          type: 'message',
          timestamp: '2026-04-10T00:01:00.000Z',
          payload: {
            message: { role: 'user', content: 'hello' },
          },
        },
      ],
    })
  })

  it('ignores blank lines', async () => {
    await expect(
      parseTranscriptFile(
        `\n${JSON.stringify({ type: 'session_start', timestamp: '2026-04-10T00:00:00.000Z' })}\n\n`,
      ),
    ).resolves.toEqual({
      lastByteOffset: Buffer.byteLength(
        `\n${JSON.stringify({ type: 'session_start', timestamp: '2026-04-10T00:00:00.000Z' })}\n\n`,
        'utf8',
      ),
      records: [
        {
          type: 'session_start',
          timestamp: '2026-04-10T00:00:00.000Z',
          payload: {},
        },
      ],
    })
  })

  it('ignores an incomplete trailing line', async () => {
    const completeLine = JSON.stringify({
      type: 'session_start',
      timestamp: '2026-04-10T00:00:00.000Z',
      title: 'Session',
    })
    const trailingPartial = '{"type":"message","timestamp":"2026-04-10T00:01:00.000Z"'

    await expect(parseTranscriptFile(`${completeLine}\n${trailingPartial}`)).resolves.toEqual({
      lastByteOffset: Buffer.byteLength(`${completeLine}\n`, 'utf8'),
      records: [
        {
          type: 'session_start',
          timestamp: '2026-04-10T00:00:00.000Z',
          payload: { title: 'Session' },
        },
      ],
    })
  })

  it('rejects non-object records and records without a string type', async () => {
    await expect(parseTranscriptFile('[]\n')).rejects.toThrow(
      'expected transcript records to be JSON objects',
    )
    await expect(
      parseTranscriptFile(`${JSON.stringify({ timestamp: '2026-04-10T00:00:00.000Z' })}\n`),
    ).rejects.toThrow('transcript record is missing a string type field')
  })
})
