import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionSearchResponse } from '../../../../../../shared/ipc/contracts'
import type { SessionPreview } from '../../../sessions/session.model'
import { FullPageSearchController } from '../full-page-search.model'

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

function createSearchGateway(matchesBySessionId: Record<string, string>) {
  return vi.fn(async (request: { query: string }) => {
    const response: SessionSearchResponse = {
      query: request.query,
      matches: Object.entries(matchesBySessionId).map(([sessionId, snippet], index) => ({
        sessionId,
        score: 90 - index,
        reasons: [
          {
            field: 'content',
            snippet,
            sourceKind: 'block' as const,
            sourceId: `message-${index}:0`,
            messageId: `message-${index}`,
          },
        ],
      })),
    }

    return response
  })
}

describe('FullPageSearchController', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('extracts completed operator tokens into chips and keeps free text editable', () => {
    const controller = new FullPageSearchController()

    controller.setInputText('tool:Execute daemon')

    const vm = controller.buildViewModel([])
    expect(vm.chips).toEqual([{ id: 'chip-1', key: 'tool', value: 'Execute' }])
    expect(vm.inputText).toBe('daemon')
    expect(vm.query).toBe('tool:Execute daemon')
  })

  it('removes chips and rebuilds the query', () => {
    const controller = new FullPageSearchController()
    controller.setInputText('tool:Execute daemon')

    controller.removeChip('chip-1')

    const vm = controller.buildViewModel([])
    expect(vm.chips).toEqual([])
    expect(vm.query).toBe('daemon')
  })

  it('removeLastChip pops the most recent chip', () => {
    const controller = new FullPageSearchController()
    controller.setInputText('tool:Execute project:oxox ')

    const removed = controller.removeLastChip()

    expect(removed?.key).toBe('project')
    expect(controller.buildViewModel([]).chips.map((chip) => chip.key)).toEqual(['tool'])
  })

  it('debounces searches and only issues IPC for the latest query', async () => {
    vi.useFakeTimers()
    const searchSessions = createSearchGateway({ 'session-1': 'daemon transport' })
    const controller = new FullPageSearchController(searchSessions, { debounceMs: 100 })

    controller.setInputText('d')
    controller.setInputText('da')
    controller.setInputText('daemon')

    expect(searchSessions).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)

    expect(searchSessions).toHaveBeenCalledTimes(1)
    expect(searchSessions).toHaveBeenCalledWith({ limit: 80, query: 'daemon' })

    const vm = controller.buildViewModel([createSession({ id: 'session-1' })])
    expect(vm.visibleItems).toHaveLength(1)
    expect(vm.hasSearched).toBe(true)
  })

  it('flushPendingSearch runs the scheduled search immediately', async () => {
    vi.useFakeTimers()
    const searchSessions = createSearchGateway({ 'session-1': 'daemon transport' })
    const controller = new FullPageSearchController(searchSessions, { debounceMs: 1_000 })

    controller.setInputText('daemon')
    expect(controller.flushPendingSearch()).toBe(true)
    await vi.advanceTimersByTimeAsync(0)

    expect(searchSessions).toHaveBeenCalledTimes(1)
    expect(controller.flushPendingSearch()).toBe(false)
  })

  it('clears matches without IPC when the query becomes empty', async () => {
    vi.useFakeTimers()
    const searchSessions = vi.fn()
    const controller = new FullPageSearchController(searchSessions, { debounceMs: 50 })
    controller.state$.matches.set([{ sessionId: 'stale', score: 1, reasons: [] }])

    controller.setInputText('')
    await vi.advanceTimersByTimeAsync(50)

    expect(searchSessions).not.toHaveBeenCalled()
    expect(controller.buildViewModel([]).visibleItems).toEqual([])
  })

  it('ignores stale responses from superseded queries', async () => {
    vi.useFakeTimers()
    let resolveSlow: () => void = () => undefined
    const searchSessions = vi.fn((request: { query: string }) => {
      if (request.query === 'slow') {
        return new Promise<SessionSearchResponse>((resolve) => {
          resolveSlow = () =>
            resolve({
              query: 'slow',
              matches: [{ sessionId: 'slow-session', score: 1, reasons: [] }],
            })
        })
      }

      return Promise.resolve({
        query: request.query,
        matches: [{ sessionId: 'fast-session', score: 2, reasons: [] }],
      })
    })
    const controller = new FullPageSearchController(searchSessions, { debounceMs: 10 })

    controller.setInputText('slow')
    await vi.advanceTimersByTimeAsync(10)
    controller.setInputText('fast')
    await vi.advanceTimersByTimeAsync(10)
    resolveSlow()
    await vi.advanceTimersByTimeAsync(0)

    expect(controller.state$.matches.get().map((match) => match.sessionId)).toEqual([
      'fast-session',
    ])
  })

  it('reports a friendly error when the search bridge is unavailable', async () => {
    vi.useFakeTimers()
    const controller = new FullPageSearchController(undefined, { debounceMs: 10 })

    controller.setInputText('daemon')
    await vi.advanceTimersByTimeAsync(10)

    expect(controller.buildViewModel([]).error).toBe('Search bridge unavailable.')
  })

  it('buildViewModel renders nothing without a query or browse filters', () => {
    const controller = new FullPageSearchController()
    const sessions = Array.from({ length: 50 }, (_, index) =>
      createSession({ id: `session-${index}` }),
    )

    const vm = controller.buildViewModel(sessions)

    expect(vm.visibleItems).toEqual([])
    expect(vm.showEmptyState).toBe(true)
  })

  it('buildViewModel browses sessions when status filters are active without a query', () => {
    const controller = new FullPageSearchController()
    const sessions = [
      createSession({ id: 'active-session', status: 'active' }),
      createSession({ id: 'completed-session', status: 'completed' }),
    ]

    controller.toggleStatus('active')

    const vm = controller.buildViewModel(sessions)
    expect(vm.visibleItems.map((item) => item.session.id)).toEqual(['active-session'])

    controller.toggleStatus('active')
    expect(controller.buildViewModel(sessions).visibleItems).toEqual([])
  })

  it('buildViewModel scopes visible items and exposes counts across all scopes', async () => {
    vi.useFakeTimers()
    const searchSessions = vi.fn(async (request: { query: string }) => ({
      query: request.query,
      matches: [
        {
          sessionId: 'message-session',
          score: 91,
          reasons: [
            {
              field: 'content',
              snippet: 'a message hit',
              sourceKind: 'block' as const,
              sourceId: 'message-1:0',
              messageId: 'message-1',
            },
          ],
        },
        {
          sessionId: 'tool-session',
          score: 64,
          reasons: [
            {
              field: 'tool',
              snippet: 'a tool hit',
              sourceKind: 'tool_call' as const,
              sourceId: 'tool-1',
              toolCallId: 'tool-1',
            },
          ],
        },
      ],
    }))
    const controller = new FullPageSearchController(searchSessions, { debounceMs: 10 })
    const sessions = [
      createSession({ id: 'message-session' }),
      createSession({ id: 'tool-session' }),
    ]

    controller.setInputText('hit')
    await vi.advanceTimersByTimeAsync(10)

    const allVm = controller.buildViewModel(sessions)
    expect(allVm.scopeCounts.message).toBe(1)
    expect(allVm.scopeCounts.tool).toBe(1)

    controller.setScope('tool')
    const toolVm = controller.buildViewModel(sessions)
    expect(toolVm.visibleItems.map((item) => item.type)).toEqual(['tool'])
  })

  it('moveSelection clamps to bounds and selects the next item', async () => {
    vi.useFakeTimers()
    const searchSessions = createSearchGateway({
      'session-1': 'first match',
      'session-2': 'second match',
    })
    const controller = new FullPageSearchController(searchSessions, { debounceMs: 10 })
    const sessions = [createSession({ id: 'session-1' }), createSession({ id: 'session-2' })]

    controller.setInputText('match')
    await vi.advanceTimersByTimeAsync(10)

    const vm = controller.buildViewModel(sessions)
    expect(vm.selectedItem?.session.id).toBe('session-1')

    const next = controller.moveSelection(vm.visibleItems, 1)
    expect(next?.session.id).toBe('session-2')

    const clamped = controller.moveSelection(vm.visibleItems, 5)
    expect(clamped?.session.id).toBe('session-2')

    const back = controller.moveSelection(vm.visibleItems, -1)
    expect(back?.session.id).toBe('session-1')
  })

  it('prefers the hovered preview item for the inspector', async () => {
    vi.useFakeTimers()
    const searchSessions = createSearchGateway({
      'session-1': 'first match',
      'session-2': 'second match',
    })
    const controller = new FullPageSearchController(searchSessions, { debounceMs: 10 })
    const sessions = [createSession({ id: 'session-1' }), createSession({ id: 'session-2' })]

    controller.setInputText('match')
    await vi.advanceTimersByTimeAsync(10)

    const vm = controller.buildViewModel(sessions)
    const hovered = vm.visibleItems.find((item) => item.session.id === 'session-2')
    controller.previewItem(hovered?.id ?? null)

    expect(controller.buildViewModel(sessions).inspectorItem?.session.id).toBe('session-2')

    controller.previewItem(null)
    expect(controller.buildViewModel(sessions).inspectorItem?.session.id).toBe('session-1')
  })

  it('filters project options through the project search query', () => {
    const controller = new FullPageSearchController()
    const sessions = [
      createSession({
        id: 'session-1',
        projectLabel: 'oxox',
        projectWorkspacePath: '/Users/me/code/oxox',
      }),
      createSession({
        id: 'session-2',
        projectLabel: 'droid-sdk',
        projectWorkspacePath: '/Users/me/code/droid-sdk-typescript',
      }),
    ]

    expect(controller.buildViewModel(sessions).projects.map((p) => p.label)).toEqual([
      'oxox',
      'droid-sdk',
    ])

    controller.setProjectSearchQuery('sdk')
    expect(controller.buildViewModel(sessions).projects.map((p) => p.label)).toEqual(['droid-sdk'])

    controller.setProjectSearchQuery('typescript')
    expect(controller.buildViewModel(sessions).projects.map((p) => p.label)).toEqual(['droid-sdk'])
  })
})
