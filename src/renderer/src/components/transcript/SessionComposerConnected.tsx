import { useValue } from '../../stores/legend'
import {
  useComposerStore,
  useLiveSessionStore,
  useSessionStore,
  useUIStore,
} from '../../stores/StoreProvider'
import { useOptionalAppShellControllerContext } from '../app-shell/AppShellControllerContext'
import { SessionComposerContainer } from '../app-shell/SessionComposerContainer'
import { SessionComposer } from './SessionComposer'
import { buildSessionComposerProps } from './sessionComposerSelectors'

interface SessionComposerConnectedProps {
  onAttach?: () => void
  canComposeDetached?: boolean
  isSubmittingDetached?: boolean
  onSubmitDetached?: (payload: {
    text: string
    modelId: string
    interactionMode: string
    autonomyLevel: string
  }) => void | Promise<void>
}

export function SessionComposerConnected({
  onAttach,
  canComposeDetached,
  isSubmittingDetached,
  onSubmitDetached,
}: SessionComposerConnectedProps) {
  const composerStore = useComposerStore()
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const controller = useOptionalAppShellControllerContext()
  const resolvedCanComposeDetached =
    canComposeDetached ?? Boolean(controller?.newSessionForm.path.trim())
  const resolvedIsSubmittingDetached =
    isSubmittingDetached ?? controller?.newSessionForm.isSubmitting ?? false
  const resolvedOnAttach =
    onAttach ??
    (controller
      ? () => {
          void controller.handleAttachSelectedSession()
        }
      : undefined)
  const resolvedOnSubmitDetached =
    onSubmitDetached ??
    (controller
      ? (payload: {
          text: string
          modelId: string
          interactionMode: string
          autonomyLevel: string
        }) => controller.newSessionForm.submitNewSession(payload)
      : undefined)
  const { composer, error } = useValue(() =>
    buildSessionComposerProps({
      canComposeDetached: resolvedCanComposeDetached,
      composerStore,
      isSubmittingDetached: resolvedIsSubmittingDetached,
      liveSessionStore,
      onAttach: resolvedOnAttach,
      onSubmitDetached: resolvedOnSubmitDetached,
      sessionStore,
      uiStore,
    }),
  )

  return (
    <SessionComposerContainer error={error}>
      <SessionComposer {...composer} />
    </SessionComposerContainer>
  )
}
