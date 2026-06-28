import { Check, Copy, Table2, WrapText } from 'lucide-react'
import {
  type ComponentPropsWithoutRef,
  memo,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import Markdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import remarkGfm from 'remark-gfm'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'

export interface MarkdownRendererProps {
  markdown: string
}

const remarkPlugins = [remarkGfm]

function CodeBlock({ children, className, ...props }: ComponentPropsWithoutRef<'code'>) {
  const language = /language-(\w+)/u.exec(className ?? '')?.[1]

  if (language) {
    return <MarkdownCodeBlock code={String(children).replace(/\n$/u, '')} language={language} />
  }

  return (
    <code
      {...props}
      className="rounded bg-white/[0.08] px-1 py-px font-mono text-[0.9em] text-fd-secondary"
    >
      {children}
    </code>
  )
}

function MarkdownCodeBlock({ code, language }: { code: string; language: string }) {
  const [isWrapped, setIsWrapped] = useState(true)
  const [hasCopied, setHasCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!navigator.clipboard?.writeText) return

    await navigator.clipboard.writeText(code)
    setHasCopied(true)
    window.setTimeout(() => setHasCopied(false), 1400)
  }, [code])

  return (
    <figure
      className="group/code my-3 overflow-hidden rounded-xl border border-fd-border-default bg-[color-mix(in_srgb,var(--fd-panel)_74%,var(--fd-canvas))] shadow-[0_12px_34px_rgba(0,0,0,0.22)]"
      data-testid="markdown-code-block"
      data-wrap={isWrapped ? 'true' : 'false'}
    >
      <figcaption className="flex min-h-9 items-center justify-between gap-3 border-b border-fd-border-subtle bg-fd-panel/60 px-3">
        <span className="rounded-md border border-fd-border-subtle bg-fd-canvas/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-fd-tertiary">
          {language}
        </span>
        <div className="flex items-center gap-1">
          <button
            aria-label={isWrapped ? 'Unwrap code text' : 'Wrap code text'}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-transparent px-1.5 text-[10px] font-medium text-fd-tertiary transition-colors hover:border-fd-border-default hover:bg-fd-elevated hover:text-fd-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fd-ember-400"
            type="button"
            onClick={() => setIsWrapped((current) => !current)}
          >
            <WrapText className="size-3.5" />
            <span>{isWrapped ? 'Unwrap' : 'Wrap'}</span>
          </button>
          <button
            aria-label="Copy code to clipboard"
            className="inline-flex h-6 items-center gap-1 rounded-md border border-transparent px-1.5 text-[10px] font-medium text-fd-tertiary transition-colors hover:border-fd-border-default hover:bg-fd-elevated hover:text-fd-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fd-ember-400"
            type="button"
            onClick={() => void handleCopy()}
          >
            {hasCopied ? (
              <Check className="size-3.5 text-fd-ready" />
            ) : (
              <Copy className="size-3.5" />
            )}
            <span>{hasCopied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </figcaption>
      <div
        className={`max-w-full bg-fd-canvas/65 ${isWrapped ? 'overflow-x-hidden' : 'overflow-x-auto'}`}
      >
        <SyntaxHighlighter
          CodeTag="code"
          PreTag="div"
          className="!m-0 !bg-transparent px-3.5 py-3 text-[12px] leading-[1.65]"
          codeTagProps={{
            className: isWrapped ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
          }}
          customStyle={{
            background: 'transparent',
            margin: 0,
            padding: '0.75rem 0.875rem',
          }}
          language={language}
          style={factoryCodeTheme}
          wrapLongLines={isWrapped}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </figure>
  )
}

function MarkdownTable({
  children,
  markdown,
  node,
  ...props
}: ComponentPropsWithoutRef<'table'> & {
  children?: ReactNode
  markdown: string
  node?: { position?: { start?: { offset?: number }; end?: { offset?: number } } }
}) {
  const tableRef = useRef<HTMLTableElement | null>(null)
  const [hasCopied, setHasCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!navigator.clipboard?.writeText) return

    const sourceMarkdown =
      getMarkdownSourceForNode(markdown, node) ?? tableToMarkdown(tableRef.current)
    if (!sourceMarkdown) return

    await navigator.clipboard.writeText(sourceMarkdown)
    setHasCopied(true)
    window.setTimeout(() => setHasCopied(false), 1400)
  }, [markdown, node])

  return (
    <figure
      className="group/table my-4 overflow-hidden rounded-xl border border-fd-border-default bg-[color-mix(in_srgb,var(--fd-panel)_70%,var(--fd-canvas))] shadow-[0_14px_42px_rgba(0,0,0,0.2)]"
      data-testid="markdown-table"
    >
      <figcaption className="flex min-h-9 items-center justify-between gap-3 border-b border-fd-border-subtle bg-fd-panel/60 px-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-fd-tertiary uppercase">
          <Table2 className="size-3.5" />
          Table
        </span>
        <button
          aria-label="Copy table markdown to clipboard"
          className="inline-flex h-6 items-center gap-1 rounded-md border border-transparent px-1.5 text-[10px] font-medium text-fd-tertiary transition-colors hover:border-fd-border-default hover:bg-fd-elevated hover:text-fd-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fd-ember-400"
          type="button"
          onClick={() => void handleCopy()}
        >
          {hasCopied ? <Check className="size-3.5 text-fd-ready" /> : <Copy className="size-3.5" />}
          <span>{hasCopied ? 'Copied' : 'Copy'}</span>
        </button>
      </figcaption>
      <Table
        {...props}
        ref={tableRef}
        className="min-w-max border-separate border-spacing-0 text-[13px] leading-[1.55]"
      >
        {children}
      </Table>
    </figure>
  )
}

function createMarkdownComponents(markdown: string) {
  return {
    h1: createHeading('text-[14px]'),
    h2: createHeading('text-[14px]'),
    h3: createHeading('text-[13.5px]'),
    h4: createHeading('text-[13px]'),
    p: ({ children }: { children?: ReactNode }) => (
      <p className="my-2 text-[14px] leading-[1.7] text-fd-primary/95">{children}</p>
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
      <a
        className="text-fd-ember-400/90 underline decoration-fd-ember-400/30 underline-offset-2 transition-colors hover:text-fd-ember-400 hover:decoration-fd-ember-400/60"
        href={href}
        rel="noreferrer noopener"
        target="_blank"
      >
        {children}
      </a>
    ),
    code: CodeBlock,
    pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
    ol: ({ children }: { children?: ReactNode }) => (
      <ol className="my-2 ml-4 list-decimal space-y-1.5 text-[14px] leading-[1.7] text-fd-primary/95">
        {children}
      </ol>
    ),
    ul: ({ children }: { children?: ReactNode }) => (
      <ul className="my-2 ml-4 list-disc space-y-1.5 text-[14px] leading-[1.7] text-fd-primary/95">
        {children}
      </ul>
    ),
    li: ({ children }: { children?: ReactNode }) => (
      <li className="pl-1 marker:text-fd-tertiary/50">{children}</li>
    ),
    strong: ({ children }: { children?: ReactNode }) => (
      <strong className="font-semibold text-fd-primary">{children}</strong>
    ),
    em: ({ children }: { children?: ReactNode }) => (
      <em className="italic text-fd-secondary">{children}</em>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className="my-2 border-l-2 border-fd-border-subtle pl-3 text-[14px] italic leading-[1.7] text-fd-secondary">
        {children}
      </blockquote>
    ),
    table: ({
      children,
      node,
      ...props
    }: ComponentPropsWithoutRef<'table'> & {
      children?: ReactNode
      node?: { position?: { start?: { offset?: number }; end?: { offset?: number } } }
    }) => (
      <MarkdownTable markdown={markdown} node={node} {...props}>
        {children}
      </MarkdownTable>
    ),
    thead: ({
      children,
      ...props
    }: ComponentPropsWithoutRef<'thead'> & { children?: ReactNode }) => (
      <TableHeader {...props} className="bg-fd-elevated/55 [&_tr]:border-b-0">
        {children}
      </TableHeader>
    ),
    tbody: ({
      children,
      ...props
    }: ComponentPropsWithoutRef<'tbody'> & { children?: ReactNode }) => (
      <TableBody {...props} className="divide-y divide-fd-border-subtle/70">
        {children}
      </TableBody>
    ),
    tr: ({ children, ...props }: ComponentPropsWithoutRef<'tr'> & { children?: ReactNode }) => (
      <TableRow {...props} className="border-0 transition-colors hover:bg-fd-elevated/45">
        {children}
      </TableRow>
    ),
    th: ({ children, ...props }: ComponentPropsWithoutRef<'th'> & { children?: ReactNode }) => (
      <TableHead
        {...props}
        className="h-auto border-b border-fd-border-default px-3 py-2.5 text-left align-bottom font-semibold text-fd-primary whitespace-normal first:pl-3 last:pr-3"
      >
        {children}
      </TableHead>
    ),
    td: ({ children, ...props }: ComponentPropsWithoutRef<'td'> & { children?: ReactNode }) => (
      <TableCell
        {...props}
        className="px-3 py-2.5 align-top text-fd-secondary whitespace-normal first:pl-3 last:pr-3"
      >
        {children}
      </TableCell>
    ),
  }
}

const factoryCodeTheme = {
  'code[class*="language-"]': {
    background: 'transparent',
    color: 'var(--fd-text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    textShadow: 'none',
  },
  'pre[class*="language-"]': {
    background: 'transparent',
    color: 'var(--fd-text-secondary)',
    fontFamily: 'var(--font-mono)',
    textShadow: 'none',
  },
  comment: {
    color: 'var(--fd-text-tertiary)',
    fontStyle: 'italic',
  },
  prolog: {
    color: 'var(--fd-text-tertiary)',
  },
  doctype: {
    color: 'var(--fd-text-tertiary)',
  },
  cdata: {
    color: 'var(--fd-text-tertiary)',
  },
  punctuation: {
    color: 'var(--fd-text-tertiary)',
  },
  property: {
    color: 'var(--fd-ember-400)',
  },
  tag: {
    color: 'var(--fd-ember-400)',
  },
  boolean: {
    color: 'var(--fd-warning)',
  },
  number: {
    color: 'var(--fd-warning)',
  },
  constant: {
    color: 'var(--fd-warning)',
  },
  symbol: {
    color: 'var(--fd-warning)',
  },
  selector: {
    color: 'var(--fd-ready)',
  },
  string: {
    color: 'var(--fd-ready)',
  },
  char: {
    color: 'var(--fd-ready)',
  },
  builtin: {
    color: 'var(--fd-ready)',
  },
  inserted: {
    color: 'var(--fd-ready)',
  },
  operator: {
    color: 'var(--fd-text-primary)',
  },
  entity: {
    color: 'var(--fd-text-primary)',
  },
  url: {
    color: 'var(--fd-text-primary)',
  },
  atrule: {
    color: 'var(--fd-ember-300)',
  },
  attr_value: {
    color: 'var(--fd-ready)',
  },
  keyword: {
    color: 'var(--fd-ember-300)',
  },
  function: {
    color: 'var(--fd-text-primary)',
  },
  className: {
    color: 'var(--fd-ember-400)',
  },
  regex: {
    color: 'var(--fd-warning)',
  },
  important: {
    color: 'var(--fd-warning)',
    fontWeight: '600',
  },
  variable: {
    color: 'var(--fd-text-primary)',
  },
  deleted: {
    color: 'var(--fd-danger)',
  },
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  markdown,
}: MarkdownRendererProps) {
  const mdComponents = useMemo(() => createMarkdownComponents(markdown), [markdown])

  return (
    <Markdown remarkPlugins={remarkPlugins} components={mdComponents}>
      {markdown}
    </Markdown>
  )
})

function createHeading(sizeClassName: string) {
  return function Heading({
    children,
    ...props
  }: ComponentPropsWithoutRef<'h1'> & { children?: ReactNode }) {
    return (
      <p
        {...props}
        className={`mt-3 mb-1 ${sizeClassName} font-bold tracking-[-0.01em] text-fd-primary`}
      >
        {children}
      </p>
    )
  }
}

function getMarkdownSourceForNode(
  markdown: string,
  node?: { position?: { start?: { offset?: number }; end?: { offset?: number } } },
): string | null {
  const startOffset = node?.position?.start?.offset
  const endOffset = node?.position?.end?.offset

  if (
    typeof startOffset !== 'number' ||
    typeof endOffset !== 'number' ||
    startOffset < 0 ||
    endOffset <= startOffset ||
    endOffset > markdown.length
  ) {
    return null
  }

  return markdown.slice(startOffset, endOffset).trim()
}

function tableToMarkdown(table: HTMLTableElement | null): string | null {
  if (!table) {
    return null
  }

  const rows = [...table.rows].map((row) =>
    [...row.cells].map((cell) => normalizeMarkdownTableCell(cell.textContent ?? '')),
  )

  if (rows.length === 0) {
    return null
  }

  const [header, ...body] = rows
  const separator = header.map(() => '---')
  return [header, separator, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n')
}

function normalizeMarkdownTableCell(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').replace(/\|/gu, '\\|')
}
