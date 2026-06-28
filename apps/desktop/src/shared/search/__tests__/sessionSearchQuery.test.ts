import { describe, expect, it } from 'vitest'

import { parseSessionSearchQuery } from '../sessionSearchQuery'

describe('parseSessionSearchQuery', () => {
  it('extracts normalized free-text terms', () => {
    const parsed = parseSessionSearchQuery('  SDK auth   flow  ')

    expect(parsed.freeText).toBe('sdk auth flow')
    expect(parsed.terms).toEqual(['sdk', 'auth', 'flow'])
    expect(parsed.termGroups).toEqual([[['sdk']], [['auth']], [['flow']]])
    expect(parsed.modifiers).toEqual({})
  })

  it('keeps issue-key tokens exact while allowing hyphenated product names to match split words', () => {
    const parsed = parseSessionSearchQuery('awesome-cli windows OXO-59')

    expect(parsed.terms).toEqual(['awesome-cli', 'windows', 'oxo-59'])
    expect(parsed.termGroups).toEqual([
      [['awesome-cli'], ['awesome', 'cli']],
      [['windows']],
      [['oxo-59']],
    ])
  })

  it('extracts quoted and unquoted field modifiers', () => {
    const parsed = parseSessionSearchQuery(
      'title:"SDK runtime" path:/awesome project:"Factory App" content:auth tool:Edit status:completed id:ABC extra',
    )

    expect(parsed.freeText).toBe('extra')
    expect(parsed.terms).toEqual(['extra'])
    expect(parsed.modifiers).toEqual({
      title: ['sdk runtime'],
      path: ['/awesome'],
      project: ['factory app'],
      content: ['auth'],
      tool: ['edit'],
      status: ['completed'],
      id: ['abc'],
    })
  })

  it('keeps repeated modifiers as AND clauses', () => {
    const parsed = parseSessionSearchQuery('content:auth content:token title:sdk')

    expect(parsed.modifiers.content).toEqual(['auth', 'token'])
    expect(parsed.modifiers.title).toEqual(['sdk'])
  })

  it('extracts OXO-59 exact entity and metadata facets', () => {
    const parsed = parseSessionSearchQuery(
      'file:contracts.ts command:"pnpm test" issue:OXO-59 error:ResizeObserver source:file_snapshot model:opus reasoning:high transport:artifacts favorite:true',
    )

    expect(parsed.freeText).toBe('')
    expect(parsed.modifiers).toMatchObject({
      command: ['pnpm test'],
      error: ['resizeobserver'],
      favorite: ['true'],
      file: ['contracts.ts'],
      issue: ['oxo-59'],
      model: ['opus'],
      reasoning: ['high'],
      source: ['file_snapshot'],
      transport: ['artifacts'],
    })
  })
})
