// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const {
  useAppRuntimeMock,
  useCommandPaletteMock,
  useKeyboardShortcutsMock,
  useNewSessionFormMock,
  usePanelResizeMock,
  createAppShellKeyboardShortcutsMock,
} = vi.hoisted(() => ({
  useAppRuntimeMock: vi.fn(),
  useCommandPaletteMock: vi.fn(),
  useKeyboardShortcutsMock: vi.fn(),
  useNewSessionFormMock: vi.fn(),
  usePanelResizeMock: vi.fn(),
  createAppShellKeyboardShortcutsMock: vi.fn(),
}))

vi.mock('../../../hooks/useAppRuntime', () => ({
  useAppRuntime: useAppRuntimeMock,
}))

vi.mock('../../../hooks/useCommandPalette', () => ({
  useCommandPalette: useCommandPaletteMock,
}))

vi.mock('../../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: useKeyboardShortcutsMock,
}))

vi.mock('../../../hooks/useNewSessionForm', () => ({
  useNewSessionForm: useNewSessionFormMock,
}))

vi.mock('../../../hooks/usePanelResize', () => ({
  usePanelResize: usePanelResizeMock,
}))

vi.mock('../appShellKeyboardShortcuts', () => ({
  createAppShellKeyboardShortcuts: createAppShellKeyboardShortcutsMock,
}))

import { useAppShellController } from '../useAppShellController'

function ControllerProbe({
  resultRef,
  stores,
}: {
  resultRef: { current: ReturnType<typeof useAppShellController> | null }
  stores: Parameters<typeof useAppShellController>[0]
}) {
  resultRef.current = useAppShellController(stores)
  return null
}

describe('useAppShellController', () => {
  it('wires runtime, new-session, palette, resize, and keyboard hooks together', () => {
    const commandPalette = {
      closePalette: vi.fn(),
      getCommands: () => [],
      handleSessionSelection: vi.fn(),
      openPalette: vi.fn(),
    }
    const newSessionForm = {
      closeForm: vi.fn(),
      openDraft: vi.fn(),
      path: '',
      showForm: false,
      isSubmitting: false,
      submitNewSession: vi.fn(),
    }
    const resizeState = {
      startContextPanelResize: vi.fn(),
      startSidebarResize: vi.fn(),
    }
    const keyboardShortcuts = [{ id: 'open-command-palette' }]
    const resultRef = { current: null as ReturnType<typeof useAppShellController> | null }
    const stores = {
      composerStore: {
        attachSelected: vi.fn().mockResolvedValue(false),
        compactSelected: vi.fn(),
        copySelectedId: vi.fn(),
        detachSelected: vi.fn(),
        feedback: null,
        forkSelected: vi.fn(),
        openRewindDialog: vi.fn(),
        openRenameDialog: vi.fn(),
      },
      foundationStore: {
        hasError: false,
        isDroidMissing: false,
        isLoading: false,
        refresh: vi.fn(),
      },
      liveSessionStore: {
        selectedNeedsReconnect: false,
        selectedSnapshot: null,
        selectedSnapshotId: null,
      },
      pluginCapabilityStore: {},
      pluginHostStore: {},
      rootStore: {
        api: {
          app: { openNewWindow: vi.fn() },
          dialog: {},
          session: {},
        },
      },
      sessionStore: {
        selectSession: vi.fn(),
        selectedSession: null,
        selectedSessionId: null,
      },
      transcriptStore: {},
      uiStore: {},
      updateStore: {},
    }

    useNewSessionFormMock.mockReturnValue(newSessionForm)
    usePanelResizeMock.mockReturnValue(resizeState)
    useCommandPaletteMock.mockReturnValue(commandPalette)
    createAppShellKeyboardShortcutsMock.mockReturnValue(keyboardShortcuts)

    render(<ControllerProbe resultRef={resultRef} stores={stores as never} />)

    expect(useNewSessionFormMock).toHaveBeenCalledWith({
      composerStore: stores.composerStore,
      dialogApi: stores.rootStore.api.dialog,
      liveSessionStore: stores.liveSessionStore,
      sessionApi: stores.rootStore.api.session,
      sessionStore: stores.sessionStore,
    })
    expect(usePanelResizeMock).toHaveBeenCalledWith({ uiStore: stores.uiStore })
    expect(useAppRuntimeMock).toHaveBeenCalledWith({
      composerStore: stores.composerStore,
      foundationStore: stores.foundationStore,
      liveSessionStore: stores.liveSessionStore,
      onSelectSession: expect.any(Function),
      pluginCapabilityStore: stores.pluginCapabilityStore,
      pluginHostStore: stores.pluginHostStore,
      rootStore: stores.rootStore,
      sessionStore: stores.sessionStore,
      transcriptStore: stores.transcriptStore,
      updateStore: stores.updateStore,
    })
    expect(useCommandPaletteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveSessionStore: stores.liveSessionStore,
        onOpenNewWindow: expect.any(Function),
        onPickDirectory: newSessionForm.openDraft,
        pluginCapabilityStore: stores.pluginCapabilityStore,
        pluginHostStore: stores.pluginHostStore,
        sessionStore: stores.sessionStore,
        uiStore: stores.uiStore,
      }),
    )
    expect(createAppShellKeyboardShortcutsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        closeCommandPalette: commandPalette.closePalette,
        composerStore: stores.composerStore,
        liveSessionStore: stores.liveSessionStore,
        newSessionForm,
        openCommandPalette: commandPalette.openPalette,
        uiStore: stores.uiStore,
      }),
    )
    expect(useKeyboardShortcutsMock).toHaveBeenCalledWith(keyboardShortcuts)
    expect(resultRef.current?.commandPalette).toBe(commandPalette)
    expect(resultRef.current?.newSessionForm).toBe(newSessionForm)
    expect(resultRef.current?.startSidebarResize).toBe(resizeState.startSidebarResize)
    expect(resultRef.current?.startContextPanelResize).toBe(resizeState.startContextPanelResize)
  })

  it('coordinates session selection, attachment focus, and transcript scrolling', async () => {
    const requestAnimationFrameStub = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      })

    try {
      const button = document.createElement('button')
      document.body.append(button)
      const focusSpy = vi.spyOn(button, 'focus')
      const closeForm = vi.fn()
      const selectSession = vi.fn()
      const attachSelected = vi.fn().mockResolvedValue(true)
      const compactSelected = vi.fn().mockResolvedValue(undefined)
      const forkSelected = vi.fn().mockResolvedValue(undefined)
      const openRewindDialog = vi.fn()
      const resultRef = { current: null as ReturnType<typeof useAppShellController> | null }

      useNewSessionFormMock.mockReturnValue({
        closeForm,
        openDraft: vi.fn(),
        path: '',
        showForm: true,
        isSubmitting: false,
        submitNewSession: vi.fn(),
      })
      usePanelResizeMock.mockReturnValue({
        startContextPanelResize: vi.fn(),
        startSidebarResize: vi.fn(),
      })
      useCommandPaletteMock.mockReturnValue({
        closePalette: vi.fn(),
        getCommands: () => [],
        handleSessionSelection: vi.fn(),
        openPalette: vi.fn(),
      })
      createAppShellKeyboardShortcutsMock.mockReturnValue([])

      render(
        <ControllerProbe
          resultRef={resultRef}
          stores={
            {
              composerStore: {
                attachSelected,
                compactSelected,
                copySelectedId: vi.fn(),
                detachSelected: vi.fn(),
                feedback: null,
                forkSelected,
                renameWorkflow: {
                  openRenameDialog: vi.fn(),
                },
                rewindWorkflow: {
                  openRewindDialog,
                },
              },
              foundationStore: {
                hasError: false,
                isDroidMissing: false,
                isLoading: false,
                refresh: vi.fn(),
              },
              liveSessionStore: {
                selectedNeedsReconnect: false,
                selectedSnapshot: null,
                selectedSnapshotId: null,
              },
              pluginCapabilityStore: {},
              pluginHostStore: {},
              rootStore: {
                api: {
                  app: { openNewWindow: vi.fn() },
                  dialog: {},
                  session: {},
                },
              },
              sessionStore: {
                selectSession,
                selectedSession: null,
                selectedSessionId: 'session-1',
              },
              transcriptStore: {},
              uiStore: {
                showSidebar: vi.fn(),
              },
              updateStore: {},
            } as never
          }
        />,
      )

      if (!resultRef.current) {
        throw new Error('Expected controller result.')
      }

      resultRef.current.transcriptPrimaryActionRef.current = button

      await act(async () => {
        resultRef.current?.handleSelectSession('session-2')
      })

      expect(closeForm).toHaveBeenCalledTimes(1)
      expect(selectSession).toHaveBeenCalledWith('session-2')
      expect(resultRef.current.transcriptScrollSignal).toBe(1)

      await act(async () => {
        await resultRef.current?.handleAttachSelectedSession()
      })

      expect(attachSelected).toHaveBeenCalledTimes(1)
      expect(focusSpy).toHaveBeenCalledTimes(1)

      await act(async () => {
        await resultRef.current?.handleCompactSelectedSession()
      })

      expect(compactSelected).toHaveBeenCalledTimes(1)
      expect(resultRef.current.transcriptScrollSignal).toBe(2)

      await act(async () => {
        await resultRef.current?.handleForkSelectedSession()
      })

      expect(forkSelected).toHaveBeenCalledTimes(1)
      expect(resultRef.current.transcriptScrollSignal).toBe(3)

      act(() => {
        resultRef.current?.handleRewindSelectedSession()
      })

      expect(openRewindDialog).toHaveBeenCalledTimes(1)
    } finally {
      requestAnimationFrameStub.mockRestore()
    }
  })
})
