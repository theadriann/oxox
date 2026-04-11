import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { renameSessionTitleInTranscript } from '../transcripts/mutations'

describe('renameSessionTitleInTranscript', () => {
  it('sets sessionTitle and isSessionTitleManuallySet on the first session_start line', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'oxox-transcript-mutations-'))
    const sourcePath = join(directory, 'session-1.jsonl')

    writeFileSync(
      sourcePath,
      [
        JSON.stringify({
          type: 'session_start',
          id: 'session-1',
          title: 'Original title',
          cwd: '/tmp/project',
        }),
        JSON.stringify({
          type: 'message',
          id: 'message-1',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Hello there' }],
          },
        }),
      ].join('\n'),
      'utf8',
    )

    await renameSessionTitleInTranscript(sourcePath, 'Renamed session')

    const [firstLine, secondLine] = readFileSync(sourcePath, 'utf8').trim().split('\n')

    expect(JSON.parse(firstLine ?? '{}')).toMatchObject({
      type: 'session_start',
      id: 'session-1',
      title: 'Original title',
      sessionTitle: 'Renamed session',
      isSessionTitleManuallySet: true,
    })
    expect(JSON.parse(secondLine ?? '{}')).toMatchObject({
      type: 'message',
      id: 'message-1',
    })
  })

  it('throws when the transcript does not start with a session_start record', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'oxox-transcript-mutations-'))
    const sourcePath = join(directory, 'session-2.jsonl')

    writeFileSync(
      sourcePath,
      JSON.stringify({
        type: 'message',
        id: 'message-1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'No session start here' }],
        },
      }),
      'utf8',
    )

    await expect(renameSessionTitleInTranscript(sourcePath, 'Renamed session')).rejects.toThrow(
      /session_start/,
    )
  })
})
