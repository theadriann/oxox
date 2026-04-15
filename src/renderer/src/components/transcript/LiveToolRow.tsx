import { CheckCircle2, ChevronDown, ChevronRight, XCircle } from 'lucide-react'
import { memo, useCallback, useMemo } from 'react'

import { MarkdownRenderer } from './MarkdownRenderer'
import { TerminalOutput } from './TerminalOutput'
import { TodoWriteView } from './TodoWriteView'
import { EditDiffView, PatchDiffPreview } from './ToolCallDiffView'
import type { ToolTimelineItem } from './timelineTypes'
import { getToolContextLabel } from './toolContextLabel'
import { WebSearchView } from './WebSearchView'

const statusConfig = {
  completed: { dot: 'bg-fd-ready', label: 'Completed' },
  failed: { dot: 'bg-fd-danger', label: 'Failed' },
  running: { dot: 'bg-fd-warning animate-pulse', label: 'Running' },
} as const

export interface LiveToolRowProps {
  item: ToolTimelineItem
  expanded: boolean
  onToggleTool: (toolUseId: string) => void
}

export const LiveToolRow = memo(function LiveToolRow({
  item,
  expanded,
  onToggleTool,
}: LiveToolRowProps) {
  const handleToggle = useCallback(() => {
    onToggleTool(item.toolUseId)
  }, [onToggleTool, item.toolUseId])

  const contextLabel = useMemo(
    () => getToolContextLabel(item.toolName, item.inputMarkdown),
    [item.toolName, item.inputMarkdown],
  )

  const label = contextLabel ?? item.progressSummary
  const diffView = useMemo(() => getDiffView(item), [item])
  const executeData = useMemo(() => getExecuteData(item), [item])
  const webSearchData = useMemo(() => getWebSearchData(item), [item])
  const config = statusConfig[item.status]

  return (
    <div>
      <button
        aria-expanded={expanded}
        aria-label={`Toggle details for ${item.toolName}`}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-fd-surface/40"
        type="button"
        onClick={handleToggle}
      >
        <span className={`size-1.5 shrink-0 rounded-full ${config.dot}`} />
        <span className="shrink-0 font-mono text-[11px] font-medium text-fd-secondary">
          {item.toolName}
        </span>
        {label ? (
          <span className="min-w-0 flex-1 truncate pl-0.5 font-mono text-[10px] text-fd-tertiary">
            {label}
          </span>
        ) : null}
        {item.status === 'failed' ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium bg-fd-danger/10 text-fd-danger">
            failed
          </span>
        ) : null}
        <span className="shrink-0 text-fd-tertiary">
          {expanded ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
        </span>
      </button>

      {expanded ? (
        <ExpandedContent
          item={item}
          diffView={diffView}
          executeData={executeData}
          webSearchData={webSearchData}
        />
      ) : null}
    </div>
  )
})

function ExpandedContent({
  item,
  diffView,
  executeData,
  webSearchData,
}: {
  item: ToolTimelineItem
  diffView: DiffViewData | null
  executeData: ExecuteData | null
  webSearchData: WebSearchData | null
}) {
  if (diffView) {
    return (
      <div className="tool-call-expanded-content px-2.5 py-2">
        {diffView.type === 'edit' ? (
          <EditDiffView
            filePath={diffView.filePath}
            oldStr={diffView.oldStr}
            newStr={diffView.newStr}
          />
        ) : (
          <PatchDiffPreview
            patchText={diffView.patchText}
            summary={diffView.summary}
            isError={diffView.isError}
          />
        )}
        <DiffResultStatus isError={item.resultIsError} hasResult={item.resultMarkdown !== null} />
      </div>
    )
  }

  if (executeData) {
    return (
      <div className="tool-call-expanded-content px-2.5 py-2">
        <TerminalOutput
          command={executeData.command}
          output={item.resultMarkdown ?? ''}
          exitCode={executeData.exitCode}
        />
      </div>
    )
  }

  if (webSearchData) {
    return (
      <div className="tool-call-expanded-content px-2.5 py-2">
        <WebSearchView query={webSearchData.query} resultMarkdown={item.resultMarkdown} />
      </div>
    )
  }

  if (item.toolName.toLowerCase() === 'todowrite') {
    return (
      <div className="tool-call-expanded-content">
        <TodoWriteView inputMarkdown={item.inputMarkdown} />
      </div>
    )
  }

  return (
    <div className="tool-call-expanded-content">
      {item.inputMarkdown ? (
        <div className="tool-call-section px-3 py-2">
          <SectionLabel>Input</SectionLabel>
          <div className="overflow-x-auto rounded-md border border-fd-border-subtle bg-fd-canvas px-3 py-2">
            <MarkdownRenderer markdown={item.inputMarkdown} />
          </div>
        </div>
      ) : null}

      {item.progressHistory.length > 0 ? (
        <div className="tool-call-section px-3 py-2">
          <SectionLabel>Progress</SectionLabel>
          <ul className="flex flex-col gap-0.5">
            {item.progressHistory.map((entry) => (
              <li
                key={`${item.toolUseId}-${entry}`}
                className="flex items-center gap-1.5 text-[11px] text-fd-tertiary"
              >
                <span className="size-1 shrink-0 rounded-full bg-fd-border-default" />
                {entry}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="tool-call-section px-3 py-2">
        <SectionLabel>Result</SectionLabel>
        {item.resultMarkdown ? (
          <div className="overflow-x-auto rounded-md border border-fd-border-subtle bg-fd-canvas px-3 py-2">
            <MarkdownRenderer markdown={item.resultMarkdown} />
          </div>
        ) : (
          <p className="px-1 text-[11px] text-fd-tertiary italic">Result pending...</p>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
      {children}
    </p>
  )
}

function DiffResultStatus({ isError, hasResult }: { isError: boolean; hasResult: boolean }) {
  if (!hasResult) return null

  if (isError) {
    return (
      <div className="mt-2 flex items-center gap-1.5 px-1">
        <XCircle className="size-3 text-fd-danger" />
        <span className="text-[11px] font-medium text-fd-danger">Failed to apply</span>
      </div>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-1.5 px-1">
      <CheckCircle2 className="size-3 text-fd-ready" />
      <span className="text-[11px] text-fd-tertiary">Applied successfully</span>
    </div>
  )
}

type DiffViewData =
  | { type: 'edit'; filePath: string; oldStr: string; newStr: string }
  | { type: 'apply-patch'; patchText: string; summary: string; isError: boolean }

function getDiffView(item: ToolTimelineItem): DiffViewData | null {
  const lower = item.toolName.toLowerCase()

  if (lower === 'edit' && item.inputMarkdown) {
    const parsed = parseInputJson(item.inputMarkdown)
    if (parsed && typeof parsed.file_path === 'string') {
      return {
        type: 'edit',
        filePath: parsed.file_path as string,
        oldStr: typeof parsed.old_str === 'string' ? (parsed.old_str as string) : '',
        newStr: typeof parsed.new_str === 'string' ? (parsed.new_str as string) : '',
      }
    }
  }

  if (lower === 'applypatch' && item.inputMarkdown) {
    const patchText = extractApplyPatchText(item.inputMarkdown)
    if (patchText) {
      return {
        type: 'apply-patch',
        patchText,
        summary: item.status === 'failed' ? 'Failed' : 'Patch',
        isError: item.resultIsError,
      }
    }
  }

  return null
}

function extractApplyPatchText(inputMarkdown: string): string | null {
  const parsed = parseInputJson(inputMarkdown)
  if (typeof parsed?.input === 'string' && parsed.input.includes('*** Begin Patch')) {
    return parsed.input
  }
  return inputMarkdown.includes('*** Begin Patch') ? inputMarkdown : null
}

function parseInputJson(inputMarkdown: string): Record<string, unknown> | null {
  const trimmed = inputMarkdown.trim()
  const fencedMatch = trimmed.match(/^```(?:json)?\n([\s\S]*?)\n```$/)
  const jsonText = fencedMatch ? fencedMatch[1] : trimmed
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

interface ExecuteData {
  command: string | null
  exitCode: number | null
}

function getExecuteData(item: ToolTimelineItem): ExecuteData | null {
  if (item.toolName.toLowerCase() !== 'execute') return null

  const parsed = item.inputMarkdown ? parseInputJson(item.inputMarkdown) : null
  const command = parsed && typeof parsed.command === 'string' ? parsed.command : null

  let exitCode: number | null = null
  if (item.resultMarkdown) {
    const match = item.resultMarkdown.match(/\[Process exited with code (\d+)\]/)
    if (match?.[1]) exitCode = Number.parseInt(match[1], 10)
  }

  return { command, exitCode }
}

interface WebSearchData {
  query: string | null
}

function getWebSearchData(item: ToolTimelineItem): WebSearchData | null {
  if (item.toolName.toLowerCase() !== 'websearch') return null

  const parsed = item.inputMarkdown ? parseInputJson(item.inputMarkdown) : null
  const query = parsed && typeof parsed.query === 'string' ? parsed.query : null

  return { query }
}
