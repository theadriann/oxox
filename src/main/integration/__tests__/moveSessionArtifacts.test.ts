import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { moveSessionArtifacts } from '../artifacts/moveSessionArtifacts'

describe('moveSessionArtifacts', () => {
  it('moves transcript artifacts into the target project bucket and rewrites cwd metadata', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-move-session-'))
    const sessionsRoot = join(root, 'sessions')
    const sourceBucket = join(sessionsRoot, '-tmp-source')
    const targetWorkspacePath = join(root, 'target')
    mkdirSync(targetWorkspacePath, { recursive: true })
    const targetBucket = join(
      sessionsRoot,
      realpathSync(targetWorkspacePath).replace(/^\/+/u, '-').replace(/\//gu, '-'),
    )
    const sourceTranscriptPath = join(sourceBucket, 'session-move.jsonl')
    const sourceSettingsPath = join(sourceBucket, 'session-move.settings.json')

    mkdirSync(sourceBucket, { recursive: true })
    writeFileSync(
      sourceTranscriptPath,
      `${JSON.stringify({
        type: 'session_start',
        id: 'session-move',
        cwd: '/tmp/source',
        title: 'Movable session',
      })}\n${JSON.stringify({ type: 'message', message: { role: 'user', content: 'hi' } })}\n`,
    )
    writeFileSync(sourceSettingsPath, `${JSON.stringify({ model: 'gpt-5.5' }, null, 2)}\n`)

    const result = await moveSessionArtifacts({
      sessionId: 'session-move',
      sessionsRoot,
      sourcePath: sourceTranscriptPath,
      targetWorkspacePath,
    })

    const movedTranscriptPath = join(targetBucket, 'session-move.jsonl')
    const movedSettingsPath = join(targetBucket, 'session-move.settings.json')
    const [firstLine, secondLine] = readFileSync(movedTranscriptPath, 'utf8').trim().split('\n')

    expect(result.targetPath).toBe(movedTranscriptPath)
    expect(existsSync(sourceTranscriptPath)).toBe(false)
    expect(existsSync(sourceSettingsPath)).toBe(false)
    expect(JSON.parse(firstLine ?? '{}')).toMatchObject({ cwd: targetWorkspacePath })
    expect(JSON.parse(secondLine ?? '{}')).toMatchObject({ type: 'message' })
    expect(JSON.parse(readFileSync(movedSettingsPath, 'utf8'))).toMatchObject({
      cwd: targetWorkspacePath,
      model: 'gpt-5.5',
    })
  })

  it('refuses to overwrite an existing target transcript', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oxox-move-session-conflict-'))
    const sessionsRoot = join(root, 'sessions')
    const sourceBucket = join(sessionsRoot, '-tmp-source')
    const targetWorkspacePath = join(root, 'target')
    mkdirSync(targetWorkspacePath, { recursive: true })
    const targetBucket = join(
      sessionsRoot,
      realpathSync(targetWorkspacePath).replace(/^\/+/u, '-').replace(/\//gu, '-'),
    )

    mkdirSync(sourceBucket, { recursive: true })
    mkdirSync(targetBucket, { recursive: true })
    const sourceTranscriptPath = join(sourceBucket, 'session-move.jsonl')
    writeFileSync(
      sourceTranscriptPath,
      `${JSON.stringify({ type: 'session_start', id: 'session-move', cwd: '/tmp/source' })}\n`,
    )
    writeFileSync(join(targetBucket, 'session-move.jsonl'), 'existing\n')

    await expect(
      moveSessionArtifacts({
        sessionId: 'session-move',
        sessionsRoot,
        sourcePath: sourceTranscriptPath,
        targetWorkspacePath,
      }),
    ).rejects.toThrow(/already exists/u)
  })
})
