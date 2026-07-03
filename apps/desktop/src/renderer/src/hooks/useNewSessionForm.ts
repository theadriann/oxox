import { useCallback, useRef, useState } from 'react'
import type {
  LiveSessionMessageImageSource,
  WorkspaceDirectoryEntry,
} from '../../../shared/ipc/contracts'

import type { PlatformApiClient } from '../platform/apiClient'
import type { ComposerStore } from '../state/composer/composer.model'
import type { LiveSessionStore } from '../state/live-sessions/live-session.model'
import type { SessionStore } from '../state/sessions/session.model'

export type NewSessionFormDialogApi = PlatformApiClient['dialog']
export type NewSessionFormDirectoryApi = PlatformApiClient['workspaceDirectories']
export type NewSessionFormSessionApi = PlatformApiClient['session']

interface UseNewSessionFormOptions {
  sessionStore: SessionStore
  liveSessionStore: LiveSessionStore
  composerStore: ComposerStore
  dialogApi: NewSessionFormDialogApi
  directoryApi: NewSessionFormDirectoryApi
  sessionApi: NewSessionFormSessionApi
}

interface UseNewSessionFormResult {
  showForm: boolean
  path: string
  error: string | null
  isSubmitting: boolean
  directoryPicker: {
    isOpen: boolean
    isLoading: boolean
    error: string | null
    currentPath: string
    parentPath: string | null
    homePath: string
    entries: WorkspaceDirectoryEntry[]
  }
  setPath: (path: string) => void
  openDraft: (workspacePath?: string, folderId?: string | null) => void
  pickDirectory: () => Promise<void>
  closeDirectoryPicker: () => void
  navigateDirectoryPicker: (path: string | null) => Promise<void>
  selectDirectoryFromPicker: (path?: string) => void
  submitNewSession: (payload: {
    text: string
    modelId: string
    interactionMode: string
    reasoningEffort?: string
    autonomyLevel: string
    images?: LiveSessionMessageImageSource[]
  }) => Promise<void>
  closeForm: () => void
}

export function useNewSessionForm({
  sessionStore,
  liveSessionStore,
  composerStore,
  dialogApi,
  directoryApi,
  sessionApi,
}: UseNewSessionFormOptions): UseNewSessionFormResult {
  const [showForm, setShowForm] = useState(false)
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [directoryPicker, setDirectoryPicker] = useState({
    isOpen: false,
    isLoading: false,
    error: null as string | null,
    currentPath: '',
    parentPath: null as string | null,
    homePath: '',
    entries: [] as WorkspaceDirectoryEntry[],
  })
  const triggerRef = useRef<HTMLElement | null>(null)
  const previousSessionIdRef = useRef('')
  const pendingFolderIdRef = useRef<string | null>(null)

  const closeForm = useCallback(() => {
    setShowForm(false)
    setPath('')
    setError(null)
    setDirectoryPicker((current) => ({ ...current, isOpen: false, error: null }))
    pendingFolderIdRef.current = null
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
    (workspacePath?: string, folderId?: string | null) => {
      if (!showForm) {
        previousSessionIdRef.current = sessionStore.selectedSessionId
      }

      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setShowForm(true)
      setPath(workspacePath?.trim() ?? '')
      setError(null)
      pendingFolderIdRef.current = folderId ?? null
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

  const closeDirectoryPicker = useCallback(() => {
    setDirectoryPicker((current) => ({ ...current, isOpen: false, error: null }))
  }, [])

  const loadDirectoryPicker = useCallback(
    async (nextPath: string | null) => {
      if (!directoryApi.list) {
        return false
      }

      setDirectoryPicker((current) => ({
        ...current,
        isOpen: true,
        isLoading: true,
        error: null,
      }))

      try {
        const result = await directoryApi.list({
          path: nextPath,
          showHidden: false,
        })

        setDirectoryPicker({
          isOpen: true,
          isLoading: false,
          error: null,
          currentPath: result.currentPath,
          parentPath: result.parentPath,
          homePath: result.homePath,
          entries: result.entries,
        })
        return true
      } catch (nextError) {
        setDirectoryPicker((current) => ({
          ...current,
          isOpen: true,
          isLoading: false,
          error:
            nextError instanceof Error ? nextError.message : 'Unable to browse workspace folders.',
        }))
        return true
      }
    },
    [directoryApi.list],
  )

  const pickDirectory = useCallback(async () => {
    if (directoryApi.list && (await loadDirectoryPicker(path.trim() || null))) {
      return
    }

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
  }, [composerStore, dialogApi.selectDirectory, directoryApi.list, loadDirectoryPicker, path])

  const navigateDirectoryPicker = useCallback(
    async (nextPath: string | null) => {
      await loadDirectoryPicker(nextPath)
    },
    [loadDirectoryPicker],
  )

  const selectDirectoryFromPicker = useCallback(
    (selectedPath?: string) => {
      const nextPath = (selectedPath ?? directoryPicker.currentPath).trim()

      if (!nextPath) {
        return
      }

      setPath(nextPath)
      composerStore.beginPendingDraftForWorkspace(nextPath)
      closeDirectoryPicker()
    },
    [closeDirectoryPicker, composerStore, directoryPicker.currentPath],
  )

  const submitNewSession = useCallback(
    async (payload: {
      text: string
      modelId: string
      interactionMode: string
      reasoningEffort?: string
      autonomyLevel: string
      images?: LiveSessionMessageImageSource[]
    }) => {
      const cwd = path.trim()
      const initialPrompt = payload.text.trim()
      const images = payload.images ?? []

      if (
        !cwd ||
        (!initialPrompt && images.length === 0) ||
        !sessionApi.create ||
        !sessionApi.addUserMessage
      ) {
        return
      }

      setIsSubmitting(true)
      setError(null)

      try {
        const createdSession = await sessionApi.create({
          cwd,
          settings: {
            modelId: payload.modelId,
            interactionMode: payload.interactionMode,
            ...(payload.reasoningEffort ? { reasoningEffort: payload.reasoningEffort } : {}),
            autonomyLevel: payload.autonomyLevel,
          },
        })
        await sessionApi.addUserMessage(
          createdSession.sessionId,
          images.length > 0 ? { text: initialPrompt, images } : initialPrompt,
        )

        const refreshedSnapshot =
          (await sessionApi.getSnapshot?.(createdSession.sessionId)) ?? createdSession

        liveSessionStore.upsertSnapshot(refreshedSnapshot)
        sessionStore.selectSession(createdSession.sessionId)
        if (pendingFolderIdRef.current) {
          sessionStore.assignSessionToFolder(createdSession.sessionId, pendingFolderIdRef.current)
        }
        composerStore.updatePreferences(createdSession.sessionId, {
          modelId: payload.modelId,
          interactionMode: payload.interactionMode,
          reasoningEffort: payload.reasoningEffort ?? '',
          autonomyLevel: payload.autonomyLevel,
        })
        composerStore.resetForSession(createdSession.sessionId)
        composerStore.clearPendingDraft()
        previousSessionIdRef.current = createdSession.sessionId
        pendingFolderIdRef.current = null
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
    directoryPicker,
    setPath,
    openDraft,
    pickDirectory,
    closeDirectoryPicker,
    navigateDirectoryPicker,
    selectDirectoryFromPicker,
    submitNewSession,
    closeForm,
  }
}
