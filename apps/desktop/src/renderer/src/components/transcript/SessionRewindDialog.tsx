import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import {
  ArrowRight,
  Check,
  FileCode2,
  FileMinus2,
  FileWarning,
  RotateCcw,
  Search,
} from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'

export interface SessionRewindMessageOption {
  value: string
  label: string
  role?: string
}

interface SessionRewindDialogProps {
  open: boolean
  messageOptions: SessionRewindMessageOption[]
  selectedMessageId: string
  forkTitle: string
  rewindInfo: RewindInfo | null
  selectedRestoreFilePaths: string[]
  selectedDeleteFilePaths: string[]
  isLoadingInfo: boolean
  isExecuting: boolean
  error: string | null
  onMessageIdChange: (value: string) => void
  onForkTitleChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onRefreshInfo: () => void
  onToggleRestoreFile: (filePath: string) => void
  onToggleDeleteFile: (filePath: string) => void
  onSubmit: () => void
}

interface RewindInfo {
  availableFiles: Array<{ filePath: string; contentHash?: string; size?: number }>
  createdFiles: Array<{ filePath: string }>
  evictedFiles: Array<{ filePath: string; reason: string }>
}

type Step = 'pick-message' | 'review-files'

export function SessionRewindDialog({
  open,
  messageOptions,
  selectedMessageId,
  forkTitle,
  rewindInfo,
  selectedRestoreFilePaths,
  selectedDeleteFilePaths,
  isLoadingInfo,
  isExecuting,
  error,
  onMessageIdChange,
  onForkTitleChange,
  onOpenChange,
  onRefreshInfo,
  onToggleRestoreFile,
  onToggleDeleteFile,
  onSubmit,
}: SessionRewindDialogProps) {
  const [step, setStep] = useState<Step>('pick-message')
  const [messageSearch, setMessageSearch] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setStep('pick-message')
      setMessageSearch('')
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (rewindInfo && step === 'pick-message') {
      setStep('review-files')
      window.requestAnimationFrame(() => titleInputRef.current?.focus())
    }
  }, [rewindInfo, step])

  const handleSelectMessage = useCallback(
    (messageId: string) => {
      onMessageIdChange(messageId)
      onRefreshInfo()
    },
    [onMessageIdChange, onRefreshInfo],
  )

  const handleBack = useCallback(() => {
    setStep('pick-message')
    setMessageSearch('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (isExecuting || !rewindInfo || !selectedMessageId.trim() || !forkTitle.trim()) return
      onSubmit()
    },
    [isExecuting, rewindInfo, selectedMessageId, forkTitle, onSubmit],
  )

  const totalRestore = rewindInfo?.availableFiles.length ?? 0
  const totalDelete = rewindInfo?.createdFiles.length ?? 0
  const totalEvicted = rewindInfo?.evictedFiles.length ?? 0
  const selectedRestore = selectedRestoreFilePaths.length
  const selectedDelete = selectedDeleteFilePaths.length

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-fd-overlay/95 backdrop-blur-[12px]" />
        <Dialog.Content
          aria-label="Rewind session"
          className="fixed left-1/2 top-[18vh] z-50 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[24px] border border-fd-border-strong bg-fd-elevated shadow-[var(--fd-shadow-md)] outline-none"
        >
          <Dialog.Title className="sr-only">Rewind session</Dialog.Title>
          <Dialog.Description className="sr-only">
            Select a message to rewind to, then review which files will be restored or deleted.
          </Dialog.Description>

          <div className="overflow-hidden rounded-[24px] border border-fd-border-default bg-fd-elevated">
            <RewindHeader step={step} isLoadingInfo={isLoadingInfo} onBack={handleBack} />

            {step === 'pick-message' ? (
              <MessagePicker
                inputRef={inputRef}
                search={messageSearch}
                onSearchChange={setMessageSearch}
                options={messageOptions}
                selectedMessageId={selectedMessageId}
                isLoading={isLoadingInfo}
                onSelect={handleSelectMessage}
              />
            ) : (
              <form onSubmit={handleSubmit}>
                <FileReviewPanel
                  titleInputRef={titleInputRef}
                  forkTitle={forkTitle}
                  onForkTitleChange={onForkTitleChange}
                  rewindInfo={rewindInfo}
                  selectedRestoreFilePaths={selectedRestoreFilePaths}
                  selectedDeleteFilePaths={selectedDeleteFilePaths}
                  onToggleRestoreFile={onToggleRestoreFile}
                  onToggleDeleteFile={onToggleDeleteFile}
                  error={error}
                />
                <RewindFooter
                  totalRestore={totalRestore}
                  totalDelete={totalDelete}
                  totalEvicted={totalEvicted}
                  selectedRestore={selectedRestore}
                  selectedDelete={selectedDelete}
                  isExecuting={isExecuting}
                  canSubmit={
                    !isExecuting &&
                    !!rewindInfo &&
                    selectedMessageId.trim().length > 0 &&
                    forkTitle.trim().length > 0
                  }
                  onCancel={() => onOpenChange(false)}
                />
              </form>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function RewindHeader({
  step,
  isLoadingInfo,
  onBack,
}: {
  step: Step
  isLoadingInfo: boolean
  onBack: () => void
}) {
  return (
    <div className="flex items-center gap-3 border-b border-fd-border-subtle px-4 py-3">
      <div className="flex size-10 items-center justify-center rounded-[14px] border border-fd-border-default bg-fd-panel text-fd-ember-400">
        <RotateCcw className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-[0.16em] text-fd-secondary">
          {step === 'pick-message' ? 'Rewind · Select message' : 'Rewind · Review files'}
        </p>
        <p className="mt-0.5 text-sm text-fd-primary">
          {step === 'pick-message'
            ? 'Choose a point in the conversation to rewind to'
            : isLoadingInfo
              ? 'Analyzing session files...'
              : 'Review files and confirm the rewind fork'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {step === 'review-files' && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-fd-border-default bg-fd-panel px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-fd-secondary transition-colors hover:border-fd-border-strong hover:text-fd-primary"
          >
            Back
          </button>
        )}
        <span className="rounded-full border border-fd-border-default bg-fd-panel px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-fd-secondary">
          Esc closes
        </span>
      </div>
    </div>
  )
}

function MessagePicker({
  inputRef,
  search,
  onSearchChange,
  options,
  selectedMessageId,
  isLoading,
  onSelect,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  search: string
  onSearchChange: (value: string) => void
  options: SessionRewindMessageOption[]
  selectedMessageId: string
  isLoading: boolean
  onSelect: (messageId: string) => void
}) {
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options
    const lower = search.toLowerCase()
    return options.filter((opt) => opt.label.toLowerCase().includes(lower))
  }, [options, search])

  return (
    <Command label="Select message" shouldFilter={false} loop>
      <div className="px-4 py-2">
        <div className="flex items-center gap-2 rounded-[14px] border border-fd-border-default bg-fd-panel px-3 py-2">
          <Search className="size-4 shrink-0 text-fd-tertiary" />
          <Command.Input
            ref={inputRef}
            aria-label="Search messages"
            value={search}
            onValueChange={onSearchChange}
            placeholder="Filter messages..."
            className="w-full bg-transparent text-sm text-fd-primary outline-none placeholder:text-fd-tertiary"
          />
        </div>
      </div>

      <Command.List className="max-h-[min(45vh,28rem)] overflow-y-auto px-3 pb-3 [scroll-padding-block:0.75rem]">
        <Command.Empty className="rounded-[18px] border border-dashed border-fd-border-default bg-fd-panel px-5 py-6 text-center text-sm text-fd-secondary">
          {options.length === 0
            ? 'No rewindable messages in this session.'
            : `No messages match "${search.trim()}".`}
        </Command.Empty>

        {filteredOptions.map((option) => {
          const isSelected = option.value === selectedMessageId
          return (
            <Command.Item
              key={option.value}
              value={option.label}
              disabled={isLoading}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-[18px] border border-transparent px-3 py-3 text-left outline-none transition-colors',
                'hover:border-fd-border-default hover:bg-fd-panel',
                'data-[selected=true]:border-fd-border-strong data-[selected=true]:bg-fd-panel',
                isLoading && 'pointer-events-none opacity-50',
              )}
              onSelect={() => onSelect(option.value)}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-fd-border-default bg-fd-surface text-fd-ember-400">
                {isSelected ? <Check className="size-3.5" /> : <ArrowRight className="size-3.5" />}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm text-fd-primary">
                {option.label}
              </span>
            </Command.Item>
          )
        })}
      </Command.List>
    </Command>
  )
}

function FileReviewPanel({
  titleInputRef,
  forkTitle,
  onForkTitleChange,
  rewindInfo,
  selectedRestoreFilePaths,
  selectedDeleteFilePaths,
  onToggleRestoreFile,
  onToggleDeleteFile,
  error,
}: {
  titleInputRef: React.RefObject<HTMLInputElement | null>
  forkTitle: string
  onForkTitleChange: (value: string) => void
  rewindInfo: RewindInfo | null
  selectedRestoreFilePaths: string[]
  selectedDeleteFilePaths: string[]
  onToggleRestoreFile: (filePath: string) => void
  onToggleDeleteFile: (filePath: string) => void
  error: string | null
}) {
  if (!rewindInfo) {
    return (
      <div className="flex items-center justify-center px-5 py-10">
        <div className="flex items-center gap-3 text-fd-secondary">
          <div className="size-5 animate-spin rounded-full border-2 border-fd-border-strong border-t-fd-ember-400" />
          <span className="text-sm">Loading rewind info...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-h-[min(50vh,30rem)] overflow-y-auto">
      <div className="px-4 py-3">
        <label
          htmlFor="session-rewind-title"
          className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-fd-secondary"
        >
          Fork title
        </label>
        <Input
          ref={titleInputRef}
          id="session-rewind-title"
          aria-label="Fork title"
          value={forkTitle}
          onChange={(event) => onForkTitleChange(event.target.value)}
          placeholder="Name for the rewind fork..."
          className="h-9 rounded-[14px] border-fd-border-default bg-fd-panel text-sm text-fd-primary placeholder:text-fd-tertiary"
        />
      </div>

      {error && (
        <div className="mx-4 mb-3 rounded-[14px] border border-fd-ember-400/30 bg-fd-ember-500/10 px-4 py-2.5 text-sm text-fd-ember-400">
          {error}
        </div>
      )}

      <div className="space-y-1 px-3 pb-3">
        {rewindInfo.availableFiles.length > 0 && (
          <FileGroup
            icon={FileCode2}
            title="Restore"
            description="Files will be reverted to their state at the rewind point"
            files={rewindInfo.availableFiles.map((f) => f.filePath)}
            selectedFiles={selectedRestoreFilePaths}
            onToggle={onToggleRestoreFile}
            accentClassName="text-fd-ready"
          />
        )}

        {rewindInfo.createdFiles.length > 0 && (
          <FileGroup
            icon={FileMinus2}
            title="Delete"
            description="Files created after the rewind point will be removed"
            files={rewindInfo.createdFiles.map((f) => f.filePath)}
            selectedFiles={selectedDeleteFilePaths}
            onToggle={onToggleDeleteFile}
            accentClassName="text-[var(--fd-danger)]"
          />
        )}

        {rewindInfo.evictedFiles.length > 0 && (
          <div className="rounded-[18px] border border-fd-border-subtle bg-fd-surface px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <FileWarning className="size-4 text-[var(--fd-warning)]" />
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-fd-secondary">
                Unavailable ({rewindInfo.evictedFiles.length})
              </span>
            </div>
            <ul className="space-y-1.5">
              {rewindInfo.evictedFiles.map((file) => (
                <li key={file.filePath} className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-fd-tertiary">
                    {shortenPath(file.filePath)}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px] text-fd-tertiary">
                    {file.reason}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {rewindInfo.availableFiles.length === 0 &&
          rewindInfo.createdFiles.length === 0 &&
          rewindInfo.evictedFiles.length === 0 && (
            <div className="rounded-[18px] border border-dashed border-fd-border-default bg-fd-panel px-5 py-6 text-center text-sm text-fd-secondary">
              No file changes found for this rewind point.
            </div>
          )}
      </div>
    </div>
  )
}

function FileGroup({
  icon: Icon,
  title,
  description,
  files,
  selectedFiles,
  onToggle,
  accentClassName,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  files: string[]
  selectedFiles: string[]
  onToggle: (filePath: string) => void
  accentClassName: string
}) {
  const allSelected = files.every((f) => selectedFiles.includes(f))
  const noneSelected = files.every((f) => !selectedFiles.includes(f))

  const handleToggleAll = useCallback(() => {
    const targetSelected = !allSelected
    for (const filePath of files) {
      const isSelected = selectedFiles.includes(filePath)
      if (targetSelected !== isSelected) {
        onToggle(filePath)
      }
    }
  }, [allSelected, files, selectedFiles, onToggle])

  return (
    <div className="rounded-[18px] border border-fd-border-subtle bg-fd-surface px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('size-4', accentClassName)} />
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-fd-secondary">
            {title} ({files.length})
          </span>
        </div>
        <button
          type="button"
          onClick={handleToggleAll}
          className="text-[11px] text-fd-secondary transition-colors hover:text-fd-primary"
        >
          {allSelected ? 'Deselect all' : noneSelected ? 'Select all' : 'Select all'}
        </button>
      </div>
      <p className="mb-3 text-xs text-fd-tertiary">{description}</p>
      <ul className="space-y-1">
        {files.map((filePath) => {
          const isChecked = selectedFiles.includes(filePath)
          return (
            <li key={filePath}>
              <div
                role="none"
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-[12px] px-2.5 py-2 transition-colors',
                  'hover:bg-fd-panel',
                  isChecked && 'bg-fd-panel',
                )}
                onClick={() => onToggle(filePath)}
              >
                <Checkbox
                  aria-label={filePath}
                  checked={isChecked}
                  onCheckedChange={() => onToggle(filePath)}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fd-primary">
                  {shortenPath(filePath)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function RewindFooter({
  totalRestore,
  totalDelete,
  totalEvicted,
  selectedRestore,
  selectedDelete,
  isExecuting,
  canSubmit,
  onCancel,
}: {
  totalRestore: number
  totalDelete: number
  totalEvicted: number
  selectedRestore: number
  selectedDelete: number
  isExecuting: boolean
  canSubmit: boolean
  onCancel: () => void
}) {
  return (
    <div className="flex items-center justify-between border-t border-fd-border-subtle px-4 py-3">
      <div className="flex items-center gap-3 text-[11px] tracking-wide text-fd-tertiary">
        {totalRestore > 0 && (
          <span>
            <span className="text-fd-ready">{selectedRestore}</span>/{totalRestore} restore
          </span>
        )}
        {totalDelete > 0 && (
          <span>
            <span className="text-[var(--fd-danger)]">{selectedDelete}</span>/{totalDelete} delete
          </span>
        )}
        {totalEvicted > 0 && <span>{totalEvicted} unavailable</span>}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {isExecuting ? (
            <span className="flex items-center gap-2">
              <div className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Rewinding...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <RotateCcw className="size-3.5" />
              Execute rewind
            </span>
          )}
        </Button>
      </div>
    </div>
  )
}

function shortenPath(filePath: string): string {
  const parts = filePath.split('/')
  if (parts.length <= 3) return filePath
  return `.../${parts.slice(-3).join('/')}`
}
