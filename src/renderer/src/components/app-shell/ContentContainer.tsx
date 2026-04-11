import { observer } from 'mobx-react-lite'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import type { ContentLayout } from '../../stores/UIStore'

interface ContentContainerProps {
  layout: ContentLayout
  children: ReactNode
  className?: string
}

export const ContentContainer = observer(function ContentContainer({
  layout,
  children,
  className,
}: ContentContainerProps) {
  return (
    <div className={cn('mx-auto w-full', layout === 'fixed' && 'max-w-5xl', className)}>
      {children}
    </div>
  )
})
