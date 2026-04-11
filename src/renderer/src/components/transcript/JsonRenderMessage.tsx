import { isNonEmptySpec, type Spec } from '@json-render/core'
import {
  type ComponentRegistry,
  type ComponentRenderProps,
  JSONUIProvider,
  Renderer,
} from '@json-render/react'
import type { CSSProperties, ReactNode } from 'react'

import { AlertDescription, AlertTitle, Alert as UIAlert } from '@/components/ui/alert'
import { Badge as UIBadge } from '@/components/ui/badge'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Card as UICard,
} from '@/components/ui/card'
import { Progress as UIProgress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Table as UITable,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

const JSON_RENDER_PATTERN = /^<json-render>([\s\S]*)<\/json-render>$/u
const JSON_RENDER_GLOBAL_PATTERN = /<json-render>([\s\S]*?)<\/json-render>/gu

const palette = {
  border: 'var(--fd-border-default)',
  mutedBorder: 'var(--fd-border-subtle)',
  panel: 'var(--fd-glass)',
  panelStrong: 'color-mix(in srgb, var(--fd-panel) 70%, var(--fd-elevated))',
  text: 'var(--fd-text-primary)',
  secondaryText: 'var(--fd-text-secondary)',
  tertiaryText: 'var(--fd-text-tertiary)',
  info: '#38bdf8',
  success: 'var(--fd-ready)',
  warning: 'var(--fd-warning)',
  danger: 'var(--fd-danger)',
} as const

export function parsePureJsonRenderSpec(content: string): Spec | null {
  const match = JSON_RENDER_PATTERN.exec(content.trim())

  if (!match) {
    return null
  }

  try {
    const parsed = JSON.parse(match[1])
    return isNonEmptySpec(parsed) ? parsed : null
  } catch {
    return null
  }
}

export type JsonRenderContentSegment =
  | { kind: 'markdown'; content: string }
  | { kind: 'json-render'; spec: Spec }

export function parseJsonRenderContentSegments(content: string): JsonRenderContentSegment[] {
  const segments: JsonRenderContentSegment[] = []
  let lastIndex = 0

  for (const match of content.matchAll(JSON_RENDER_GLOBAL_PATTERN)) {
    const matchStart = match.index ?? 0
    const fullMatch = match[0]

    if (matchStart > lastIndex) {
      const before = content.slice(lastIndex, matchStart)

      if (before.length > 0) {
        segments.push({ kind: 'markdown', content: before })
      }
    }

    const parsedSpec = parsePureJsonRenderSpec(fullMatch)

    if (parsedSpec) {
      segments.push({ kind: 'json-render', spec: parsedSpec })
    } else {
      segments.push({ kind: 'markdown', content: fullMatch })
    }

    lastIndex = matchStart + fullMatch.length
  }

  if (lastIndex < content.length) {
    const after = content.slice(lastIndex)

    if (after.length > 0) {
      segments.push({ kind: 'markdown', content: after })
    }
  }

  if (segments.length === 0) {
    return [{ kind: 'markdown', content }]
  }

  return segments
}

export function JsonRenderMessage({ spec }: { spec: Spec }) {
  return (
    <div
      data-testid="json-render-root"
      className="overflow-hidden rounded-xl border border-fd-border-default bg-fd-panel/50 shadow-[var(--fd-shadow-sm)]"
    >
      <div className="border-b border-fd-border-subtle bg-fd-glass px-3 py-2">
        <span className="text-[10px] font-medium tracking-[0.14em] text-fd-tertiary uppercase">
          Structured output
        </span>
      </div>
      <div className="p-3">
        <JSONUIProvider registry={jsonRenderRegistry}>
          <Renderer fallback={UnknownComponent} registry={jsonRenderRegistry} spec={spec} />
        </JSONUIProvider>
      </div>
    </div>
  )
}

const jsonRenderRegistry: ComponentRegistry = {
  Box: function Box({ element, children }) {
    const props = (element.props ?? {}) as {
      flexDirection?: 'row' | 'column'
      padding?: number
      gap?: number
      borderStyle?: CSSProperties['borderStyle']
    }

    return (
      <div
        className={cn(
          'min-w-0',
          props.borderStyle
            ? 'rounded-lg border border-fd-border-subtle bg-fd-glass shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]'
            : undefined,
        )}
        style={{
          display: 'flex',
          flexDirection: props.flexDirection ?? 'column',
          gap: spacing(props.gap),
          padding: spacing(props.padding),
          borderStyle: props.borderStyle,
          borderWidth: props.borderStyle ? 1 : undefined,
          borderColor: props.borderStyle ? palette.border : undefined,
          borderRadius: '0.5rem',
        }}
      >
        {children}
      </div>
    )
  },
  Text: function Text({ element, children }) {
    const props = (element.props ?? {}) as { text?: string; color?: string; bold?: boolean }

    return (
      <span
        className="leading-relaxed"
        style={{
          color: resolveColor(props.color),
          fontWeight: props.bold ? 600 : 400,
        }}
      >
        {props.text ?? children}
      </span>
    )
  },
  Heading: function Heading({ element }) {
    const props = (element.props ?? {}) as { text?: string; level?: string }
    const Tag = resolveHeadingTag(props.level)

    return (
      <Tag
        className="font-display tracking-tight text-fd-primary"
        style={{ fontSize: resolveHeadingSize(props.level), fontWeight: 600, lineHeight: 1.2 }}
      >
        {props.text}
      </Tag>
    )
  },
  Divider: function Divider({ element }) {
    const props = (element.props ?? {}) as { title?: string }

    return (
      <div className="flex items-center gap-3 py-1">
        <Separator className="flex-1 bg-fd-border-subtle" />
        {props.title ? (
          <span className="text-[10px] font-medium tracking-[0.12em] text-fd-tertiary uppercase">
            {props.title}
          </span>
        ) : null}
        <Separator className="flex-1 bg-fd-border-subtle" />
      </div>
    )
  },
  Newline: function Newline() {
    return <div className="h-2" />
  },
  Spacer: function Spacer() {
    return <div className="min-h-2 flex-1" />
  },
  BarChart: function BarChart({ element }) {
    const props = (element.props ?? {}) as {
      data?: Array<{ label?: string; value?: number; color?: string }>
      showPercentage?: boolean
    }
    const data = props.data ?? []
    const total = data.reduce((sum, item) => sum + (item.value ?? 0), 0)
    const maxValue = Math.max(...data.map((item) => item.value ?? 0), 0)

    return (
      <UICard className="border-fd-border-subtle bg-fd-glass py-3 shadow-none" size="sm">
        <CardContent className="flex flex-col gap-3">
          {data.map((item) => {
            const value = item.value ?? 0
            const normalizedValue = maxValue > 0 ? (value / maxValue) * 100 : 0

            return (
              <div
                key={createKey('bar', item.label, value, item.color)}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="font-medium text-fd-secondary">{item.label}</span>
                  <span className="font-mono text-fd-tertiary">
                    {value}
                    {props.showPercentage && total > 0
                      ? ` (${Math.round((value / total) * 100)}%)`
                      : ''}
                  </span>
                </div>
                <UIProgress
                  aria-label={item.label}
                  className="h-2 bg-fd-surface"
                  style={{ ['--color-primary' as string]: resolveColor(item.color) }}
                  value={normalizedValue}
                />
              </div>
            )
          })}
        </CardContent>
      </UICard>
    )
  },
  Sparkline: function Sparkline({ element }) {
    const props = (element.props ?? {}) as { data?: number[]; color?: string }
    const data = props.data ?? []

    if (data.length === 0) {
      return null
    }

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const points = data
      .map((value, index) => {
        const x = (index / Math.max(data.length - 1, 1)) * 100
        const y = 24 - ((value - min) / range) * 24
        return `${x},${y}`
      })
      .join(' ')

    return (
      <UICard className="border-fd-border-subtle bg-fd-glass py-3 shadow-none" size="sm">
        <CardContent>
          <svg
            aria-label="Sparkline"
            className="w-full"
            height="28"
            viewBox="0 0 100 28"
            width="100%"
          >
            <polyline
              fill="none"
              points={points}
              stroke={resolveColor(props.color)}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          </svg>
        </CardContent>
      </UICard>
    )
  },
  Table: function Table({ element }) {
    const props = (element.props ?? {}) as {
      columns?: Array<{ header?: string; key?: string; width?: number }>
      rows?: Array<Record<string, unknown>>
      headerColor?: string
    }
    const columns = props.columns ?? []
    const rows = props.rows ?? []

    return (
      <div className="overflow-hidden rounded-lg border border-fd-border-subtle bg-fd-glass">
        <UITable className="text-[12px]">
          <TableHeader
            style={{ backgroundColor: resolveColor(props.headerColor, palette.panelStrong) }}
          >
            <TableRow className="border-fd-border-subtle hover:bg-transparent">
              {columns.map((column) => (
                <TableHead
                  key={createKey('column', column.key, column.header, column.width)}
                  className="h-9 px-3 font-medium whitespace-normal text-fd-primary"
                  style={{ width: column.width ? `${column.width}ch` : undefined }}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const rowKey = createKey('row', row)

              return (
                <TableRow key={rowKey} className="border-fd-border-subtle/80 hover:bg-fd-panel/40">
                  {columns.map((column) => (
                    <TableCell
                      key={createKey('cell', rowKey, column.key, column.header)}
                      className="px-3 py-2 align-top whitespace-normal text-fd-secondary"
                    >
                      {renderValue(column.key ? row[column.key] : '')}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </UITable>
      </div>
    )
  },
  List: function List({ element }) {
    const props = (element.props ?? {}) as { items?: string[]; ordered?: boolean }
    const Tag = props.ordered ? 'ol' : 'ul'

    return (
      <Tag
        className={cn(
          'ml-4 flex list-outside flex-col gap-1.5 text-[13px] leading-relaxed text-fd-secondary',
          props.ordered ? 'list-decimal' : 'list-disc',
        )}
      >
        {(props.items ?? []).map((item) => (
          <li key={createKey('list-item', item)}>{item}</li>
        ))}
      </Tag>
    )
  },
  Card: function Card({ element, children }) {
    const props = (element.props ?? {}) as { title?: string; padding?: number }

    return (
      <UICard
        className="border-fd-border-subtle bg-fd-glass py-0 shadow-none"
        size="sm"
        style={{ padding: spacing(props.padding) }}
      >
        {props.title ? (
          <CardHeader className="border-b border-fd-border-subtle pb-3">
            <CardTitle className="font-display text-[13px]">{props.title}</CardTitle>
            <CardDescription className="text-[11px] uppercase tracking-[0.12em] text-fd-tertiary">
              Snapshot
            </CardDescription>
          </CardHeader>
        ) : null}
        <CardContent className="flex flex-col gap-2.5 py-3">{children}</CardContent>
      </UICard>
    )
  },
  StatusLine: function StatusLine({ element }) {
    const props = (element.props ?? {}) as {
      text?: string
      status?: 'success' | 'error' | 'warning' | 'info'
    }

    return (
      <div className="flex items-center gap-2 text-[12px] text-fd-secondary">
        <UIBadge variant={resolveBadgeVariant(props.status)}>{props.status ?? 'info'}</UIBadge>
        <span className="font-medium text-fd-secondary">{props.text}</span>
      </div>
    )
  },
  KeyValue: function KeyValue({ element }) {
    const props = (element.props ?? {}) as { label?: string; value?: unknown }

    return (
      <div className="flex items-start justify-between gap-3 rounded-md border border-fd-border-subtle bg-fd-glass px-3 py-2 text-[12px]">
        <span className="text-fd-tertiary">{props.label}</span>
        <span className="text-right font-medium text-fd-secondary">{renderValue(props.value)}</span>
      </div>
    )
  },
  Badge: function Badge({ element }) {
    const props = (element.props ?? {}) as { label?: string; variant?: string }

    return <UIBadge variant={resolveBadgeVariant(props.variant)}>{props.label}</UIBadge>
  },
  ProgressBar: function ProgressBar({ element }) {
    const props = (element.props ?? {}) as { progress?: number; width?: number; label?: string }
    const progress = Math.max(0, Math.min(1, props.progress ?? 0))

    return (
      <UICard className="border-fd-border-subtle bg-fd-glass py-3 shadow-none" size="sm">
        <CardContent className="flex flex-col gap-2.5">
          {props.label ? (
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="font-medium text-fd-secondary">{props.label}</span>
              <span className="font-mono text-fd-tertiary">{Math.round(progress * 100)}%</span>
            </div>
          ) : null}
          <UIProgress
            aria-label={props.label ?? 'Progress'}
            className="h-2 bg-fd-surface"
            style={{ width: props.width ? `${props.width}px` : '100%' }}
            value={progress * 100}
          />
        </CardContent>
      </UICard>
    )
  },
  Metric: function Metric({ element }) {
    const props = (element.props ?? {}) as {
      label?: string
      value?: unknown
      trend?: 'up' | 'down'
    }

    return (
      <UICard className="border-fd-border-subtle bg-fd-glass py-3 shadow-none" size="sm">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[10px] font-medium tracking-[0.14em] text-fd-tertiary uppercase">
              {props.label}
            </span>
            {props.trend ? (
              <UIBadge variant={props.trend === 'up' ? 'secondary' : 'destructive'}>
                {props.trend === 'up' ? 'Up' : 'Down'}
              </UIBadge>
            ) : null}
          </div>
          <div className="text-lg font-semibold tracking-tight text-fd-primary">
            {renderValue(props.value)}
          </div>
        </CardContent>
      </UICard>
    )
  },
  Callout: function Callout({ element }) {
    const props = (element.props ?? {}) as { type?: string; title?: string; content?: string }

    return (
      <UIAlert
        className={cn(
          'gap-2 border-fd-border-default bg-fd-glass',
          props.type === 'warning' ? 'border-fd-warning/40' : undefined,
          props.type === 'info' ? 'border-sky-400/30' : undefined,
        )}
        variant={props.type === 'error' || props.type === 'danger' ? 'destructive' : 'default'}
      >
        {props.title ? (
          <div className="flex items-center gap-2">
            <UIBadge variant={resolveBadgeVariant(props.type)}>{props.type ?? 'info'}</UIBadge>
            <AlertTitle>{props.title}</AlertTitle>
          </div>
        ) : null}
        {props.content ? <AlertDescription>{props.content}</AlertDescription> : null}
      </UIAlert>
    )
  },
  Timeline: function Timeline({ element }) {
    const props = (element.props ?? {}) as {
      items?: Array<{
        title?: string
        description?: string
        status?: 'success' | 'error' | 'warning' | 'info'
      }>
    }

    return (
      <UICard className="border-fd-border-subtle bg-fd-glass py-3 shadow-none" size="sm">
        <CardContent className="flex flex-col gap-3">
          {(props.items ?? []).map((item) => (
            <div
              key={createKey('timeline-item', item.title, item.description, item.status)}
              className="flex gap-3"
            >
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className="mt-1 size-2 rounded-full"
                  style={{ backgroundColor: resolveStatusColor(item.status) }}
                />
                {item !== props.items?.[props.items.length - 1] ? (
                  <div className="mt-1 w-px flex-1 bg-fd-border-subtle" />
                ) : null}
              </div>
              <div className="min-w-0 pb-1">
                <div className="text-[12px] font-medium text-fd-primary">{item.title}</div>
                {item.description ? (
                  <div className="text-[12px] leading-relaxed text-fd-secondary">
                    {item.description}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </UICard>
    )
  },
}

function UnknownComponent({ element, children }: ComponentRenderProps) {
  return (
    <UIAlert className="border-dashed border-fd-border-default bg-fd-glass">
      <AlertTitle>Unsupported component</AlertTitle>
      <AlertDescription>Unsupported component: {element.type}</AlertDescription>
      {children ? <div className="col-start-1 ml-0 mt-2">{children}</div> : null}
    </UIAlert>
  )
}

function resolveHeadingTag(level?: string) {
  switch (level) {
    case 'h1':
      return 'h1'
    case 'h3':
      return 'h3'
    case 'h4':
      return 'h4'
    default:
      return 'h2'
  }
}

function resolveHeadingSize(level?: string) {
  switch (level) {
    case 'h1':
      return '1.125rem'
    case 'h3':
      return '0.95rem'
    case 'h4':
      return '0.9rem'
    default:
      return '1rem'
  }
}

function spacing(value?: number) {
  return value == null ? undefined : `${value * 0.25}rem`
}

function resolveStatusColor(status?: 'success' | 'error' | 'warning' | 'info') {
  switch (status) {
    case 'success':
      return palette.success
    case 'error':
      return palette.danger
    case 'warning':
      return palette.warning
    default:
      return palette.info
  }
}

function resolveBadgeVariant(variant?: string) {
  switch (variant) {
    case 'error':
    case 'danger':
      return 'destructive' as const
    case 'success':
      return 'secondary' as const
    case 'warning':
    case 'info':
    case 'blue':
    case 'cyan':
      return 'outline' as const
    default:
      return 'secondary' as const
  }
}

function resolveColor(color?: string, fallback = palette.info) {
  switch (color) {
    case 'success':
    case 'green':
      return palette.success
    case 'error':
    case 'danger':
    case 'red':
      return palette.danger
    case 'warning':
    case 'yellow':
      return palette.warning
    case 'muted':
    case 'gray':
      return palette.secondaryText
    case 'info':
    case 'blue':
    case 'cyan':
      return palette.info
    default:
      return color ?? fallback
  }
}

function renderValue(value: unknown): ReactNode {
  if (value == null) {
    return null
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return JSON.stringify(value)
}

function createKey(...parts: unknown[]) {
  return parts
    .map((part) => {
      if (typeof part === 'string' || typeof part === 'number' || typeof part === 'boolean') {
        return String(part)
      }

      return JSON.stringify(part)
    })
    .join(':')
}
