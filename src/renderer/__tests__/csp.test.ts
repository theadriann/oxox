import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('renderer csp', () => {
  it('does not duplicate the CSP in a meta tag', () => {
    const currentDirectory = dirname(fileURLToPath(import.meta.url))
    const html = readFileSync(resolve(currentDirectory, '../index.html'), 'utf8')

    expect(html).not.toContain('Content-Security-Policy')
  })
})
