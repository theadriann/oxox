import type { AppUpdateState, RuntimeInfo } from '../../shared/ipc/contracts'
import { IPC_CHANNELS } from '../../shared/ipc/contracts'
import type { PluginRegistry } from '../app/PluginRegistry'
import type { FoundationService } from '../integration/foundationService'
import type { LocalPluginHostManager } from '../integration/plugins/localPluginHost'
import {
  clearRendererSessionAttachments,
  listRendererSessionAttachments,
  registerRendererSessionAttachment,
  removeRendererSessionAttachment,
} from './liveSessionAttachmentRegistry'

interface IpcMainLike {
  handle: (channel: string, handler: (...args: unknown[]) => unknown) => void
  removeHandler: (channel: string) => void
}

interface DialogResultLike {
  canceled: boolean
  filePaths: string[]
}

interface WebContentsLike {
  id: number
  once: (event: 'destroyed', listener: () => void) => void
}

interface IpcInvokeEventLike {
  sender: WebContentsLike
}

export interface RegisterAppIpcHandlersOptions {
  ipcMain: IpcMainLike
  service: FoundationService
  updater: {
    getState: () => AppUpdateState
    checkForUpdates: () => Promise<AppUpdateState>
    installUpdate: () => void
  }
  keepBootstrapHandlerOnCleanup?: boolean
  pluginRegistry: Pick<PluginRegistry, 'listCapabilities'>
  pluginHost: Pick<LocalPluginHostManager, 'listHosts'>
  invokePluginCapability: (capabilityId: string, payload?: unknown) => Promise<unknown>
  getRuntimeInfo: () => RuntimeInfo
  createAppWindow: () => Promise<void>
  showOpenDialog: (
    ownerWindow: unknown,
    options: {
      title: string
      buttonLabel: string
      properties: Array<'openDirectory' | 'createDirectory'>
    },
  ) => Promise<DialogResultLike>
  resolveOwnerWindow: (sender: WebContentsLike) => unknown
}

export function registerAppIpcHandlers({
  ipcMain,
  service,
  updater,
  keepBootstrapHandlerOnCleanup = false,
  pluginRegistry,
  pluginHost,
  invokePluginCapability,
  getRuntimeInfo,
  createAppWindow,
  showOpenDialog,
  resolveOwnerWindow,
}: RegisterAppIpcHandlersOptions): () => void {
  const registeredChannels: string[] = []
  const rendererCleanupRegistered = new Set<number>()
  let lastBootstrapSnapshot: ReturnType<FoundationService['getBootstrap']> | null = null

  const registerHandler = (channel: string, handler: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, handler)
    registeredChannels.push(channel)
  }

  const ensureSenderCleanup = (sender: WebContentsLike): void => {
    if (rendererCleanupRegistered.has(sender.id)) {
      return
    }

    rendererCleanupRegistered.add(sender.id)
    sender.once('destroyed', () => {
      const attachments = listRendererSessionAttachments(sender.id)

      for (const sessionId of attachments) {
        void service.detachSession(sessionId, `renderer:${sender.id}`)
      }

      clearRendererSessionAttachments(sender.id)
      rendererCleanupRegistered.delete(sender.id)
    })
  }

  const handlers: Record<string, (...args: unknown[]) => unknown> = {
    [IPC_CHANNELS.runtimeInfo]: () => getRuntimeInfo(),
    [IPC_CHANNELS.appGetUpdateState]: () => updater.getState(),
    [IPC_CHANNELS.appCheckForUpdates]: () => updater.checkForUpdates(),
    [IPC_CHANNELS.appInstallUpdate]: () => updater.installUpdate(),
    [IPC_CHANNELS.appOpenWindow]: async () => {
      await createAppWindow()
    },
    [IPC_CHANNELS.pluginListCapabilities]: () =>
      pluginRegistry.listCapabilities().map((capability) => ({
        qualifiedId: capability.qualifiedId,
        pluginId: capability.pluginId,
        kind: capability.capability.kind,
        name: capability.capability.name,
        displayName: capability.capability.displayName,
      })),
    [IPC_CHANNELS.pluginListHosts]: () => pluginHost.listHosts(),
    [IPC_CHANNELS.pluginInvokeCapability]: (_event, capabilityId: string, payload?: unknown) =>
      invokePluginCapability(capabilityId, payload),
    [IPC_CHANNELS.dialogSelectDirectory]: async (event: IpcInvokeEventLike) => {
      const ownerWindow = resolveOwnerWindow(event.sender)
      const result = await showOpenDialog(ownerWindow, {
        title: 'Select a workspace',
        buttonLabel: 'Use folder',
        properties: ['openDirectory', 'createDirectory'],
      })

      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    [IPC_CHANNELS.foundationBootstrap]: () => {
      const snapshot = service.getBootstrap()
      lastBootstrapSnapshot = snapshot
      return snapshot
    },
    [IPC_CHANNELS.databaseListProjects]: () => service.listProjects(),
    [IPC_CHANNELS.databaseListSessions]: () => service.listSessions(),
    [IPC_CHANNELS.databaseListSyncMetadata]: () => service.listSyncMetadata(),
    [IPC_CHANNELS.transcriptGetSessionTranscript]: (_event, sessionId: string) =>
      service.getSessionTranscript(sessionId),
    [IPC_CHANNELS.sessionCreate]: async (event: IpcInvokeEventLike, cwd: string) => {
      ensureSenderCleanup(event.sender)
      const snapshot = await service.createSession(cwd, `renderer:${event.sender.id}`)
      registerRendererSessionAttachment(event.sender.id, snapshot.sessionId)
      return snapshot
    },
    [IPC_CHANNELS.sessionGetSnapshot]: (_event, sessionId: string) =>
      service.getSessionSnapshot(sessionId),
    [IPC_CHANNELS.sessionAttach]: async (event: IpcInvokeEventLike, sessionId: string) => {
      ensureSenderCleanup(event.sender)
      const snapshot = await service.attachSession(sessionId, `renderer:${event.sender.id}`)
      registerRendererSessionAttachment(event.sender.id, snapshot.sessionId)
      return snapshot
    },
    [IPC_CHANNELS.sessionDetach]: async (event: IpcInvokeEventLike, sessionId: string) => {
      const snapshot = await service.detachSession(sessionId, `renderer:${event.sender.id}`)
      removeRendererSessionAttachment(event.sender.id, sessionId)
      return snapshot
    },
    [IPC_CHANNELS.sessionAddUserMessage]: (_event, sessionId: string, text: string) =>
      service.addUserMessage(sessionId, text),
    [IPC_CHANNELS.sessionRename]: (_event, sessionId: string, title: string) =>
      service.renameSession(sessionId, title),
    [IPC_CHANNELS.sessionListTools]: (_event, sessionId: string) =>
      service.listSessionTools(sessionId),
    [IPC_CHANNELS.sessionListSkills]: (_event, sessionId: string) =>
      service.listSessionSkills(sessionId),
    [IPC_CHANNELS.sessionListMcpServers]: (_event, sessionId: string) =>
      service.listSessionMcpServers(sessionId),
    [IPC_CHANNELS.sessionGetContextStats]: (_event, sessionId: string) =>
      service.getSessionContextStats(sessionId),
    [IPC_CHANNELS.sessionUpdateSettings]: (
      _event,
      sessionId: string,
      settings: Record<string, unknown>,
    ) => service.updateSessionSettings(sessionId, settings),
    [IPC_CHANNELS.sessionInterrupt]: (_event, sessionId: string) =>
      service.interruptSession(sessionId),
    [IPC_CHANNELS.sessionFork]: async (event: IpcInvokeEventLike, sessionId: string) => {
      ensureSenderCleanup(event.sender)
      const snapshot = await service.forkSession(sessionId, `renderer:${event.sender.id}`)
      registerRendererSessionAttachment(event.sender.id, snapshot.sessionId)
      return snapshot
    },
    [IPC_CHANNELS.sessionForkViaDaemon]: async (event: IpcInvokeEventLike, sessionId: string) => {
      ensureSenderCleanup(event.sender)
      const snapshot = await service.forkSessionViaDaemon(sessionId, `renderer:${event.sender.id}`)
      registerRendererSessionAttachment(event.sender.id, snapshot.sessionId)
      return snapshot
    },
    [IPC_CHANNELS.sessionRenameViaDaemon]: (_event, sessionId: string, title: string) =>
      service.renameSessionViaDaemon(sessionId, title),
    [IPC_CHANNELS.sessionGetRewindInfo]: (_event, sessionId: string, messageId: string) =>
      service.getRewindInfo(sessionId, messageId),
    [IPC_CHANNELS.sessionExecuteRewind]: async (
      event: IpcInvokeEventLike,
      sessionId: string,
      params: Parameters<FoundationService['executeRewind']>[1],
    ) => {
      ensureSenderCleanup(event.sender)
      const result = await service.executeRewind(sessionId, params, `renderer:${event.sender.id}`)
      registerRendererSessionAttachment(event.sender.id, result.snapshot.sessionId)
      return result
    },
    [IPC_CHANNELS.sessionCompact]: async (
      event: IpcInvokeEventLike,
      sessionId: string,
      customInstructions?: string,
    ) => {
      ensureSenderCleanup(event.sender)
      const result = await service.compactSession(
        sessionId,
        customInstructions,
        `renderer:${event.sender.id}`,
      )
      registerRendererSessionAttachment(event.sender.id, result.snapshot.sessionId)
      return result
    },
    [IPC_CHANNELS.sessionResolvePermissionRequest]: (
      _event,
      sessionId: string,
      requestId: string,
      selectedOption: string,
    ) => service.resolvePermissionRequest(sessionId, requestId, selectedOption),
    [IPC_CHANNELS.sessionResolveAskUserRequest]: (
      _event,
      sessionId: string,
      requestId: string,
      answers: unknown[],
    ) =>
      service.resolveAskUserRequest(
        sessionId,
        requestId,
        answers as Parameters<FoundationService['resolveAskUserRequest']>[2],
      ),
  }

  for (const [channel, handler] of Object.entries(handlers)) {
    registerHandler(channel, handler)
  }

  return () => {
    for (const channel of registeredChannels) {
      if (
        channel === IPC_CHANNELS.foundationBootstrap &&
        keepBootstrapHandlerOnCleanup &&
        lastBootstrapSnapshot === null
      ) {
        lastBootstrapSnapshot = service.getBootstrap()
      }

      ipcMain.removeHandler(channel)
    }

    if (keepBootstrapHandlerOnCleanup && lastBootstrapSnapshot !== null) {
      ipcMain.handle(IPC_CHANNELS.foundationBootstrap, () => lastBootstrapSnapshot)
    }

    for (const rendererId of rendererCleanupRegistered) {
      clearRendererSessionAttachments(rendererId)
    }
    rendererCleanupRegistered.clear()
  }
}
