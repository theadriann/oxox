const SESSION_SEARCH_MODIFIERS = [
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
] as const

export type SessionSearchModifier = (typeof SESSION_SEARCH_MODIFIERS)[number]

export type ParsedSessionSearchQuery = {
  raw: string
  freeText: string
  terms: string[]
  termGroups: string[][][]
  modifiers: Partial<Record<SessionSearchModifier, string[]>>
}

const MODIFIER_SET = new Set<string>(SESSION_SEARCH_MODIFIERS)
const SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'did',
  'for',
  'how',
  'in',
  'is',
  'of',
  'the',
  'to',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'why',
  'with',
])

export function parseSessionSearchQuery(raw: string): ParsedSessionSearchQuery {
  const modifiers: Partial<Record<SessionSearchModifier, string[]>> = {}
  const freeTextParts: string[] = []
  let cursor = 0

  while (cursor < raw.length) {
    while (cursor < raw.length && /\s/u.test(raw[cursor] ?? '')) {
      cursor += 1
    }

    if (cursor >= raw.length) {
      break
    }

    const tokenStart = cursor
    while (cursor < raw.length && !/[\s:]/u.test(raw[cursor] ?? '')) {
      cursor += 1
    }

    const maybePrefix = raw.slice(tokenStart, cursor).toLowerCase()

    if (raw[cursor] === ':' && MODIFIER_SET.has(maybePrefix)) {
      cursor += 1
      const { nextCursor, value } = readModifierValue(raw, cursor)
      cursor = nextCursor

      const normalizedValue = normalizeSearchText(value)
      if (normalizedValue) {
        const prefix = maybePrefix as SessionSearchModifier
        modifiers[prefix] = [...(modifiers[prefix] ?? []), normalizedValue]
      }
      continue
    }

    cursor = tokenStart
    const { nextCursor, value } = readFreeTextToken(raw, cursor)
    cursor = nextCursor
    const normalizedValue = normalizeSearchText(value)
    if (normalizedValue) {
      freeTextParts.push(normalizedValue)
    }
  }

  const freeText = freeTextParts.join(' ').replace(/\s+/gu, ' ').trim()

  return {
    raw,
    freeText,
    terms: tokenizeSearchText(freeText),
    termGroups: buildSearchTermGroups(freeText),
    modifiers,
  }
}

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, ' ').trim()
}

export function tokenizeSearchText(value: string): string[] {
  return normalizeSearchText(value)
    .split(/[^a-z0-9_./:-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !SEARCH_STOP_WORDS.has(token))
}

function buildSearchTermGroups(value: string): string[][][] {
  return tokenizeSearchText(value).map((term) => {
    const splitVariant = splitHyphenatedSearchTerm(term)

    return splitVariant.length > 1 ? [[term], splitVariant] : [[term]]
  })
}

function splitHyphenatedSearchTerm(term: string): string[] {
  if (!term.includes('-') || isIssueKeyTerm(term)) {
    return []
  }

  return term
    .split(/-+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !SEARCH_STOP_WORDS.has(part))
}

function isIssueKeyTerm(term: string): boolean {
  return /^[a-z][a-z0-9]+-\d+$/u.test(term)
}

function readModifierValue(raw: string, cursor: number): { value: string; nextCursor: number } {
  if (raw[cursor] === '"') {
    return readQuotedValue(raw, cursor)
  }

  return readFreeTextToken(raw, cursor)
}

function readQuotedValue(raw: string, cursor: number): { value: string; nextCursor: number } {
  let nextCursor = cursor + 1
  let value = ''

  while (nextCursor < raw.length) {
    const char = raw[nextCursor]

    if (char === '"') {
      return { value, nextCursor: nextCursor + 1 }
    }

    value += char ?? ''
    nextCursor += 1
  }

  return { value, nextCursor }
}

function readFreeTextToken(raw: string, cursor: number): { value: string; nextCursor: number } {
  let nextCursor = cursor

  while (nextCursor < raw.length && !/\s/u.test(raw[nextCursor] ?? '')) {
    nextCursor += 1
  }

  return {
    value: raw.slice(cursor, nextCursor),
    nextCursor,
  }
}
