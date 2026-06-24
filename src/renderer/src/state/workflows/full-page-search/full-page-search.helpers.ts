import type {
  SessionSearchHit,
  SessionSearchMatch,
  SessionSearchReason,
  SessionSearchTarget,
} from '../../../../../shared/ipc/contracts'
import type { SessionPreview } from '../../sessions/session.model'

export type SearchScope =
  | 'all'
  | 'session'
  | 'message'
  | 'user-message'
  | 'assistant-message'
  | 'tool'
  | 'file'
  | 'summary'
  | 'todo'
export type ResultType = Exclude<SearchScope, 'all'> | 'detail'
export type DatePreset = 'any' | '24h' | '7d' | '30d'

export interface OperatorChip {
  key: string
  value: string
}

export interface SearchResultItem {
  id: string
  type: ResultType
  session: SessionPreview
  score: number
  recencyScore: number
  reason?: SessionSearchReason
  target?: SessionSearchTarget
}

export const SEARCH_SCOPES: Array<{ id: SearchScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'session', label: 'Sessions' },
  { id: 'message', label: 'Messages' },
  { id: 'user-message', label: 'User messages' },
  { id: 'assistant-message', label: 'Assistant messages' },
  { id: 'tool', label: 'Tools' },
  { id: 'file', label: 'Files' },
  { id: 'summary', label: 'Summaries' },
  { id: 'todo', label: 'Todos' },
]

export const RESULT_TYPE_LABELS: Record<ResultType, string> = {
  session: 'Sessions',
  message: 'Messages',
  'user-message': 'User messages',
  'assistant-message': 'Assistant messages',
  tool: 'Tools',
  file: 'Files',
  summary: 'Summaries',
  todo: 'Todos',
  detail: 'Details',
}

export const OPERATOR_SUGGESTIONS: Array<{ key: string; hint: string; example: string }> = [
  { key: 'tool', hint: 'Executed tool names', example: 'tool:Execute' },
  { key: 'project', hint: 'Project label or key', example: 'project:oxox' },
  { key: 'file', hint: 'Workspace paths and file mentions', example: 'file:contracts.ts' },
  { key: 'command', hint: 'Shell commands and scripts', example: 'command:pnpm' },
  { key: 'status', hint: 'Session status', example: 'status:active' },
  { key: 'error', hint: 'Failures and stack traces', example: 'error:timeout' },
  { key: 'issue', hint: 'Linear/GitHub issue keys', example: 'issue:OXO-59' },
  { key: 'title', hint: 'Session titles', example: 'title:search' },
  { key: 'content', hint: 'Transcript text', example: 'content:daemon' },
  { key: 'model', hint: 'Model metadata', example: 'model:claude' },
  { key: 'source', hint: 'Result source kind', example: 'source:tool_call' },
  { key: 'transport', hint: 'Session transport', example: 'transport:daemon' },
]

const OPERATOR_KEYS = new Set([
  'title',
  'content',
  'project',
  'path',
  'status',
  'id',
  'tool',
  'source',
  'kind',
  'file',
  'command',
  'issue',
  'error',
  'model',
  'reasoning',
  'transport',
  'favorite',
  'extension',
])

export const SOURCE_FILTERS = [
  { id: 'block', label: 'Message blocks' },
  { id: 'tool_call', label: 'Tool calls' },
  { id: 'tool_result', label: 'Tool results' },
  { id: 'file_snapshot', label: 'Snapshots' },
  { id: 'settings', label: 'Settings' },
  { id: 'todo', label: 'Todos' },
  { id: 'compaction', label: 'Compactions' },
] as const

export const STATUS_FILTERS = ['active', 'waiting', 'completed', 'error', 'orphaned'] as const

export const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'any', label: 'Any time' },
  { id: '24h', label: 'Last 24 hours' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
]

const DATE_PRESET_WINDOW_MS: Record<Exclude<DatePreset, 'any'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

export const MAX_RENDERED_RESULTS = 500

/**
 * Shortens a workspace path Raycast-style: home dir becomes `~`, middle
 * segments are abbreviated with an ellipsis, the last segment stays intact.
 */
export function shortenWorkspacePath(path: string, maxSegmentLength = 7): string {
  const homeMatch = path.match(/^\/(?:Users|home)\/[^/]+/u)
  const prefix = homeMatch ? '~' : ''
  const remainder = homeMatch ? path.slice(homeMatch[0].length) : path
  const segments = remainder.split('/').filter(Boolean)

  if (segments.length === 0) {
    return prefix || path
  }

  const shortened = segments.map((segment, index) =>
    index === segments.length - 1 || segment.length <= maxSegmentLength
      ? segment
      : `${segment.slice(0, maxSegmentLength)}…`,
  )

  return `${prefix}/${shortened.join('/')}`
}

/**
 * Pulls completed `key:value ` operator tokens out of the raw input so they can
 * render as removable chips. A trailing token without whitespace after it stays
 * editable text.
 */
export function extractCompletedOperatorChips(rawInput: string): {
  chips: OperatorChip[]
  text: string
} {
  const chips: OperatorChip[] = []
  const remainder: string[] = []
  const pattern = /(\S+):(?:"([^"]*)"|(\S+))(\s+)/gu
  let lastIndex = 0

  for (const match of rawInput.matchAll(pattern)) {
    const [whole, key, quotedValue, bareValue] = match
    const value = quotedValue ?? bareValue ?? ''

    if (!OPERATOR_KEYS.has(key.toLowerCase()) || !value) {
      continue
    }

    remainder.push(rawInput.slice(lastIndex, match.index))
    lastIndex = match.index + whole.length
    chips.push({ key: key.toLowerCase(), value })
  }

  remainder.push(rawInput.slice(lastIndex))

  return {
    chips,
    text: remainder.join(' ').replace(/\s+/gu, ' ').trim(),
  }
}

export function buildSearchQuery(chips: OperatorChip[], freeText: string): string {
  const chipTokens = chips.map(
    (chip) => `${chip.key}:${/\s/u.test(chip.value) ? `"${chip.value}"` : chip.value}`,
  )

  return [...chipTokens, freeText.trim()].filter(Boolean).join(' ')
}

export function classifyReason(reason?: SessionSearchReason): ResultType {
  switch (reason?.sourceKind) {
    case 'block':
      if (reason.role === 'user') {
        return 'user-message'
      }

      if (reason.role === 'assistant') {
        return 'assistant-message'
      }

      return 'message'
    case 'tool_call':
    case 'tool_result':
      return 'tool'
    case 'file_snapshot':
      return 'file'
    case 'compaction':
      return 'summary'
    case 'todo':
      return 'todo'
    case 'settings':
      return 'detail'
    case 'session':
    case undefined:
      return 'session'
  }
}

export function isWithinDatePreset(
  value: string | null | undefined,
  preset: DatePreset,
  now = Date.now(),
): boolean {
  if (preset === 'any') {
    return true
  }

  if (!value) {
    return true
  }

  const timestamp = Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return true
  }

  return now - timestamp <= DATE_PRESET_WINDOW_MS[preset]
}

export function createItemsFromMatches(
  matches: SessionSearchMatch[],
  sessions: SessionPreview[],
): SearchResultItem[] {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]))
  const items: SearchResultItem[] = []

  for (const match of matches) {
    const session = sessionsById.get(match.sessionId) ?? createFallbackSessionPreview(match)
    const reasons = match.reasons.length > 0 ? match.reasons : [undefined]

    for (const reason of reasons) {
      const recencyScore = calculateRecencyScore(session)
      items.push({
        id: `${match.sessionId}:${reason?.sourceKind ?? 'session'}:${reason?.sourceId ?? reason?.field ?? 'metadata'}`,
        reason,
        recencyScore,
        score: match.score + recencyScore,
        session,
        target: createTarget(match.sessionId, reason),
        type: classifyReason(reason),
      })
    }
  }

  return uniqueItems(items).sort(sortItems)
}

export function createItemsFromHits(
  hits: SessionSearchHit[],
  sessions: SessionPreview[],
): SearchResultItem[] {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]))

  return uniqueItems(
    hits.map((hit) => {
      const session = sessionsById.get(hit.sessionId) ?? createFallbackSessionPreview(hit)
      const recencyScore = calculateRecencyScore(session)

      return {
        id: hit.id,
        reason: hit.reason,
        recencyScore,
        score: hit.score + recencyScore,
        session,
        target: createTarget(hit.sessionId, hit.reason),
        type: classifyReason(hit.reason),
      }
    }),
  )
}

export function createBrowseItems(sessions: SessionPreview[]): SearchResultItem[] {
  return sessions
    .map((session) => {
      const recencyScore = calculateRecencyScore(session)

      return {
        id: `${session.id}:session:browse`,
        recencyScore,
        score: recencyScore,
        session,
        type: 'session' as const,
      }
    })
    .sort(sortItems)
}

export interface ResultFilters {
  scope: SearchScope
  statuses?: string[]
  projects?: string[]
  sources?: string[]
  datePreset?: DatePreset
}

export function filterResultItems(
  items: SearchResultItem[],
  filters: ResultFilters,
): SearchResultItem[] {
  return items.filter((item) => {
    if (filters.scope !== 'all' && !itemMatchesScope(item, filters.scope)) {
      return false
    }

    if (
      filters.statuses &&
      filters.statuses.length > 0 &&
      !filters.statuses.includes(item.session.status)
    ) {
      return false
    }

    if (
      filters.projects &&
      filters.projects.length > 0 &&
      !filters.projects.includes(item.session.projectLabel)
    ) {
      return false
    }

    if (
      filters.sources &&
      filters.sources.length > 0 &&
      (!item.reason?.sourceKind || !filters.sources.includes(item.reason.sourceKind))
    ) {
      return false
    }

    return isWithinDatePreset(
      item.session.lastActivityAt ?? item.session.updatedAt,
      filters.datePreset ?? 'any',
    )
  })
}

export function countItemsByScope(items: SearchResultItem[]): Record<SearchScope, number> {
  const counts: Record<SearchScope, number> = {
    all: items.length,
    session: 0,
    message: 0,
    'user-message': 0,
    'assistant-message': 0,
    tool: 0,
    file: 0,
    summary: 0,
    todo: 0,
  }

  for (const item of items) {
    if (item.type === 'detail') {
      continue
    }

    counts[item.type] += 1

    if (isMessageResultType(item.type) && item.type !== 'message') {
      counts.message += 1
    }
  }

  return counts
}

function itemMatchesScope(item: SearchResultItem, scope: SearchScope): boolean {
  return scope === 'message' ? isMessageResultType(item.type) : item.type === scope
}

function isMessageResultType(type: ResultType): boolean {
  return type === 'message' || type === 'user-message' || type === 'assistant-message'
}

function createFallbackSessionPreview(match: { sessionId: string }): SessionPreview {
  const now = new Date().toISOString()

  return {
    id: match.sessionId,
    title: match.sessionId,
    projectKey: 'indexed-search-results',
    projectLabel: 'Indexed search results',
    projectWorkspacePath: null,
    parentSessionId: null,
    derivationType: null,
    hasUserMessage: true,
    status: 'completed',
    transport: 'indexed',
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    lastActivityTimestamp: Date.parse(now),
  }
}

function createTarget(
  sessionId: string,
  reason?: SessionSearchReason,
): SessionSearchTarget | undefined {
  if (!reason?.sourceKind || !reason.sourceId) {
    return undefined
  }

  return {
    messageId: reason.messageId,
    sessionId,
    sourceId: reason.sourceId,
    sourceKind: reason.sourceKind,
    toolCallId: reason.toolCallId,
  }
}

function calculateRecencyScore(session: SessionPreview): number {
  const timestamp = Date.parse(session.lastActivityAt ?? session.updatedAt)

  if (!Number.isFinite(timestamp)) {
    return 0
  }

  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000)
  return 35 / (1 + ageDays)
}

function sortItems(left: SearchResultItem, right: SearchResultItem): number {
  return (
    right.score - left.score ||
    right.session.lastActivityTimestamp - left.session.lastActivityTimestamp
  )
}

function uniqueItems(items: SearchResultItem[]): SearchResultItem[] {
  const byId = new Map<string, SearchResultItem>()

  for (const item of items) {
    const existing = byId.get(item.id)

    if (!existing || item.score > existing.score) {
      byId.set(item.id, item)
    }
  }

  return [...byId.values()]
}
