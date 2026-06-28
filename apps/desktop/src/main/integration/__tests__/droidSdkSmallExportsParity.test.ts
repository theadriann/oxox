import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
  convertNotificationToStreamMessage,
  DroidClient,
  DroidSession,
  dispatchNotification,
  ProcessExitError,
  ProtocolEngine,
  run,
  SDK_TAG,
  StreamStateTracker,
} from '@factory/droid-sdk'
import { describe, expect, it } from 'vitest'

import {
  DROID_SDK_SMALL_EXPORT_PARITY_MATRIX,
  REQUIRED_DROID_SDK_SMALL_EXPORT_AREAS,
} from '../droidSdk/parity'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

describe('Droid SDK small export parity matrix', () => {
  it('covers every audited SDK helper, hook, error, run, protocol, and schema area', () => {
    const areas = new Set(DROID_SDK_SMALL_EXPORT_PARITY_MATRIX.map((entry) => entry.area))

    expect([...areas].sort()).toEqual([...REQUIRED_DROID_SDK_SMALL_EXPORT_AREAS].sort())
  })

  it('classifies the small SDK export areas intentionally', () => {
    expect(DROID_SDK_SMALL_EXPORT_PARITY_MATRIX).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          area: 'errors',
          decision: 'adopted',
          adoptedExports: expect.arrayContaining(['ProcessExitError']),
        }),
        expect.objectContaining({
          area: 'stream-utilities',
          decision: 'adopted',
          adoptedExports: expect.arrayContaining([
            'convertNotificationToStreamMessage',
            'StreamStateTracker',
          ]),
        }),
        expect.objectContaining({
          area: 'run-api',
          decision: 'sdk-only',
          rationale: expect.stringContaining('one-shot'),
        }),
        expect.objectContaining({
          area: 'protocol-engine',
          decision: 'sdk-only',
          rationale: expect.stringContaining('DroidClient'),
        }),
        expect.objectContaining({
          area: 'helpers',
          decision: 'deferred',
          rationale: expect.stringContaining('not package-public'),
        }),
        expect.objectContaining({
          area: 'hooks',
          decision: 'sdk-only',
          rationale: expect.stringContaining('hook files'),
        }),
        expect.objectContaining({
          area: 'schemas',
          decision: 'adopted',
        }),
      ]),
    )
  })

  it('keeps adopted and deferred SDK exports available from the top-level package only', () => {
    expect(ProcessExitError).toBeDefined()
    expect(convertNotificationToStreamMessage).toBeDefined()
    expect(StreamStateTracker).toBeDefined()
    expect(DroidClient).toBeDefined()
    expect(DroidSession).toBeDefined()
    expect(SDK_TAG).toMatchObject({ name: 'sdk' })

    expect(run).toBeDefined()
    expect(ProtocolEngine).toBeDefined()
    expect(dispatchNotification).toBeDefined()
  })

  it('does not import non-public SDK implementation subpaths from OXOX source', () => {
    const sourceFiles = collectSourceFiles(join(REPO_ROOT, 'src'))
    const subpathImports = sourceFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return [...source.matchAll(/from\s+['"]@factory\/droid-sdk\/([^'"]+)['"]/g)].map((match) => ({
        filePath: relative(REPO_ROOT, filePath),
        subpath: match[1],
      }))
    })

    expect(subpathImports).toEqual([])
  })
})

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry)
    const stats = statSync(entryPath)

    if (stats.isDirectory()) {
      return collectSourceFiles(entryPath)
    }

    return /\.(ts|tsx)$/.test(entry) ? [entryPath] : []
  })
}
