import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Kbd } from '../ui/kbd'
import type { TimelineItem } from './timelineTypes'

export const TRANSCRIPT_INLINE_SEARCH_HIGHLIGHT_NAME = 'oxox-transcript-search'

const MAX_HIGHLIGHT_RANGES = 500

export function getTimelineItemSearchText(item: TimelineItem): string {
  switch (item.kind) {
    case 'message':
      return item.content
    case 'thinking':
      return item.content
    case 'tool':
      return [
        item.toolName,
        item.inputMarkdown ?? '',
        item.resultMarkdown ?? '',
        item.progressSummary ?? '',
      ].join('\n')
    case 'permission':
      return item.description
    case 'askUser':
      return [item.prompt, ...item.questions.map((question) => question.question)].join('\n')
    case 'event':
      return [item.title, item.body, ...item.details].join('\n')
  }
}

export function getRenderableMatchCount(items: TimelineItem[], query: string): number {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return 0
  }

  return items.filter((item) =>
    getTimelineItemSearchText(item).toLowerCase().includes(normalizedQuery),
  ).length
}

export interface TranscriptInlineSearchState {
  isOpen: boolean
  query: string
  matchRowIndexes: number[]
  activeMatchIndex: number
  activeRowIndex: number | null
  open: () => void
  close: () => void
  setQuery: (query: string) => void
  goToNextMatch: () => void
  goToPreviousMatch: () => void
}

export function useTranscriptInlineSearch({
  searchTexts,
  onNavigateToRow,
}: {
  searchTexts: string[]
  onNavigateToRow: (rowIndex: number) => void
}): TranscriptInlineSearchState {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const navigateRef = useRef(onNavigateToRow)
  navigateRef.current = onNavigateToRow

  const matchRowIndexes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!isOpen || !normalizedQuery) {
      return []
    }

    const indexes: number[] = []

    searchTexts.forEach((text, index) => {
      if (text.toLowerCase().includes(normalizedQuery)) {
        indexes.push(index)
      }
    })

    return indexes
  }, [isOpen, query, searchTexts])

  const boundedMatchIndex =
    matchRowIndexes.length > 0 ? Math.min(activeMatchIndex, matchRowIndexes.length - 1) : 0
  const activeRowIndex = matchRowIndexes[boundedMatchIndex] ?? null

  useEffect(() => {
    if (activeRowIndex !== null) {
      navigateRef.current(activeRowIndex)
    }
  }, [activeRowIndex])

  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setActiveMatchIndex(0)
  }, [])

  const handleSetQuery = useCallback((nextQuery: string) => {
    setQuery(nextQuery)
    setActiveMatchIndex(0)
  }, [])

  const goToNextMatch = useCallback(() => {
    if (matchRowIndexes.length === 0) {
      return
    }

    setActiveMatchIndex((current) => (current + 1) % matchRowIndexes.length)
  }, [matchRowIndexes.length])

  const goToPreviousMatch = useCallback(() => {
    if (matchRowIndexes.length === 0) {
      return
    }

    setActiveMatchIndex(
      (current) => (current - 1 + matchRowIndexes.length) % matchRowIndexes.length,
    )
  }, [matchRowIndexes.length])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'f' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault()
        setIsOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return {
    activeMatchIndex: boundedMatchIndex,
    activeRowIndex,
    close,
    goToNextMatch,
    goToPreviousMatch,
    isOpen,
    matchRowIndexes,
    open,
    query,
    setQuery: handleSetQuery,
  }
}

function supportsCustomHighlights(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

function collectMatchRanges(root: HTMLElement, normalizedQuery: string): Range[] {
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

  while (ranges.length < MAX_HIGHLIGHT_RANGES) {
    const textNode = walker.nextNode() as Text | null

    if (!textNode) {
      break
    }

    const text = textNode.data.toLowerCase()
    let fromIndex = 0

    while (ranges.length < MAX_HIGHLIGHT_RANGES) {
      const matchIndex = text.indexOf(normalizedQuery, fromIndex)

      if (matchIndex < 0) {
        break
      }

      const range = document.createRange()
      range.setStart(textNode, matchIndex)
      range.setEnd(textNode, matchIndex + normalizedQuery.length)
      ranges.push(range)
      fromIndex = matchIndex + normalizedQuery.length
    }
  }

  return ranges
}

/**
 * Paints `::highlight(oxox-transcript-search)` marks over every visible
 * occurrence of the inline-search query inside the transcript scroll area.
 * Uses the CSS Custom Highlight API so virtualized rows stay untouched, and
 * re-applies highlights whenever virtualization mounts new rows.
 */
export function useTranscriptInlineSearchHighlights({
  containerRef,
  isOpen,
  query,
}: {
  containerRef: RefObject<HTMLElement | null>
  isOpen: boolean
  query: string
}): void {
  const normalizedQuery = query.trim().toLowerCase()

  useEffect(() => {
    if (!supportsCustomHighlights()) {
      return
    }

    const highlightRegistry = CSS.highlights
    const container = containerRef.current

    if (!isOpen || !normalizedQuery || !container) {
      highlightRegistry.delete(TRANSCRIPT_INLINE_SEARCH_HIGHLIGHT_NAME)
      return
    }

    let animationFrame: number | null = null

    const applyHighlights = () => {
      animationFrame = null
      const ranges = collectMatchRanges(container, normalizedQuery)

      if (ranges.length === 0) {
        highlightRegistry.delete(TRANSCRIPT_INLINE_SEARCH_HIGHLIGHT_NAME)
        return
      }

      highlightRegistry.set(TRANSCRIPT_INLINE_SEARCH_HIGHLIGHT_NAME, new Highlight(...ranges))
    }

    const scheduleApply = () => {
      if (animationFrame === null) {
        animationFrame = requestAnimationFrame(applyHighlights)
      }
    }

    applyHighlights()

    const observer = new MutationObserver(scheduleApply)
    observer.observe(container, { characterData: true, childList: true, subtree: true })

    return () => {
      observer.disconnect()

      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame)
      }

      highlightRegistry.delete(TRANSCRIPT_INLINE_SEARCH_HIGHLIGHT_NAME)
    }
  }, [containerRef, isOpen, normalizedQuery])
}

export function TranscriptInlineSearchBar({ search }: { search: TranscriptInlineSearchState }) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (search.isOpen) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [search.isOpen])

  if (!search.isOpen) {
    return null
  }

  const hasQuery = search.query.trim().length > 0
  const matchCount = search.matchRowIndexes.length
  const positionLabel = hasQuery
    ? `${matchCount === 0 ? 0 : search.activeMatchIndex + 1}/${matchCount}`
    : ''

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      search.close()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()

      if (event.shiftKey) {
        search.goToPreviousMatch()
        return
      }

      search.goToNextMatch()
    }
  }

  return (
    <div className="pointer-events-none absolute right-3 top-2 z-20">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-fd-border-default bg-fd-panel px-2 py-1.5 shadow-xl shadow-black/30">
        <Search className="size-3.5 shrink-0 text-fd-tertiary" />
        <input
          ref={inputRef}
          aria-label="Find in session"
          className="h-6 w-44 bg-transparent text-xs text-fd-primary outline-none placeholder:text-fd-tertiary"
          placeholder="Find in session..."
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {hasQuery ? (
          <span className="shrink-0 tabular-nums text-[10px] text-fd-tertiary">
            {positionLabel}
          </span>
        ) : (
          <Kbd className="bg-white/5 text-fd-tertiary">↵</Kbd>
        )}
        <div className="flex shrink-0 items-center">
          <button
            aria-label="Previous match"
            className="rounded p-0.5 text-fd-tertiary transition hover:text-fd-primary disabled:opacity-40"
            disabled={matchCount === 0}
            type="button"
            onClick={search.goToPreviousMatch}
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            aria-label="Next match"
            className="rounded p-0.5 text-fd-tertiary transition hover:text-fd-primary disabled:opacity-40"
            disabled={matchCount === 0}
            type="button"
            onClick={search.goToNextMatch}
          >
            <ChevronDown className="size-3.5" />
          </button>
          <button
            aria-label="Close find in session"
            className="ml-0.5 rounded p-0.5 text-fd-tertiary transition hover:text-fd-primary"
            type="button"
            onClick={search.close}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
