import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolveDroidCliStatus } from '../droid/resolveDroidCliStatus'

describe('resolveDroidCliStatus', () => {
  const cleanup: Array<() => void> = []

  afterEach(() => {
    while (cleanup.length > 0) {
      cleanup.pop()?.()
    }
  })

  it('prefers an explicit ~/.local/bin candidate and returns its version metadata', () => {
    const binDirectory = mkdtempSync(join(tmpdir(), 'oxox-droid-bin-'))
    const droidPath = join(binDirectory, 'droid')

    writeFileSync(
      droidPath,
      ['#!/bin/sh', 'if [ "$1" = "--version" ]; then', '  echo "droid 0.84.0"', 'fi'].join('\n'),
      { mode: 0o755 },
    )

    const status = resolveDroidCliStatus({
      homeDirectory: binDirectory,
      pathEnvironment: '',
      knownLocations: [droidPath],
    })

    expect(status.available).toBe(true)
    expect(status.path).toBe(droidPath)
    expect(status.version).toContain('0.84.0')
    expect(status.searchedLocations).toContain(droidPath)
  })

  it('returns a missing state instead of throwing when no binary is available', () => {
    const status = resolveDroidCliStatus({
      homeDirectory: '/Users/example',
      pathEnvironment: '',
      knownLocations: ['/Users/example/.local/bin/droid'],
    })

    expect(status.available).toBe(false)
    expect(status.error).toMatch(/not found/i)
    expect(status.searchedLocations).toContain('/Users/example/.local/bin/droid')
  })
})
