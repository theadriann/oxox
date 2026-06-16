import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react'
import type { AsyncActionItem } from '../../state/composer/composer.model'
import { Button } from '../ui/button'

interface AsyncActionStackProps {
  actions: AsyncActionItem[]
  onDismiss: (id: string) => void
}

export function AsyncActionStack({ actions, onDismiss }: AsyncActionStackProps) {
  if (actions.length === 0) {
    return null
  }

  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-label="Background actions"
      role="region"
    >
      {actions.map((action) => (
        <div
          key={action.id}
          className="ox-overlay-panel flex items-start gap-3 p-3 shadow-xl"
          role="status"
        >
          <ActionStatusIcon status={action.status} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-fd-primary">{action.title}</div>
            {action.description ? (
              <div className="mt-0.5 line-clamp-2 text-xs text-fd-muted">{action.description}</div>
            ) : null}
          </div>
          {action.status !== 'running' ? (
            <Button
              aria-label="Dismiss background action"
              className="size-6 shrink-0"
              size="icon"
              variant="ghost"
              onClick={() => onDismiss(action.id)}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function ActionStatusIcon({ status }: { status: AsyncActionItem['status'] }) {
  if (status === 'running') {
    return <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-fd-accent" />
  }

  if (status === 'error') {
    return <XCircle className="mt-0.5 size-4 shrink-0 text-fd-ember-400" />
  }

  return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-fd-ready" />
}
