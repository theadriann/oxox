import { useCallback, useRef, useState } from 'react'

import type { PlatformApiClient } from '../platform/apiClient'
import type { ComposerStore } from '../stores/ComposerStore'
import type { LiveSessionStore } from '../stores/LiveSessionStore'
import type { SessionStore } from '../stores/SessionStore'

export type NewSessionFormDialogApi = PlatformApiClient['dialog']
export type NewSessionFormSessionApi = PlatformApiClient['session']

interface UseNewSessionFormOptions {
  sessionStore: SessionStore
  liveSessionStore: LiveSessionStore
  composerStore: ComposerStore
  dialogApi: NewSessionFormDialogApi
  sessionApi: NewSessionFormSessionApi
}

interface UseNewSessionFormResult {
  showForm: boolean
  path: string
  error: string | null
  isSubmitting: boolean
  openDraft: (workspacePath?: string) => void
  pickDirectory: () => Promise<void>
  submitNewSession: (payload: {
    text: string
    modelId: string
    interactionMode: string
    autonomyLevel: string
  }) => Promise<void>
  closeForm: () => void
}

export function useNewSessionForm({
  sessionStore,
  liveSessionStore,
  composerStore,
  dialogApi,
  sessionApi,
}: UseNewSessionFormOptions): UseNewSessionFormResult {
  const [showForm, setShowForm] = useState(false)
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const previousSessionIdRef = useRef('')

  const closeForm = useCallback(() => {
    setShowForm(false)
    setPath('')
    setError(null)
    composerStore.clearPendingDraft()

    if (previousSessionIdRef.current) {
      sessionStore.cancelDraftSelection(previousSessionIdRef.current)
    } else {
      sessionStore.cancelDraftSelection()
    }

    const trigger = triggerRef.current

    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus()
      }
    })
  }, [composerStore, sessionStore])

  const openDraft = useCallback(
    (workspacePath?: string) => {
      if (!showForm) {
        previousSessionIdRef.current = sessionStore.selectedSessionId
      }

      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setShowForm(true)
      setPath(workspacePath?.trim() ?? '')
      setError(null)
      composerStore.setDraft('')
      sessionStore.startDraftSelection()

      if (workspacePath?.trim()) {
        composerStore.beginPendingDraftForWorkspace(workspacePath)
        return
      }

      composerStore.beginPendingDraft()
    },
    [composerStore, sessionStore, showForm],
  )

  const pickDirectory = useCallback(async () => {
    if (!dialogApi.selectDirectory) {
      return
    }

    try {
      const selectedPath = await dialogApi.selectDirectory()

      if (selectedPath) {
        setPath(selectedPath)
        composerStore.beginPendingDraftForWorkspace(selectedPath)
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Unable to open the workspace picker.',
      )
    }
  }, [composerStore, dialogApi.selectDirectory])

  const submitNewSession = useCallback(
    async (payload: {
      text: string
      modelId: string
      interactionMode: string
      autonomyLevel: string
    }) => {
      const cwd = path.trim()
      const initialPrompt = payload.text.trim()

      if (
        !cwd ||
        !initialPrompt ||
        !sessionApi.create ||
        !sessionApi.addUserMessage ||
        !sessionApi.updateSettings
      ) {
        return
      }

      setIsSubmitting(true)
      setError(null)

      try {
        const createdSession = await sessionApi.create(cwd)

        await sessionApi.updateSettings(createdSession.sessionId, {
          modelId: payload.modelId,
          interactionMode: payload.interactionMode,
          autonomyLevel: payload.autonomyLevel,
        })
        await sessionApi.addUserMessage(createdSession.sessionId, initialPrompt)

        const refreshedSnapshot =
          (await sessionApi.getSnapshot?.(createdSession.sessionId)) ?? createdSession

        liveSessionStore.upsertSnapshot(refreshedSnapshot)
        sessionStore.selectSession(createdSession.sessionId)
        composerStore.updatePreferences(createdSession.sessionId, {
          modelId: payload.modelId,
          interactionMode: payload.interactionMode,
          autonomyLevel: payload.autonomyLevel,
        })
        composerStore.resetForSession(createdSession.sessionId)
        composerStore.clearPendingDraft()
        previousSessionIdRef.current = createdSession.sessionId
        setShowForm(false)
        setPath('')
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : 'Unable to start the live session.',
        )
      } finally {
        setIsSubmitting(false)
      }
    },
    [composerStore, liveSessionStore, path, sessionApi, sessionStore],
  )

  return {
    showForm,
    path,
    error,
    isSubmitting,
    openDraft,
    pickDirectory,
    submitNewSession,
    closeForm,
  }
}
