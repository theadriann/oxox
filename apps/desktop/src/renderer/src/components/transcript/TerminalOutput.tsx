import { Check, Copy, Terminal } from 'lucide-react'
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
    <div className="overflow-hidden rounded-md border border-fd-border-subtle">
      {command ? (
        <div className="group/cmd flex items-center gap-2 border-b border-fd-border-subtle bg-fd-panel/60 px-3 py-1.5">
          <Terminal className="size-3 shrink-0 text-fd-tertiary" />
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fd-secondary select-text">
            {command}
          </code>
          <div className="flex shrink-0 items-center gap-1.5">
            {exitCode !== null && exitCode !== undefined ? (
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-medium ${
                  exitCode === 0 ? 'bg-fd-ready/10 text-fd-ready' : 'bg-fd-danger/10 text-fd-danger'
                }`}
              >
                exit {exitCode}
              </span>
            ) : null}
            <button
              type="button"
              aria-label="Copy command"
              className="rounded p-0.5 text-fd-tertiary opacity-0 transition-all hover:bg-fd-surface hover:text-fd-secondary group-hover/cmd:opacity-100"
              onClick={handleCopyCommand}
            >
              {copiedCommand ? (
                <Check className="size-3 text-fd-ready" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>
          </div>
        </div>
      ) : null}
      <div className="group/output relative">
        <pre className="overflow-x-auto bg-fd-canvas px-3 py-2 font-mono text-[11px] leading-relaxed text-fd-secondary whitespace-pre-wrap break-words">
          {cleanOutput || 'No output'}
        </pre>
        {cleanOutput ? (
          <button
            type="button"
            aria-label="Copy output"
            className="absolute top-1.5 right-1.5 rounded p-0.5 text-fd-tertiary opacity-0 transition-all hover:bg-fd-surface hover:text-fd-secondary group-hover/output:opacity-100"
            onClick={handleCopyOutput}
          >
            {copiedOutput ? (
              <Check className="size-3 text-fd-ready" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  )
})
