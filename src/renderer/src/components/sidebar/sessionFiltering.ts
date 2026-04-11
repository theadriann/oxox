import type {
  ExtendedSessionStatus,
  ProjectSessionGroup,
  SessionPreview,
} from '../../stores/SessionStore'

export type SidebarDateRange = 'all' | '24h' | '7d' | '30d'

export interface SidebarFilters {
  query: string
  projectKey: string
  status: ExtendedSessionStatus | 'all'
  dateRange: SidebarDateRange
  tags: string[]
}

export interface SidebarProjectOption {
  value: string
  label: string
  workspacePath: string | null
}

export interface FilteredSessionGroupsResult {
  groups: ProjectSessionGroup[]
  pinnedSessions: SessionPreview[]
  activeFilterCount: number
  availableProjects: SidebarProjectOption[]
  availableTags: string[]
  hasMatches: boolean
  isFiltering: boolean
}

export const DEFAULT_SIDEBAR_FILTERS: SidebarFilters = {
  query: '',
  projectKey: 'all',
  status: 'all',
  dateRange: 'all',
  tags: [],
}

const TAG_STOP_WORDS = new Set([
  'about',
  'after',
  'build',
  'check',
  'from',
  'into',
  'keep',
  'latest',
  'session',
  'sessions',
  'should',
  'show',
  'that',
  'their',
  'this',
  'with',
  'your',
])

interface RankedSession {
  score: number
  session: SessionPreview
}

interface SearchFields {
  combinedText: string
  initials: string
  pathWords: string[]
  projectWords: string[]
  tagWords: string[]
  titleCompact: string
  titleText: string
  titleWords: string[]
}

export function filterSessionGroups(
  groups: ProjectSessionGroup[],
  pinnedSessions: SessionPreview[],
  filters: SidebarFilters,
  now = Date.now(),
): FilteredSessionGroupsResult {
  const uniqueSessions = dedupeSessions(groups)
  const availableProjects = groups.map((group) => ({
    value: group.key,
    label: group.label,
    workspacePath: group.workspacePath,
  }))
  const availableTags = collectAvailableTags(uniqueSessions)
  const rankedSessions = new Map<string, RankedSession>()
  const parsed = parseMetaQuery(filters.query)
  const hasMeta = Object.keys(parsed.meta).length > 0
  const normalizedQuery = normalize(parsed.freeText)

  for (const session of uniqueSessions) {
    if (!matchesAdvancedFilters(session, filters, now)) {
      continue
    }

    if (hasMeta && !matchesMeta(session, parsed.meta)) {
      continue
    }

    const score = normalizedQuery ? rankSessionForQuery(session, normalizedQuery) : 0

    if (normalizedQuery && score <= 0) {
      continue
    }

    rankedSessions.set(session.id, {
      session,
      score,
    })
  }

  const groupsWithMatches = groups
    .map((group) => {
      const matchingSessions = group.sessions
        .map((session) => rankedSessions.get(session.id))
        .filter((session): session is RankedSession => Boolean(session))
        .sort((left, right) => compareRankedSessions(left, right, Boolean(normalizedQuery)))

      if (matchingSessions.length === 0) {
        return null
      }

      return {
        key: group.key,
        label: group.label,
        workspacePath: group.workspacePath,
        latestActivityAt:
          matchingSessions[0]?.session.lastActivityTimestamp ?? group.latestActivityAt,
        sessions: matchingSessions.map((entry) => entry.session),
        topScore: matchingSessions[0]?.score ?? 0,
      }
    })
    .filter(
      (
        group,
      ): group is ProjectSessionGroup & {
        topScore: number
      } => Boolean(group),
    )
    .sort((left, right) => {
      if (normalizedQuery) {
        return right.topScore - left.topScore || right.latestActivityAt - left.latestActivityAt
      }

      return right.latestActivityAt - left.latestActivityAt
    })
    .map((group) => ({
      key: group.key,
      label: group.label,
      workspacePath: group.workspacePath,
      latestActivityAt: group.latestActivityAt,
      sessions: group.sessions,
    }))

  const rankedPinnedSessions = pinnedSessions
    .map((session) => rankedSessions.get(session.id))
    .filter((session): session is RankedSession => Boolean(session))
    .sort((left, right) => compareRankedSessions(left, right, Boolean(normalizedQuery)))
    .map((entry) => entry.session)

  return {
    groups: groupsWithMatches,
    pinnedSessions: rankedPinnedSessions,
    activeFilterCount: countActiveFilters(filters),
    availableProjects,
    availableTags,
    hasMatches: groupsWithMatches.length > 0 || rankedPinnedSessions.length > 0,
    isFiltering: countActiveFilters(filters) > 0,
  }
}

export function deriveSessionTags(session: SessionPreview): string[] {
  const tokens = tokenize(session.title).filter(
    (token) => token.length >= 3 && !TAG_STOP_WORDS.has(token),
  )

  return Array.from(new Set(tokens)).slice(0, 6)
}

function countActiveFilters(filters: SidebarFilters): number {
  return [
    normalize(filters.query).length > 0,
    filters.projectKey !== 'all',
    filters.status !== 'all',
    filters.dateRange !== 'all',
    filters.tags.length > 0,
  ].filter(Boolean).length
}

function matchesAdvancedFilters(
  session: SessionPreview,
  filters: SidebarFilters,
  now: number,
): boolean {
  if (filters.projectKey !== 'all' && session.projectKey !== filters.projectKey) {
    return false
  }

  if (filters.status !== 'all' && session.status !== filters.status) {
    return false
  }

  if (!matchesDateRange(session, filters.dateRange, now)) {
    return false
  }

  if (filters.tags.length > 0) {
    const sessionTags = deriveSessionTags(session)

    if (!filters.tags.every((tag) => sessionTags.includes(tag))) {
      return false
    }
  }

  return true
}

function matchesDateRange(
  session: SessionPreview,
  dateRange: SidebarDateRange,
  now: number,
): boolean {
  if (dateRange === 'all') {
    return true
  }

  const age = now - session.lastActivityTimestamp

  switch (dateRange) {
    case '24h':
      return age <= 24 * 60 * 60 * 1000
    case '7d':
      return age <= 7 * 24 * 60 * 60 * 1000
    case '30d':
      return age <= 30 * 24 * 60 * 60 * 1000
    default:
      return true
  }
}

const META_PREFIXES = ['title', 'content', 'project', 'path', 'status', 'id', 'tool'] as const
type MetaPrefix = (typeof META_PREFIXES)[number]

export interface ParsedQuery {
  freeText: string
  meta: Partial<Record<MetaPrefix, string>>
}

export function parseMetaQuery(raw: string): ParsedQuery {
  const meta: Partial<Record<MetaPrefix, string>> = {}
  let remaining = raw

  for (const prefix of META_PREFIXES) {
    const regex = new RegExp(`${prefix}:(?:"([^"]*)"|([^\\s]+))`, 'gi')
    remaining = remaining.replace(regex, (_match, quoted, unquoted) => {
      meta[prefix] = (quoted ?? unquoted ?? '').toLowerCase()
      return ''
    })
  }

  return { freeText: remaining.replace(/\s+/g, ' ').trim(), meta }
}

function matchesMeta(session: SessionPreview, meta: ParsedQuery['meta']): boolean {
  if (meta.title && !normalize(session.title).includes(meta.title)) return false
  if (meta.project && !normalize(session.projectLabel).includes(meta.project)) return false
  if (meta.path && !normalize(session.projectWorkspacePath ?? '').includes(meta.path)) return false
  if (meta.status && session.status !== meta.status) return false
  if (meta.id && !session.id.includes(meta.id)) return false
  if (meta.content && !normalize(session.title).includes(meta.content)) return false
  return true
}

function rankSessionForQuery(session: SessionPreview, query: string): number {
  const fields = createSearchFields(session)
  const queryTokens = tokenize(query)

  if (queryTokens.length === 0) {
    return 0
  }

  let totalScore = 0

  for (const token of queryTokens) {
    const tokenScore = rankToken(token, fields)

    if (tokenScore <= 0) {
      return 0
    }

    totalScore += tokenScore
  }

  if (fields.titleText.includes(query)) {
    totalScore += 260 - fields.titleText.indexOf(query) * 4
  } else if (fields.combinedText.includes(query)) {
    totalScore += 180 - fields.combinedText.indexOf(query) * 2
  }

  return totalScore
}

function rankToken(token: string, fields: SearchFields): number {
  const titleWordScore = rankWordList(token, fields.titleWords, 320, 240, 170)
  const tagWordScore = rankWordList(token, fields.tagWords, 230, 180, 130)
  const projectWordScore = rankWordList(token, fields.projectWords, 170, 130, 100)
  const pathWordScore = rankWordList(token, fields.pathWords, 120, 100, 80)
  const initialScore = rankSubsequence(token, fields.initials, 260)
  const titleSubsequenceScore = rankSubsequence(token, fields.titleCompact, 180)
  return Math.max(
    titleWordScore,
    tagWordScore,
    projectWordScore,
    pathWordScore,
    initialScore,
    titleSubsequenceScore,
  )
}

function rankWordList(
  token: string,
  words: string[],
  exactWeight: number,
  prefixWeight: number,
  substringWeight: number,
): number {
  let best = 0

  words.forEach((word, index) => {
    if (word === token) {
      best = Math.max(best, exactWeight - index * 4)
      return
    }

    if (word.startsWith(token)) {
      best = Math.max(best, prefixWeight - index * 3 - (word.length - token.length))
      return
    }

    const substringIndex = word.indexOf(token)

    if (substringIndex >= 0) {
      best = Math.max(best, substringWeight - index * 2 - substringIndex)
    }
  })

  return best
}

function rankSubsequence(token: string, value: string, weight: number): number {
  if (token.length === 0 || value.length === 0) {
    return 0
  }

  let tokenIndex = 0
  let firstMatchIndex = -1
  let lastMatchIndex = -1

  for (let index = 0; index < value.length && tokenIndex < token.length; index += 1) {
    if (value[index] !== token[tokenIndex]) {
      continue
    }

    if (firstMatchIndex === -1) {
      firstMatchIndex = index
    }

    lastMatchIndex = index
    tokenIndex += 1
  }

  if (tokenIndex !== token.length || firstMatchIndex === -1 || lastMatchIndex === -1) {
    return 0
  }

  const span = lastMatchIndex - firstMatchIndex + 1
  const gapPenalty = Math.max(0, span - token.length)

  if (span > Math.max(token.length + 2, token.length * 5)) {
    return 0
  }

  return Math.max(1, weight - firstMatchIndex * 2 - gapPenalty * 8)
}

function createSearchFields(session: SessionPreview): SearchFields {
  const tags = deriveSessionTags(session)
  const titleText = normalize(session.title)
  const projectText = normalize(session.projectLabel)
  const pathText = normalize(session.projectWorkspacePath ?? '')
  const tagText = tags.join(' ')
  const combinedText = [titleText, projectText, pathText, tagText].filter(Boolean).join(' ')

  return {
    combinedText,
    initials: buildInitials([...tokenize(titleText), ...tags]),
    pathWords: tokenize(pathText),
    projectWords: tokenize(projectText),
    tagWords: tags,
    titleCompact: titleText.replace(/\s+/g, ''),
    titleText,
    titleWords: tokenize(titleText),
  }
}

function buildInitials(words: string[]): string {
  return words.map((word) => word[0] ?? '').join('')
}

function collectAvailableTags(sessions: SessionPreview[]): string[] {
  const counts = new Map<string, number>()

  for (const session of sessions) {
    for (const tag of deriveSessionTags(session)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([tag]) => tag)
    .slice(0, 12)
}

function compareRankedSessions(
  left: RankedSession,
  right: RankedSession,
  sortByScore: boolean,
): number {
  if (sortByScore) {
    return (
      right.score - left.score ||
      right.session.lastActivityTimestamp - left.session.lastActivityTimestamp
    )
  }

  return right.session.lastActivityTimestamp - left.session.lastActivityTimestamp
}

function dedupeSessions(groups: ProjectSessionGroup[]): SessionPreview[] {
  const sessions = new Map<string, SessionPreview>()

  for (const group of groups) {
    for (const session of group.sessions) {
      sessions.set(session.id, session)
    }
  }

  return Array.from(sessions.values())
}

function tokenize(value: string): string[] {
  return normalize(value).split(' ').filter(Boolean)
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
