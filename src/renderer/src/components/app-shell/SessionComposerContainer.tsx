import type { ReactNode } from 'react'

export interface SessionComposerContainerProps {
  error: string | null
  children: ReactNode
}

export function SessionComposerContainer({ error, children }: SessionComposerContainerProps) {
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p className="rounded-md border border-fd-ember-400/30 bg-fd-ember-500/10 px-3 py-2 text-sm text-fd-ember-400">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  )
}
