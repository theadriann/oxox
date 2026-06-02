import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import type { ContentLayout } from '../../state/ui/ui.model'

interface ContentContainerProps {
  layout: ContentLayout
  children: ReactNode
  className?: string
}

export function ContentContainer({ layout, children, className }: ContentContainerProps) {
  return (
    <div className={cn('mx-auto w-full', layout === 'fixed' && 'max-w-5xl', className)}>
      {children}
    </div>
  )
}
