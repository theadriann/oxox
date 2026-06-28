import { describe, expect, it } from 'vitest'

import { parseTranscriptFile } from '../artifacts/jsonlParser'

describe('parseTranscriptFile', () => {
  it('parses valid transcript lines and tracks byte offsets', async () => {
    const firstLine = JSON.stringify({
      type: 'session_start',
      timestamp: '2026-04-10T00:00:00.000Z',
      title: 'Session',
    })
    const secondLine = JSON.stringify({
      type: 'message',
      timestamp: '2026-04-10T00:01:00.000Z',
      id: 'message-1',
      parent: 'parent-record',
      compaction_summary_id: 'summary-1',
      message: { role: 'user', content: 'héllo' },
    })
    const input = [firstLine, secondLine].join('\n')

    await expect(parseTranscriptFile(`${input}\n`)).resolves.toMatchObject({
      lastByteOffset: Buffer.byteLength(`${input}\n`, 'utf8'),
      records: [
        {
          type: 'session_start',
          timestamp: '2026-04-10T00:00:00.000Z',
          payload: { title: 'Session' },
          lineNo: 1,
          byteOffset: 0,
          byteLength: Buffer.byteLength(`${firstLine}\n`, 'utf8'),
          recordId: null,
          parentRecordId: null,
          compactionSummaryId: null,
        },
        {
          type: 'message',
          timestamp: '2026-04-10T00:01:00.000Z',
          payload: {
            id: 'message-1',
            parent: 'parent-record',
            compaction_summary_id: 'summary-1',
            message: { role: 'user', content: 'héllo' },
          },
          lineNo: 2,
          byteOffset: Buffer.byteLength(`${firstLine}\n`, 'utf8'),
          byteLength: Buffer.byteLength(`${secondLine}\n`, 'utf8'),
          recordId: 'message-1',
          parentRecordId: 'parent-record',
          compactionSummaryId: 'summary-1',
        },
      ],
    })
    const parsed = await parseTranscriptFile(`${input}\n`)
    expect(parsed.records[0]?.rawHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(parsed.records[1]?.rawHash).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('ignores blank lines', async () => {
    await expect(
      parseTranscriptFile(
        `\n${JSON.stringify({ type: 'session_start', timestamp: '2026-04-10T00:00:00.000Z' })}\n\n`,
      ),
    ).resolves.toMatchObject({
      lastByteOffset: Buffer.byteLength(
        `\n${JSON.stringify({ type: 'session_start', timestamp: '2026-04-10T00:00:00.000Z' })}\n\n`,
        'utf8',
      ),
      records: [
        {
          type: 'session_start',
          timestamp: '2026-04-10T00:00:00.000Z',
          payload: {},
          lineNo: 2,
        },
      ],
    })
  })

  it('supports non-zero append offsets and absolute line numbers', async () => {
    const prefix = `${JSON.stringify({ type: 'message', timestamp: '2026-04-10T00:00:00.000Z', id: 'old' })}\n`
    const appended = `${JSON.stringify({ type: 'message', timestamp: '2026-04-10T00:01:00.000Z', id: 'new' })}\n`

    await expect(
      parseTranscriptFile(appended, {
        startLineNo: 2,
        startOffset: Buffer.byteLength(prefix, 'utf8'),
      }),
    ).resolves.toMatchObject({
      lastByteOffset: Buffer.byteLength(appended, 'utf8'),
      records: [
        {
          lineNo: 2,
          byteOffset: Buffer.byteLength(prefix, 'utf8'),
          byteLength: Buffer.byteLength(appended, 'utf8'),
          recordId: 'new',
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

    await expect(parseTranscriptFile(`${completeLine}\n${trailingPartial}`)).resolves.toMatchObject(
      {
        lastByteOffset: Buffer.byteLength(`${completeLine}\n`, 'utf8'),
        records: [
          {
            type: 'session_start',
            timestamp: '2026-04-10T00:00:00.000Z',
            payload: { title: 'Session' },
            byteOffset: 0,
            byteLength: Buffer.byteLength(`${completeLine}\n`, 'utf8'),
          },
        ],
      },
    )
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
