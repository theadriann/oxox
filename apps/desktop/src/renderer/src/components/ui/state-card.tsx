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
    <div className={cn('ox-state-card px-4 py-4', className)}>
      <div className="ox-state-card-icon flex size-8 items-center justify-center">
        <Icon className="size-3.5" />
      </div>
      <p className="ox-label mt-3">{eyebrow}</p>
      <h3 className="ox-title mt-1 text-sm">{title}</h3>
      <p className="ox-description mt-1 max-w-lg text-xs">{description}</p>
      {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
