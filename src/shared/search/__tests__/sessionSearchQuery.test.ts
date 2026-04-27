import { describe, expect, it } from 'vitest'

import { parseSessionSearchQuery } from '../sessionSearchQuery'

describe('parseSessionSearchQuery', () => {
  it('extracts normalized free-text terms', () => {
    const parsed = parseSessionSearchQuery('  SDK auth   flow  ')

    expect(parsed.freeText).toBe('sdk auth flow')
    expect(parsed.terms).toEqual(['sdk', 'auth', 'flow'])
    expect(parsed.modifiers).toEqual({})
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
})
