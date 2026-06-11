import { describe, expect, it } from 'vitest'

import type { SessionSearchMatch } from '../../../../../../shared/ipc/contracts'
import type { SessionPreview } from '../../../sessions/session.model'
import {
  buildSearchQuery,
  classifyReason,
  countItemsByScope,
  createBrowseItems,
  createItemsFromMatches,
  extractCompletedOperatorChips,
  filterResultItems,
  isWithinDatePreset,
  shortenWorkspacePath,
} from '../full-page-search.helpers'

function createSession(overrides: Partial<SessionPreview> & Pick<SessionPreview, 'id'>) {
  return {
    id: overrides.id,
    title: overrides.title ?? 'Searchable session',
    projectKey: overrides.projectKey ?? 'project-alpha',
    projectLabel: overrides.projectLabel ?? 'project-alpha',
    projectWorkspacePath: overrides.projectWorkspacePath ?? '/tmp/project-alpha',
    parentSessionId: null,
    derivationType: null,
    hasUserMessage: true,
    status: overrides.status ?? 'completed',
    transport: overrides.transport ?? 'artifacts',
    createdAt: overrides.createdAt ?? '2026-06-10T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-10T12:10:00.000Z',
    lastActivityAt: overrides.lastActivityAt ?? '2026-06-10T12:10:00.000Z',
    lastActivityTimestamp: Date.parse(overrides.lastActivityAt ?? '2026-06-10T12:10:00.000Z'),
  } satisfies SessionPreview
}

describe('extractCompletedOperatorChips', () => {
  it('extracts completed modifier tokens followed by whitespace into chips', () => {
    const { chips, text } = extractCompletedOperatorChips('tool:Execute project:oxox daemon trans')

    expect(chips).toEqual([
      { key: 'tool', value: 'Execute' },
      { key: 'project', value: 'oxox' },
    ])
    expect(text).toBe('daemon trans')
  })

  it('keeps an in-progress trailing operator token as editable text', () => {
    const { chips, text } = extractCompletedOperatorChips('daemon tool:Exec')

    expect(chips).toEqual([])
    expect(text).toBe('daemon tool:Exec')
  })

  it('ignores unknown operator prefixes', () => {
    const { chips, text } = extractCompletedOperatorChips('has:error transport failed')

    expect(chips).toEqual([])
    expect(text).toBe('has:error transport failed')
  })

  it('supports quoted multi-word operator values', () => {
    const { chips, text } = extractCompletedOperatorChips('file:"daemon transport.ts" failure')

    expect(chips).toEqual([{ key: 'file', value: 'daemon transport.ts' }])
    expect(text).toBe('failure')
  })
})

describe('buildSearchQuery', () => {
  it('serializes chips before free text and quotes values with spaces', () => {
    const query = buildSearchQuery(
      [
        { key: 'tool', value: 'Execute' },
        { key: 'file', value: 'daemon transport.ts' },
      ],
      'has failure',
    )

    expect(query).toBe('tool:Execute file:"daemon transport.ts" has failure')
  })

  it('returns trimmed free text when no chips are present', () => {
    expect(buildSearchQuery([], '  daemon  ')).toBe('daemon')
  })
})

describe('shortenWorkspacePath', () => {
  it('replaces the home directory with ~ and abbreviates middle segments', () => {
    expect(shortenWorkspacePath('/Users/brojbean/code/personal-projects/oxox')).toBe(
      '~/code/persona…/oxox',
    )
  })

  it('keeps short segments and the final segment intact', () => {
    expect(shortenWorkspacePath('/tmp/oxox')).toBe('/tmp/oxox')
    expect(shortenWorkspacePath('/home/user/dev/very-long-project-name')).toBe(
      '~/dev/very-long-project-name',
    )
  })
})

describe('classifyReason', () => {
  it('maps source kinds onto search scopes', () => {
    expect(classifyReason(undefined)).toBe('session')
    expect(classifyReason({ field: 'content', snippet: '', sourceKind: 'block' })).toBe('message')
    expect(classifyReason({ field: 'tool', snippet: '', sourceKind: 'tool_call' })).toBe('tool')
    expect(classifyReason({ field: 'tool', snippet: '', sourceKind: 'tool_result' })).toBe('tool')
    expect(classifyReason({ field: 'file', snippet: '', sourceKind: 'file_snapshot' })).toBe('file')
    expect(classifyReason({ field: 'content', snippet: '', sourceKind: 'compaction' })).toBe(
      'summary',
    )
    expect(classifyReason({ field: 'content', snippet: '', sourceKind: 'todo' })).toBe('todo')
    expect(classifyReason({ field: 'content', snippet: '', sourceKind: 'settings' })).toBe('detail')
  })
})

describe('isWithinDatePreset', () => {
  const now = Date.parse('2026-06-11T12:00:00.000Z')

  it('accepts everything for the any preset and missing timestamps', () => {
    expect(isWithinDatePreset('2020-01-01T00:00:00.000Z', 'any', now)).toBe(true)
    expect(isWithinDatePreset(null, '7d', now)).toBe(true)
  })

  it('filters by rolling windows', () => {
    expect(isWithinDatePreset('2026-06-11T01:00:00.000Z', '24h', now)).toBe(true)
    expect(isWithinDatePreset('2026-06-09T12:00:00.000Z', '24h', now)).toBe(false)
    expect(isWithinDatePreset('2026-06-05T12:00:00.000Z', '7d', now)).toBe(true)
    expect(isWithinDatePreset('2026-06-01T12:00:00.000Z', '7d', now)).toBe(false)
    expect(isWithinDatePreset('2026-05-20T12:00:00.000Z', '30d', now)).toBe(true)
  })
})

describe('result items', () => {
  const matches: SessionSearchMatch[] = [
    {
      sessionId: 'message-session',
      score: 80,
      reasons: [
        {
          field: 'content',
          snippet: 'daemon transport failed',
          sourceKind: 'block',
          sourceId: 'message-1:0',
          messageId: 'message-1',
        },
      ],
    },
    {
      sessionId: 'tool-session',
      score: 50,
      reasons: [
        {
          field: 'tool',
          snippet: 'Execute pnpm test',
          sourceKind: 'tool_call',
          sourceId: 'tool-1',
          toolCallId: 'tool-1',
        },
      ],
    },
  ]

  const sessions = [
    createSession({ id: 'message-session', title: 'Transport debug', status: 'active' }),
    createSession({ id: 'tool-session', title: 'Test run' }),
  ]

  it('creates typed items with jump targets and falls back for unknown sessions', () => {
    const items = createItemsFromMatches(matches, [sessions[0]])

    expect(items).toHaveLength(2)
    const messageItem = items.find((item) => item.type === 'message')
    expect(messageItem?.session.title).toBe('Transport debug')
    expect(messageItem?.target).toEqual({
      messageId: 'message-1',
      sessionId: 'message-session',
      sourceId: 'message-1:0',
      sourceKind: 'block',
      toolCallId: undefined,
    })

    const toolItem = items.find((item) => item.type === 'tool')
    expect(toolItem?.session.id).toBe('tool-session')
    expect(toolItem?.session.projectLabel).toBe('Indexed search results')
  })

  it('filters by scope, status, project, source, and date preset', () => {
    const items = createItemsFromMatches(matches, sessions)

    expect(filterResultItems(items, { scope: 'tool' })).toHaveLength(1)
    expect(filterResultItems(items, { scope: 'all', statuses: ['active'] })).toHaveLength(1)
    expect(filterResultItems(items, { scope: 'all', projects: ['missing'] })).toHaveLength(0)
    expect(filterResultItems(items, { scope: 'all', sources: ['tool_call'] })).toHaveLength(1)
  })

  it('counts items per scope including the all scope', () => {
    const counts = countItemsByScope(createItemsFromMatches(matches, sessions))

    expect(counts.all).toBe(2)
    expect(counts.message).toBe(1)
    expect(counts.tool).toBe(1)
    expect(counts.session).toBe(0)
  })

  it('creates recency-sorted browse items', () => {
    const browse = createBrowseItems([
      createSession({ id: 'old', lastActivityAt: '2026-06-01T00:00:00.000Z' }),
      createSession({ id: 'new', lastActivityAt: '2026-06-11T00:00:00.000Z' }),
    ])

    expect(browse.map((item) => item.session.id)).toEqual(['new', 'old'])
    expect(browse.every((item) => item.type === 'session')).toBe(true)
  })
})
