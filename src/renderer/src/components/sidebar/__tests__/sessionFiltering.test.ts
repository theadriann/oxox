import type { ProjectSessionGroup, SessionPreview } from '../../../stores/SessionStore'
import { DEFAULT_SIDEBAR_FILTERS, filterSessionGroups, parseMetaQuery } from '../sessionFiltering'

function createSession(overrides: Partial<SessionPreview>): SessionPreview {
  return {
    id: 'session-default',
    title: 'Default session',
    projectKey: 'project-default',
    projectLabel: 'project-default',
    projectWorkspacePath: '/tmp/project-default',
    status: 'active',
    createdAt: '2026-03-24T23:00:00.000Z',
    updatedAt: '2026-03-25T00:00:00.000Z',
    lastActivityAt: '2026-03-25T00:00:00.000Z',
    lastActivityTimestamp: Date.parse('2026-03-25T00:00:00.000Z'),
    ...overrides,
  }
}

function createGroup(key: string, sessions: SessionPreview[]): ProjectSessionGroup {
  return {
    key,
    label: key,
    workspacePath: `/tmp/${key}`,
    latestActivityAt: Math.max(...sessions.map((session) => session.lastActivityTimestamp)),
    sessions,
  }
}

describe('filterSessionGroups', () => {
  it('supports fuzzy matching and ranks the strongest title match first', () => {
    const designFactoryAudit = createSession({
      id: 'session-dfa',
      projectKey: 'project-alpha',
      projectLabel: 'project-alpha',
      title: 'Design Factory Audit',
      projectWorkspacePath: '/tmp/project-alpha',
    })
    const backlogReview = createSession({
      id: 'session-backlog',
      projectKey: 'project-alpha',
      projectLabel: 'project-alpha',
      title: 'Backlog Review',
      projectWorkspacePath: '/tmp/project-alpha',
    })
    const groups = [createGroup('project-alpha', [backlogReview, designFactoryAudit])]

    const fuzzyResult = filterSessionGroups(groups, [], {
      ...DEFAULT_SIDEBAR_FILTERS,
      query: 'dfa',
    })

    expect(fuzzyResult.groups[0]?.sessions.map((session) => session.id)).toEqual(['session-dfa'])

    const outOfOrderTermResult = filterSessionGroups(groups, [], {
      ...DEFAULT_SIDEBAR_FILTERS,
      query: 'audit design',
    })

    expect(outOfOrderTermResult.groups[0]?.sessions.map((session) => session.id)).toEqual([
      'session-dfa',
    ])
    expect(outOfOrderTermResult.activeFilterCount).toBe(1)
  })

  it('composes project, date range, status, and tags with AND logic', () => {
    const now = Date.parse('2026-03-25T00:00:00.000Z')
    const replayAudit = createSession({
      id: 'session-replay-audit',
      projectKey: 'project-alpha',
      projectLabel: 'project-alpha',
      title: 'Replay Audit',
      status: 'active',
      lastActivityTimestamp: Date.parse('2026-03-24T18:00:00.000Z'),
      lastActivityAt: '2026-03-24T18:00:00.000Z',
    })
    const replayCompleted = createSession({
      id: 'session-replay-completed',
      projectKey: 'project-alpha',
      projectLabel: 'project-alpha',
      title: 'Replay Summary',
      status: 'completed',
      lastActivityTimestamp: Date.parse('2026-03-24T18:00:00.000Z'),
      lastActivityAt: '2026-03-24T18:00:00.000Z',
    })
    const betaReplay = createSession({
      id: 'session-beta-replay',
      projectKey: 'project-beta',
      projectLabel: 'project-beta',
      title: 'Replay Audit',
      status: 'active',
      lastActivityTimestamp: Date.parse('2026-03-24T18:00:00.000Z'),
      lastActivityAt: '2026-03-24T18:00:00.000Z',
    })
    const alphaOld = createSession({
      id: 'session-alpha-old',
      projectKey: 'project-alpha',
      projectLabel: 'project-alpha',
      title: 'Replay Audit',
      status: 'active',
      lastActivityTimestamp: Date.parse('2026-02-01T18:00:00.000Z'),
      lastActivityAt: '2026-02-01T18:00:00.000Z',
    })

    const groups = [
      createGroup('project-alpha', [replayAudit, replayCompleted, alphaOld]),
      createGroup('project-beta', [betaReplay]),
    ]

    const result = filterSessionGroups(
      groups,
      [replayAudit, replayCompleted],
      {
        ...DEFAULT_SIDEBAR_FILTERS,
        projectKey: 'project-alpha',
        dateRange: '7d',
        status: 'active',
        tags: ['replay'],
      },
      now,
    )

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.sessions.map((session) => session.id)).toEqual([
      'session-replay-audit',
    ])
    expect(result.pinnedSessions.map((session) => session.id)).toEqual(['session-replay-audit'])
    expect(result.activeFilterCount).toBe(4)
  })

  it('uses main-process search result IDs and ordering while preserving sidebar filters', () => {
    const activeMatch = createSession({
      id: 'active-match',
      title: 'Local title that does not contain the query',
      projectKey: 'project-alpha',
      projectLabel: 'project-alpha',
      status: 'active',
    })
    const completedMatch = createSession({
      id: 'completed-match',
      title: 'Another local title',
      projectKey: 'project-alpha',
      projectLabel: 'project-alpha',
      status: 'completed',
    })
    const activeSecond = createSession({
      id: 'active-second',
      title: 'Second local title',
      projectKey: 'project-alpha',
      projectLabel: 'project-alpha',
      status: 'active',
    })
    const groups = [createGroup('project-alpha', [activeSecond, activeMatch, completedMatch])]

    const result = filterSessionGroups(
      groups,
      [],
      {
        ...DEFAULT_SIDEBAR_FILTERS,
        query: 'content:auth',
        status: 'active',
      },
      [
        { sessionId: 'active-match', score: 10, reasons: [] },
        { sessionId: 'completed-match', score: 9, reasons: [] },
        { sessionId: 'active-second', score: 8, reasons: [] },
      ],
    )

    expect(result.groups[0]?.sessions.map((session) => session.id)).toEqual([
      'active-match',
      'active-second',
    ])
  })
})

describe('parseMetaQuery', () => {
  it('extracts unquoted meta prefixes', () => {
    const parsed = parseMetaQuery('title:audit status:active some free text')
    expect(parsed.meta.title).toBe('audit')
    expect(parsed.meta.status).toBe('active')
    expect(parsed.freeText).toBe('some free text')
  })

  it('extracts quoted meta values with spaces', () => {
    const parsed = parseMetaQuery('title:"design audit" project:alpha')
    expect(parsed.meta.title).toBe('design audit')
    expect(parsed.meta.project).toBe('alpha')
    expect(parsed.freeText).toBe('')
  })

  it('returns empty meta for plain text', () => {
    const parsed = parseMetaQuery('hello world')
    expect(Object.keys(parsed.meta)).toHaveLength(0)
    expect(parsed.freeText).toBe('hello world')
  })

  it('handles all supported prefixes', () => {
    const parsed = parseMetaQuery('id:abc path:/tmp tool:grep content:fix project:foo')
    expect(parsed.meta.id).toBe('abc')
    expect(parsed.meta.path).toBe('/tmp')
    expect(parsed.meta.tool).toBe('grep')
    expect(parsed.meta.content).toBe('fix')
    expect(parsed.meta.project).toBe('foo')
    expect(parsed.freeText).toBe('')
  })
})

describe('meta-query filtering', () => {
  it('filters sessions by title: prefix', () => {
    const sessions = [
      createSession({
        id: 's1',
        title: 'Design Factory Audit',
        projectKey: 'p1',
        projectLabel: 'p1',
      }),
      createSession({ id: 's2', title: 'Backlog Review', projectKey: 'p1', projectLabel: 'p1' }),
    ]
    const groups = [createGroup('p1', sessions)]

    const result = filterSessionGroups(groups, [], {
      ...DEFAULT_SIDEBAR_FILTERS,
      query: 'title:audit',
    })

    expect(result.groups[0]?.sessions.map((s) => s.id)).toEqual(['s1'])
  })

  it('filters sessions by project: prefix', () => {
    const s1 = createSession({
      id: 's1',
      title: 'Fix A',
      projectKey: 'alpha',
      projectLabel: 'alpha',
    })
    const s2 = createSession({ id: 's2', title: 'Fix B', projectKey: 'beta', projectLabel: 'beta' })
    const groups = [createGroup('alpha', [s1]), createGroup('beta', [s2])]

    const result = filterSessionGroups(groups, [], {
      ...DEFAULT_SIDEBAR_FILTERS,
      query: 'project:alpha',
    })

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.key).toBe('alpha')
  })

  it('combines meta prefix with free text', () => {
    const sessions = [
      createSession({ id: 's1', title: 'Design Audit', projectKey: 'p1', projectLabel: 'p1' }),
      createSession({ id: 's2', title: 'Design Review', projectKey: 'p1', projectLabel: 'p1' }),
    ]
    const groups = [createGroup('p1', sessions)]

    const result = filterSessionGroups(groups, [], {
      ...DEFAULT_SIDEBAR_FILTERS,
      query: 'title:design audit',
    })

    expect(result.groups[0]?.sessions.map((s) => s.id)).toEqual(['s1'])
  })
})
