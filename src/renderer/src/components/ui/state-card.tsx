import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface StateCardProps {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  className?: string
}

export function StateCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  className,
}: StateCardProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-dashed border-fd-border-default bg-fd-surface px-4 py-4',
        className,
      )}
    >
      <div className="flex size-8 items-center justify-center rounded-md border border-fd-border-default bg-fd-panel text-fd-ember-400">
        <Icon className="size-3.5" />
      </div>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-fd-tertiary">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-sm font-semibold text-fd-primary">{title}</h3>
      <p className="mt-1 max-w-lg text-xs leading-relaxed text-fd-secondary">{description}</p>
      {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
