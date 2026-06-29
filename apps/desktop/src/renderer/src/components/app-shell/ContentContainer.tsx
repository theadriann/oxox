import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import type { ContentLayout } from '../../state/ui/ui.model'

interface ContentContainerProps extends HTMLAttributes<HTMLDivElement> {
  layout: ContentLayout
  children: ReactNode
}

export function ContentContainer({ layout, children, className, ...props }: ContentContainerProps) {
  return (
    <div
      {...props}
      className={cn('mx-auto w-full px-4', layout === 'fixed' && 'max-w-5xl', className)}
    >
      {children}
    </div>
  )
}
