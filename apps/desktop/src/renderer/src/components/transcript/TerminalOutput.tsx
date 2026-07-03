import { Check, Copy } from 'lucide-react'
import type { ReactNode } from 'react'
import { memo, useCallback, useMemo, useState } from 'react'

// biome-ignore lint/complexity/useRegexLiterals: the escaped constructor form avoids control-character lint noise here
const ANSI_REGEX = new RegExp(
  String.raw`\u001b\[[0-9;]*[A-Za-z]|\u001b\][^\u0007]*\u0007|\u001b[^[\]]`,
  'gu',
)

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '')
}

interface TerminalOutputProps {
  command: string | null
  output: string
  exitCode?: number | null
}

export const TerminalOutput = memo(function TerminalOutput({
  command,
  output,
  exitCode,
}: TerminalOutputProps) {
  const cleanOutput = useMemo(() => stripAnsi(output).trim(), [output])
  const [copiedCommand, setCopiedCommand] = useState(false)
  const [copiedOutput, setCopiedOutput] = useState(false)

  const handleCopyCommand = useCallback(() => {
    if (!command) return
    navigator.clipboard.writeText(command)
    setCopiedCommand(true)
    setTimeout(() => setCopiedCommand(false), 1500)
  }, [command])

  const handleCopyOutput = useCallback(() => {
    if (!cleanOutput) return
    navigator.clipboard.writeText(cleanOutput)
    setCopiedOutput(true)
    setTimeout(() => setCopiedOutput(false), 1500)
  }, [cleanOutput])

  return (
    <div className="min-w-0 pl-3">
      {command ? (
        <section className="group/cmd min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2">
            <SectionLabel>Command</SectionLabel>
            <CopyButton
              label="Copy command"
              copied={copiedCommand}
              disabled={!command}
              onClick={handleCopyCommand}
            />
          </div>
          <pre className="min-w-0 overflow-x-auto rounded-sm bg-fd-surface/25 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-fd-secondary whitespace-pre-wrap break-words select-text">
            {command}
          </pre>
        </section>
      ) : null}

      <section className={command ? 'group/output mt-2.5 min-w-0' : 'group/output min-w-0'}>
        <div className="mb-1 flex items-center justify-between gap-2 border-t border-fd-border-subtle/60 pt-2">
          <div className="flex min-w-0 items-center gap-2">
            <SectionLabel>Output</SectionLabel>
            {exitCode !== null && exitCode !== undefined ? (
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-medium ${
                  exitCode === 0 ? 'bg-fd-ready/10 text-fd-ready' : 'bg-fd-danger/10 text-fd-danger'
                }`}
              >
                exit {exitCode}
              </span>
            ) : null}
          </div>
          {cleanOutput ? (
            <CopyButton label="Copy output" copied={copiedOutput} onClick={handleCopyOutput} />
          ) : null}
        </div>
        <pre className="min-w-0 overflow-x-auto px-0 py-0.5 font-mono text-[11px] leading-relaxed text-fd-secondary whitespace-pre-wrap break-words select-text">
          {cleanOutput || 'No output'}
        </pre>
      </section>
    </div>
  )
})

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-medium tracking-[0.12em] text-fd-tertiary uppercase">
      {children}
    </span>
  )
}

function CopyButton({
  label,
  copied,
  disabled = false,
  onClick,
}: {
  label: string
  copied: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-fd-tertiary opacity-70 transition-colors hover:bg-fd-surface hover:text-fd-secondary hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fd-ember-400 disabled:pointer-events-none disabled:opacity-30"
      onClick={onClick}
    >
      {copied ? <Check className="size-3 text-fd-ready" /> : <Copy className="size-3" />}
    </button>
  )
}
