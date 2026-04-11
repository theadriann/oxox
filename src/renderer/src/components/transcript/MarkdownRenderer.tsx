import { type ComponentPropsWithoutRef, memo, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'

export interface MarkdownRendererProps {
  markdown: string
}

const remarkPlugins = [remarkGfm]

function CodeBlock({ children, className, ...props }: ComponentPropsWithoutRef<'code'>) {
  const language = /language-(\w+)/u.exec(className ?? '')?.[1]

  if (language) {
    return (
      <SyntaxHighlighter
        {...props}
        CodeTag="code"
        PreTag="div"
        className="!my-1 overflow-x-auto rounded-md border border-white/[0.06] bg-fd-canvas px-3 py-2 text-[12px] leading-snug"
        language={language}
        style={oneDark}
      >
        {String(children).replace(/\n$/u, '')}
      </SyntaxHighlighter>
    )
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

const mdComponents = {
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
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  markdown,
}: MarkdownRendererProps) {
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
