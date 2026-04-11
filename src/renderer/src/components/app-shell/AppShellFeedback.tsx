import type { ComposerFeedback } from '../../stores/ComposerStore'

interface AppShellFeedbackProps {
  feedback: ComposerFeedback | null
}

export function AppShellFeedback({ feedback }: AppShellFeedbackProps) {
  if (!feedback) {
    return null
  }

  return (
    <div
      className={`mx-4 mt-2 rounded-md border px-3 py-2 text-sm ${feedback.tone === 'error' ? 'border-fd-ember-400/35 bg-fd-ember-500/10 text-fd-ember-400' : 'border-fd-border-default bg-fd-surface text-fd-primary'}`}
      role="status"
      aria-live="polite"
    >
      {feedback.message}
    </div>
  )
}
