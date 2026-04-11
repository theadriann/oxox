import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

function SkeletonBlock({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('oxox-skeleton rounded-[14px]', className)} {...props} />
}

export { Skeleton, SkeletonBlock }
