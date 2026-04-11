import { CheckCircle2, ChevronDown, ChevronRight, XCircle } from 'lucide-react'
import { memo, useMemo } from 'react'

import type { TranscriptToolCallEntry } from '../../../../shared/ipc/contracts'
import { MarkdownRenderer } from './MarkdownRenderer'
import { TerminalOutput } from './TerminalOutput'
import { EditDiffView, PatchDiffPreview } from './ToolCallDiffView'
import { TodoWriteView } from './TodoWriteView'
import { getToolContextLabel } from './toolContextLabel'
import { WebSearchView } from './WebSearchView'

const statusConfig = {
  completed: { dot: 'bg-fd-ready', label: 'Completed' },
  failed: { dot: 'bg-fd-danger', label: 'Failed' },
  running: { dot: 'bg-fd-warning animate-pulse', label: 'Running' },
} as const

export interface ToolCallCardProps {
  entry: TranscriptToolCallEntry
  expanded: boolean
  onToggle: () => void
}

export const ToolCallCard = memo(function ToolCallCard({
  entry,
  expanded,
  onToggle,
}: ToolCallCardProps) {
  const contextLabel = useMemo(
    () => getToolContextLabel(entry.toolName, entry.inputMarkdown),
    [entry.toolName, entry.inputMarkdown],
  )

  const diffView = useMemo(() => getDiffView(entry), [entry])
  const executeData = useMemo(() => getExecuteData(entry), [entry])
  const webSearchData = useMemo(() => getWebSearchData(entry), [entry])
  const config = statusConfig[entry.status]

  return (
    <div>
      <button
        aria-expanded={expanded}
        aria-label={`Toggle details for ${entry.toolName}`}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-fd-surface/40"
        type="button"
        onClick={onToggle}
      >
        <span className={`size-1.5 shrink-0 rounded-full ${config.dot}`} />
        <span className="shrink-0 font-mono text-[11px] font-medium text-fd-secondary">
          {entry.toolName}
        </span>
        {contextLabel ? (
          <span className="min-w-0 flex-1 truncate pl-0.5 font-mono text-[10px] text-fd-tertiary">
            {contextLabel}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {entry.status === 'failed' ? (
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
          entry={entry}
          diffView={diffView}
          executeData={executeData}
          webSearchData={webSearchData}
        />
      ) : null}
    </div>
  )
})

function ExpandedContent({
  entry,
  diffView,
  executeData,
  webSearchData,
}: {
  entry: TranscriptToolCallEntry
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
        <DiffResultStatus isError={entry.resultIsError} hasResult={entry.resultMarkdown !== null} />
      </div>
    )
  }

  if (executeData) {
    return (
      <div className="tool-call-expanded-content px-2.5 py-2">
        <TerminalOutput
          command={executeData.command}
          output={entry.resultMarkdown ?? ''}
          exitCode={executeData.exitCode}
        />
      </div>
    )
  }

  if (webSearchData) {
    return (
      <div className="tool-call-expanded-content px-2.5 py-2">
        <WebSearchView query={webSearchData.query} resultMarkdown={entry.resultMarkdown} />
      </div>
    )
  }

  if (entry.toolName.toLowerCase() === 'todowrite') {
    return (
      <div className="tool-call-expanded-content">
        <TodoWriteView inputMarkdown={entry.inputMarkdown} />
      </div>
    )
  }

  return (
    <div className="tool-call-expanded-content">
      {entry.inputMarkdown ? (
        <div className="tool-call-section px-3 py-2">
          <SectionLabel>Input</SectionLabel>
          <div className="overflow-x-auto rounded-md border border-fd-border-subtle bg-fd-canvas px-3 py-2">
            <MarkdownRenderer markdown={entry.inputMarkdown} />
          </div>
        </div>
      ) : null}

      <div className="tool-call-section px-3 py-2">
        <SectionLabel>Result</SectionLabel>
        {entry.resultMarkdown ? (
          <div className="overflow-x-auto rounded-md border border-fd-border-subtle bg-fd-canvas px-3 py-2">
            <MarkdownRenderer markdown={entry.resultMarkdown} />
          </div>
        ) : (
          <p className="px-1 text-[11px] text-fd-tertiary italic">Pending...</p>
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

function DiffResultStatus({
  isError,
  hasResult,
}: {
  isError: boolean
  hasResult: boolean
}) {
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

function getDiffView(entry: TranscriptToolCallEntry): DiffViewData | null {
  const lower = entry.toolName.toLowerCase()

  if (lower === 'edit') {
    const parsed = parseMarkdownJson(entry.inputMarkdown)
    if (parsed && typeof parsed.file_path === 'string') {
      return {
        type: 'edit',
        filePath: parsed.file_path as string,
        oldStr: typeof parsed.old_str === 'string' ? (parsed.old_str as string) : '',
        newStr: typeof parsed.new_str === 'string' ? (parsed.new_str as string) : '',
      }
    }
  }

  if (lower === 'applypatch') {
    const patchText = extractApplyPatchText(entry.inputMarkdown)
    if (patchText) {
      const files = parsePatchToQuickSummary(patchText)
      const summary = getApplyPatchSummary(entry, files)
      return { type: 'apply-patch', patchText, summary, isError: entry.resultIsError }
    }
  }

  return null
}

function extractApplyPatchText(inputMarkdown: string | null): string | null {
  if (!inputMarkdown) return null
  const parsed = parseMarkdownJson(inputMarkdown)
  if (typeof parsed?.input === 'string' && parsed.input.includes('*** Begin Patch')) {
    return parsed.input
  }
  return inputMarkdown.includes('*** Begin Patch') ? inputMarkdown : null
}

function parsePatchToQuickSummary(patchText: string): { action: string }[] {
  const files: { action: string }[] = []
  for (const line of patchText.split('\n')) {
    if (line.startsWith('*** Update File: ') || line.startsWith('*** Add File: ')) {
      files.push({ action: line.startsWith('*** Add') ? 'add' : 'update' })
    }
  }
  return files
}

function getApplyPatchSummary(entry: TranscriptToolCallEntry, files: { action: string }[]): string {
  if (entry.resultIsError) return 'Failed'
  const result = parseMarkdownJson(entry.resultMarkdown)
  if (result?.success === false) return 'Failed'
  if (files.length > 1) return `${files.length} files`
  return files[0]?.action === 'add' ? 'Created' : 'Edited'
}

interface ExecuteData {
  command: string | null
  exitCode: number | null
}

function getExecuteData(entry: TranscriptToolCallEntry): ExecuteData | null {
  const lower = entry.toolName.toLowerCase()
  if (lower !== 'execute') return null

  const parsed = parseMarkdownJson(entry.inputMarkdown)
  const command = parsed && typeof parsed.command === 'string' ? parsed.command : null

  let exitCode: number | null = null
  if (entry.resultMarkdown) {
    const match = entry.resultMarkdown.match(/\[Process exited with code (\d+)\]/)
    if (match?.[1]) exitCode = Number.parseInt(match[1], 10)
  }

  return { command, exitCode }
}

interface WebSearchData {
  query: string | null
}

function getWebSearchData(entry: TranscriptToolCallEntry): WebSearchData | null {
  const lower = entry.toolName.toLowerCase()
  if (lower !== 'websearch') return null

  const parsed = parseMarkdownJson(entry.inputMarkdown)
  const query = parsed && typeof parsed.query === 'string' ? parsed.query : null

  return { query }
}

function parseMarkdownJson(markdown: string | null | undefined): Record<string, unknown> | null {
  if (!markdown) return null
  const trimmed = markdown.trim()
  const fencedMatch = trimmed.match(/^```(?:json)?\n([\s\S]*?)\n```$/)
  const jsonText = fencedMatch ? fencedMatch[1] : trimmed
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
