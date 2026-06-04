import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    return null
  }

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      closeButton
      closeButtonAriaLabel="Dismiss notification"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--fd-elevated)',
          '--normal-bg-hover': 'var(--fd-panel)',
          '--normal-text': 'var(--fd-text-primary)',
          '--normal-border': 'var(--fd-border-strong)',
          '--normal-border-hover': 'var(--fd-border-strong)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      position="bottom-right"
      visibleToasts={3}
      {...props}
    />
  )
}

export { Toaster }
