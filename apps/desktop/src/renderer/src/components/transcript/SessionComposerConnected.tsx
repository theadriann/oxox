import { useValue } from '@legendapp/state/react'
import { useCallback, useRef, useState } from 'react'
import type { LiveSessionMessageImageSource } from '../../../../shared/ipc/contracts'
import {
  useComposerStore,
  useLiveSessionStore,
  useModelPickerStore,
  useRootStore,
  useSessionStore,
  useUIStore,
} from '../../state/root/store-provider'
import { useOptionalAppShellControllerContext } from '../app-shell/AppShellControllerContext'
import { SessionComposerContainer } from '../app-shell/SessionComposerContainer'
import { SessionComposer } from './SessionComposer'
import { buildSessionComposerProps } from './sessionComposerSelectors'

const WORKSPACE_FILE_SEARCH_MAX_RESULTS = 60

interface SessionComposerConnectedProps {
  onAttach?: () => void
  canComposeDetached?: boolean
  isSubmittingDetached?: boolean
  onSubmitDetached?: (payload: {
    text: string
    modelId: string
    interactionMode: string
    autonomyLevel: string
    images?: LiveSessionMessageImageSource[]
  }) => void | Promise<void>
}

export function SessionComposerConnected({
  onAttach,
  canComposeDetached,
  isSubmittingDetached,
  onSubmitDetached,
}: SessionComposerConnectedProps) {
  const composerStore = useComposerStore()
  const rootStore = useRootStore()
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const modelPickerStore = useModelPickerStore()
  const workspaceFileRequestIdRef = useRef(0)
  const [workspaceFileSearchState, setWorkspaceFileSearchState] = useState({
    files: [] as string[],
    isLoading: false,
  })
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
          images?: LiveSessionMessageImageSource[]
        }) => controller.newSessionForm.submitNewSession(payload)
      : undefined)
  const { composer, error, selectedWorkspaceSessionId } = useValue(() => {
    const selectedSession = sessionStore.selectedSession
    return {
      ...buildSessionComposerProps({
        canComposeDetached: resolvedCanComposeDetached,
        composerStore,
        isSubmittingDetached: resolvedIsSubmittingDetached,
        liveSessionStore,
        modelPickerStore,
        onAttach: resolvedOnAttach,
        onSubmitDetached: resolvedOnSubmitDetached,
        sessionStore,
        uiStore,
      }),
      selectedWorkspaceSessionId: selectedSession?.projectWorkspacePath ? selectedSession.id : null,
    }
  })
  const handleWorkspaceFileQueryChange = useCallback(
    (query: string) => {
      if (!selectedWorkspaceSessionId) {
        setWorkspaceFileSearchState({ files: [], isLoading: false })
        return
      }

      const requestId = workspaceFileRequestIdRef.current + 1
      workspaceFileRequestIdRef.current = requestId
      setWorkspaceFileSearchState((current) => ({ ...current, isLoading: true }))

      const request =
        query.trim().length === 0
          ? rootStore.api.workspaceFiles.list?.({
              sessionId: selectedWorkspaceSessionId,
              showHidden: false,
            })
          : rootStore.api.workspaceFiles.search?.({
              sessionId: selectedWorkspaceSessionId,
              query,
              maxResults: WORKSPACE_FILE_SEARCH_MAX_RESULTS,
              showHidden: false,
            })

      if (!request) {
        setWorkspaceFileSearchState({ files: [], isLoading: false })
        return
      }

      void request
        .then((result) => {
          if (workspaceFileRequestIdRef.current !== requestId) {
            return
          }

          setWorkspaceFileSearchState({
            files: result.files,
            isLoading: false,
          })
        })
        .catch(() => {
          if (workspaceFileRequestIdRef.current !== requestId) {
            return
          }

          setWorkspaceFileSearchState({ files: [], isLoading: false })
        })
    },
    [rootStore.api.workspaceFiles, selectedWorkspaceSessionId],
  )

  return (
    <SessionComposerContainer error={error}>
      <SessionComposer
        {...composer}
        workspaceFileSearch={{
          enabled: Boolean(selectedWorkspaceSessionId),
          files: workspaceFileSearchState.files,
          isLoading: workspaceFileSearchState.isLoading,
          onQueryChange: handleWorkspaceFileQueryChange,
        }}
      />
    </SessionComposerContainer>
  )
}
