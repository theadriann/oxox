import type { FileContents } from '@pierre/diffs'
import { MultiFileDiff } from '@pierre/diffs/react'
import { Check, Copy, FileCode2, Minus, Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

interface EditDiffViewProps {
  filePath: string
  oldStr: string
  newStr: string
}

export function EditDiffView({ filePath, oldStr, newStr }: EditDiffViewProps) {
  const fileName = extractFileName(filePath)

  const oldFile = useMemo<FileContents>(
    () => ({ name: fileName, contents: oldStr }),
    [fileName, oldStr],
  )
  const newFile = useMemo<FileContents>(
    () => ({ name: fileName, contents: newStr }),
    [fileName, newStr],
  )

  return (
    <div className="overflow-hidden rounded-md border border-fd-border-subtle">
      <div className="flex items-center justify-between gap-3 border-b border-fd-border-subtle bg-fd-panel/70 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="size-3 shrink-0 text-fd-secondary" />
          <span className="truncate font-mono text-[11px] text-fd-secondary">{fileName}</span>
          <span className="truncate text-[10px] text-fd-tertiary">{filePath}</span>
        </div>
      </div>
      <div className="diffs-container">
        <MultiFileDiff
          oldFile={oldFile}
          newFile={newFile}
          options={{
            theme: 'pierre-dark',
            diffStyle: 'unified',
            diffIndicators: 'classic',
            disableFileHeader: true,
            disableLineNumbers: true,
            overflow: 'scroll',
            lineDiffType: 'word-alt',
            hunkSeparators: 'simple',
          }}
        />
      </div>
    </div>
  )
}

interface PatchFilePreview {
  action: 'add' | 'update'
  path: string
  addedCount: number
  removedCount: number
  oldContent: string
  newContent: string
}

interface PatchDiffPreviewProps {
  patchText: string
  summary: string
  isError: boolean
}

export function PatchDiffPreview({ patchText, summary, isError }: PatchDiffPreviewProps) {
  const files = useMemo(() => parsePatchToFiles(patchText), [patchText])
  const totals = useMemo(
    () =>
      files.reduce(
        (acc, file) => ({
          addedCount: acc.addedCount + file.addedCount,
          removedCount: acc.removedCount + file.removedCount,
        }),
        { addedCount: 0, removedCount: 0 },
      ),
    [files],
  )
  const [copiedPatch, setCopiedPatch] = useState(false)

  const handleCopyPatch = useCallback(() => {
    navigator.clipboard.writeText(patchText)
    setCopiedPatch(true)
    setTimeout(() => setCopiedPatch(false), 1500)
  }, [patchText])

  return (
    <div className="min-w-0 overflow-hidden" data-testid="apply-patch-preview">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              isError ? 'bg-fd-danger/10 text-fd-danger' : 'bg-fd-ready/10 text-fd-ready'
            }`}
          >
            {summary}
          </span>
          <span className="font-mono text-[10px] text-fd-tertiary">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </span>
          {totals.addedCount > 0 ? <ChangeCount tone="add" count={totals.addedCount} /> : null}
          {totals.removedCount > 0 ? (
            <ChangeCount tone="remove" count={totals.removedCount} />
          ) : null}
        </div>
        <CopyPatchButton copied={copiedPatch} onClick={handleCopyPatch} />
      </div>

      <div className="flex flex-col gap-3">
        {files.map((file) => (
          <PatchFileDiff key={file.path} file={file} />
        ))}
      </div>
    </div>
  )
}

function PatchFileDiff({ file }: { file: PatchFilePreview }) {
  const fileName = extractFileName(file.path)
  const hasChanges = file.oldContent !== file.newContent

  const oldFile = useMemo<FileContents>(
    () => ({ name: fileName, contents: file.oldContent }),
    [fileName, file.oldContent],
  )
  const newFile = useMemo<FileContents>(
    () => ({ name: fileName, contents: file.newContent }),
    [fileName, file.newContent],
  )

  return (
    <section className="min-w-0">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <FileCode2 className="size-3 shrink-0 text-fd-tertiary" />
            <span className="truncate font-mono text-[11px] font-medium text-fd-secondary">
              {fileName}
            </span>
            <span className="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] text-fd-tertiary bg-fd-surface/70">
              {file.action === 'add' ? 'created' : 'updated'}
            </span>
          </div>
          <div className="mt-0.5 break-all font-mono text-[10px] leading-relaxed text-fd-tertiary">
            {file.path}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px]">
          {file.addedCount > 0 ? <ChangeCount tone="add" count={file.addedCount} /> : null}
          {file.removedCount > 0 ? <ChangeCount tone="remove" count={file.removedCount} /> : null}
        </div>
      </div>

      {hasChanges ? (
        <div className="diffs-container overflow-hidden rounded-sm border border-fd-border-subtle/60">
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={{
              theme: 'pierre-dark',
              diffStyle: 'unified',
              diffIndicators: 'classic',
              disableFileHeader: true,
              disableLineNumbers: true,
              overflow: 'scroll',
              lineDiffType: 'word-alt',
              hunkSeparators: 'simple',
            }}
          />
        </div>
      ) : (
        <div className="rounded-sm bg-fd-surface/30 px-2 py-1.5 text-[11px] text-fd-tertiary italic">
          New file (no previous content)
        </div>
      )}
    </section>
  )
}

function ChangeCount({ tone, count }: { tone: 'add' | 'remove'; count: number }) {
  const isAdd = tone === 'add'
  const Icon = isAdd ? Plus : Minus

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-[10px] ${
        isAdd ? 'text-fd-ready' : 'text-fd-danger'
      }`}
    >
      <Icon className="size-2.5" />
      {count}
    </span>
  )
}

function CopyPatchButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Copy patch"
      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-fd-tertiary opacity-70 transition-colors hover:bg-fd-surface hover:text-fd-secondary hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fd-ember-400"
      onClick={onClick}
    >
      {copied ? <Check className="size-3 text-fd-ready" /> : <Copy className="size-3" />}
    </button>
  )
}

/**
 * Parses the custom ApplyPatch format into old/new file pairs
 * for rendering with @pierre/diffs MultiFileDiff.
 */
function parsePatchToFiles(patchText: string): PatchFilePreview[] {
  const lines = patchText.replaceAll('\r\n', '\n').split('\n')
  const files: PatchFilePreview[] = []
  let currentFile: PatchFilePreview | null = null
  let contextLines: string[] = []

  const flushContext = () => {
    if (!currentFile || contextLines.length === 0) return
    // Context lines belong to both old and new
    currentFile.oldContent += `${contextLines.join('\n')}\n`
    currentFile.newContent += `${contextLines.join('\n')}\n`
    contextLines = []
  }

  for (const line of lines) {
    if (
      !line ||
      line === '*** Begin Patch' ||
      line === '*** End Patch' ||
      line === '*** End of File'
    ) {
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      flushContext()
      currentFile = {
        action: 'update',
        path: line.slice('*** Update File: '.length).trim(),
        addedCount: 0,
        removedCount: 0,
        oldContent: '',
        newContent: '',
      }
      files.push(currentFile)
      contextLines = []
      continue
    }

    if (line.startsWith('*** Add File: ')) {
      flushContext()
      currentFile = {
        action: 'add',
        path: line.slice('*** Add File: '.length).trim(),
        addedCount: 0,
        removedCount: 0,
        oldContent: '',
        newContent: '',
      }
      files.push(currentFile)
      contextLines = []
      continue
    }

    if (!currentFile) continue

    if (line.startsWith('@@')) {
      flushContext()
      continue
    }

    const prefix = line[0]
    const content = line.slice(1)

    if (prefix === '+') {
      flushContext()
      currentFile.addedCount += 1
      currentFile.newContent += `${content}\n`
    } else if (prefix === '-') {
      flushContext()
      currentFile.removedCount += 1
      currentFile.oldContent += `${content}\n`
    } else if (prefix === ' ') {
      flushContext()
      currentFile.oldContent += `${content}\n`
      currentFile.newContent += `${content}\n`
    } else {
      // Treat as context
      contextLines.push(line)
    }
  }

  flushContext()
  return files
}

function extractFileName(path: string): string {
  const segments = path.split('/')
  return segments.at(-1) ?? path
}
