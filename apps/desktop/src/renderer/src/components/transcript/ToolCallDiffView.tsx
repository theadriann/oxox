import type { FileContents } from '@pierre/diffs'
import { MultiFileDiff } from '@pierre/diffs/react'
import { FileCode2, Minus, Plus } from 'lucide-react'
import { useMemo } from 'react'

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

  return (
    <div className="flex flex-col gap-2 overflow-hidden">
      <div className="flex items-center gap-2 px-1">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            isError ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {summary}
        </span>
        <span className="text-[10px] text-fd-tertiary">
          {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
      </div>

      {files.map((file) => (
        <PatchFileDiff key={file.path} file={file} />
      ))}
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
    <div className="overflow-hidden rounded-md border border-fd-border-subtle">
      <div className="flex items-center justify-between gap-3 border-b border-fd-border-subtle bg-fd-panel/70 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="size-3 shrink-0 text-fd-secondary" />
          <span className="truncate font-mono text-[11px] text-fd-secondary">{fileName}</span>
          <span className="truncate text-[10px] text-fd-tertiary">{file.path}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px]">
          {file.addedCount > 0 ? (
            <span className="flex items-center gap-0.5 text-emerald-400">
              <Plus className="size-2.5" />
              {file.addedCount}
            </span>
          ) : null}
          {file.removedCount > 0 ? (
            <span className="flex items-center gap-0.5 text-rose-400">
              <Minus className="size-2.5" />
              {file.removedCount}
            </span>
          ) : null}
        </div>
      </div>

      {hasChanges ? (
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
      ) : (
        <div className="bg-fd-surface px-3 py-2 text-[11px] text-fd-tertiary italic">
          New file (no previous content)
        </div>
      )}
    </div>
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
