import { ExternalLink, Globe, Search } from 'lucide-react'
import { memo, useMemo } from 'react'

interface WebSearchResult {
  title: string
  url: string
  text?: string
  publishedDate?: string
}

interface WebSearchViewProps {
  query: string | null
  resultMarkdown: string | null
}

export const WebSearchView = memo(function WebSearchView({
  query,
  resultMarkdown,
}: WebSearchViewProps) {
  const results = useMemo(() => parseWebSearchResults(resultMarkdown), [resultMarkdown])

  return (
    <div className="overflow-hidden rounded-md border border-fd-border-subtle">
      {query ? (
        <div className="flex items-center gap-2 border-b border-fd-border-subtle bg-fd-panel/60 px-3 py-1.5">
          <Search className="size-3 shrink-0 text-fd-tertiary" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fd-secondary">
            {query}
          </span>
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium text-fd-tertiary bg-fd-surface">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        </div>
      ) : null}
      {results.length > 0 ? (
        <div className="flex flex-col divide-y divide-fd-border-subtle">
          {results.map((result) => (
            <WebSearchResultRow key={result.url} result={result} />
          ))}
        </div>
      ) : resultMarkdown ? (
        <pre className="overflow-x-auto bg-fd-canvas px-3 py-2 font-mono text-[11px] leading-relaxed text-fd-secondary whitespace-pre-wrap break-words">
          {resultMarkdown}
        </pre>
      ) : (
        <div className="px-3 py-3 text-[11px] text-fd-tertiary italic">Searching...</div>
      )}
    </div>
  )
})

function WebSearchResultRow({ result }: { result: WebSearchResult }) {
  const domain = useMemo(() => {
    try {
      return new URL(result.url).hostname.replace(/^www\./, '')
    } catch {
      return result.url
    }
  }, [result.url])

  return (
    <div className="group/result flex flex-col gap-0.5 px-3 py-2 transition-colors hover:bg-fd-surface/50">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group/link flex items-center gap-1 text-[12px] font-medium text-fd-primary hover:text-fd-ember-400 transition-colors"
          >
            <span className="truncate">{result.title}</span>
            <ExternalLink className="size-2.5 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
          </a>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Globe className="size-2.5 text-fd-tertiary" />
            <span className="truncate text-[10px] text-fd-tertiary">{domain}</span>
            {result.publishedDate ? (
              <>
                <span className="text-fd-tertiary">·</span>
                <span className="text-[10px] text-fd-tertiary">{result.publishedDate}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      {result.text ? (
        <p className="text-[11px] leading-relaxed text-fd-tertiary line-clamp-2 mt-0.5">
          {result.text}
        </p>
      ) : null}
    </div>
  )
}

function parseWebSearchResults(resultMarkdown: string | null): WebSearchResult[] {
  if (!resultMarkdown) return []

  const trimmed = resultMarkdown.trim()
  const fencedMatch = trimmed.match(/^```(?:json)?\n([\s\S]*?)\n```$/)
  const jsonText = fencedMatch ? fencedMatch[1] : trimmed

  try {
    const parsed = JSON.parse(jsonText)

    // Direct array of results
    if (Array.isArray(parsed)) {
      return parsed.filter(isValidResult)
    }

    // Object with results array
    if (parsed && typeof parsed === 'object') {
      const results = parsed.results ?? parsed.data ?? parsed.items ?? parsed.webPages?.value
      if (Array.isArray(results)) {
        return results.filter(isValidResult)
      }
    }
  } catch {
    // Try line-by-line markdown link parsing
    return parseMarkdownLinks(resultMarkdown)
  }

  return parseMarkdownLinks(resultMarkdown)
}

function isValidResult(item: unknown): item is WebSearchResult {
  if (!item || typeof item !== 'object') return false
  const obj = item as Record<string, unknown>
  return typeof obj.title === 'string' && typeof obj.url === 'string'
}

function parseMarkdownLinks(markdown: string): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g

  for (const match of markdown.matchAll(linkRegex)) {
    if (match[1] && match[2]) {
      results.push({ title: match[1], url: match[2] })
    }
  }

  return results
}
