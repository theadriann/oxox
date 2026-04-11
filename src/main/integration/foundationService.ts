import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  DatabaseDiagnostics,
  FoundationBootstrap,
  FoundationChangedPayload,
  LiveSessionAskUserAnswerRecord,
  LiveSessionCompactResult,
  LiveSessionExecuteRewindParams,
  LiveSessionExecuteRewindResult,
  LiveSessionNotificationSummary,
  LiveSessionRewindInfo,
  LiveSessionSettings,
  LiveSessionSnapshot,
  ProjectRecord,
  SessionRecord,
  SessionTranscript,
  SyncMetadataRecord,
} from '../../shared/ipc/contracts'
import { createBackgroundArtifactScanner } from './artifacts/backgroundScanner'
import { createEnvironmentDaemonAuthProvider } from './daemon/auth'
import { createDaemonSessionControl } from './daemon/sessionControl'
import { createDaemonTransport } from './daemon/transport'
import { type CreateDatabaseServiceOptions, createDatabaseService } from './database/service'
import { resolveDroidCliStatus } from './droid/resolveDroidCliStatus'
import {
  createFoundationBootstrapState,
  parseDroidExecHelpBootstrap,
  type ReadFoundationBootstrapOptions,
  readDroidExecHelp,
  readFactorySettingsBootstrap,
  readFoundationBootstrap,
} from './foundation/bootstrap'
import { createFoundationChangeBroadcaster } from './foundation/changeBroadcaster'
import { createFoundationLiveSessionRuntime } from './foundation/liveSessionRuntime'
import { createFoundationQueries } from './foundation/queries'
import { createFoundationSessionCatalog } from './foundation/sessionCatalog'
import { createSessionProcessManager } from './sessions/processManager'

export interface FoundationService {
  close: () => void
  createSession: (cwd: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  getSessionSnapshot: (sessionId: string) => LiveSessionSnapshot | null
  listLiveSessionSnapshots: () => LiveSessionSnapshot[]
  listLiveSessionNotificationSummaries: () => LiveSessionNotificationSummary[]
  attachSession: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  detachSession: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  addUserMessage: (sessionId: string, text: string) => Promise<void>
  updateSessionSettings: (
    sessionId: string,
    settings: Partial<LiveSessionSettings>,
  ) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  resolvePermissionRequest: (
    sessionId: string,
    requestId: string,
    selectedOption: string,
  ) => Promise<void>
  resolveAskUserRequest: (
    sessionId: string,
    requestId: string,
    answers: LiveSessionAskUserAnswerRecord[],
  ) => Promise<void>
  getRewindInfo: (sessionId: string, messageId: string) => Promise<LiveSessionRewindInfo>
  executeRewind: (
    sessionId: string,
    params: LiveSessionExecuteRewindParams,
    viewerId?: string,
  ) => Promise<LiveSessionExecuteRewindResult>
  compactSession: (
    sessionId: string,
    customInstructions?: string,
    viewerId?: string,
  ) => Promise<LiveSessionCompactResult>
  forkSession: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  forkSessionViaDaemon: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  renameSessionViaDaemon: (sessionId: string, title: string) => Promise<void>
  interruptSession: (sessionId: string) => Promise<void>
  getBootstrap: () => FoundationBootstrap
  getDatabaseDiagnostics: () => DatabaseDiagnostics
  listProjects: () => ProjectRecord[]
  listSessions: () => SessionRecord[]
  listSyncMetadata: () => SyncMetadataRecord[]
  getSessionTranscript: (sessionId: string) => Promise<SessionTranscript>
  subscribeToFoundationUpdates: (
    listener: (payload: FoundationChangedPayload) => void,
  ) => (() => void) | undefined
  subscribeToLiveSessionSnapshots: (
    listener: (sessionId: string) => void,
  ) => (() => void) | undefined
}

export function createFoundationService(options: CreateDatabaseServiceOptions): FoundationService {
  const foundationUpdateListeners = new Set<(payload: FoundationChangedPayload) => void>()
  const emitPayload = (payload: FoundationChangedPayload): void => {
    for (const listener of foundationUpdateListeners) {
      listener(payload)
    }
  }
  let foundationChangeBroadcaster: ReturnType<typeof createFoundationChangeBroadcaster> | null =
    null
  const emitFoundationChanged = (): void => {
    foundationChangeBroadcaster?.broadcast()
  }
  const database = createDatabaseService(options)
  const droidCliStatus = resolveDroidCliStatus()
  const foundationBootstrapState = createFoundationBootstrapState({
    droidPath: droidCliStatus.path ?? undefined,
    onChange: emitFoundationChanged,
  })
  const scanner = createBackgroundArtifactScanner({
    userDataPath: options.userDataPath,
    sessionsRoot: join(homedir(), '.factory', 'sessions'),
  })
  const sessionsRoot = join(homedir(), '.factory', 'sessions')
  const daemonTransport = createDaemonTransport({
    authProvider: createEnvironmentDaemonAuthProvider(),
    onStateChange: () => {
      emitFoundationChanged()
    },
  })
  const sessionProcessManager = createSessionProcessManager({
    database,
    droidPath: droidCliStatus.path ?? undefined,
  })
  const liveSessionRuntime = createFoundationLiveSessionRuntime({
    onChange: emitFoundationChanged,
    sessionProcessManager,
  })
  const sessionCatalog = createFoundationSessionCatalog({
    database,
    scanner,
    daemonTransport,
    onChange: emitFoundationChanged,
  })
  const queries = createFoundationQueries({
    database,
    sessionCatalog,
    daemonTransport,
    droidCliStatus,
    getFactorySettingsBootstrap: foundationBootstrapState.getSnapshot,
  })
  foundationChangeBroadcaster = createFoundationChangeBroadcaster({
    getSnapshot: queries.getBootstrap,
    emit: emitPayload,
  })
  const daemonSessionControl = createDaemonSessionControl({
    daemonTransport,
    liveSessionRuntime,
    sessionCatalog,
    sessionsRoot,
  })
  foundationChangeBroadcaster.prime()
  daemonTransport.start()
  void foundationBootstrapState.refreshFromDroidCli()

  return {
    close: () => {
      sessionCatalog.close()
      void daemonTransport.stop()
      void liveSessionRuntime.dispose()
      database.close()
    },
    createSession: liveSessionRuntime.createSession,
    getSessionSnapshot: liveSessionRuntime.getSessionSnapshot,
    listLiveSessionSnapshots: liveSessionRuntime.listLiveSessionSnapshots,
    listLiveSessionNotificationSummaries: liveSessionRuntime.listLiveSessionNotificationSummaries,
    attachSession: liveSessionRuntime.attachSession,
    detachSession: liveSessionRuntime.detachSession,
    addUserMessage: liveSessionRuntime.addUserMessage,
    renameSession: async (sessionId, title) => {
      await liveSessionRuntime.renameSession(sessionId, title)
      emitFoundationChanged()
    },
    updateSessionSettings: liveSessionRuntime.updateSessionSettings,
    resolvePermissionRequest: liveSessionRuntime.resolvePermissionRequest,
    resolveAskUserRequest: liveSessionRuntime.resolveAskUserRequest,
    getRewindInfo: liveSessionRuntime.getRewindInfo,
    executeRewind: async (sessionId, params, viewerId) => {
      const result = await liveSessionRuntime.executeRewind(sessionId, params, viewerId)
      emitFoundationChanged()
      return result
    },
    compactSession: async (sessionId, customInstructions, viewerId) => {
      const result = await liveSessionRuntime.compactSession(
        sessionId,
        customInstructions,
        viewerId,
      )
      emitFoundationChanged()
      return result
    },
    forkSession: liveSessionRuntime.forkSession,
    forkSessionViaDaemon: async (sessionId, viewerId) => {
      const snapshot = await daemonSessionControl.forkSession(sessionId, viewerId)
      emitFoundationChanged()
      return snapshot
    },
    renameSessionViaDaemon: async (sessionId, title) => {
      await daemonSessionControl.renameSession(sessionId, title)
      emitFoundationChanged()
    },
    interruptSession: liveSessionRuntime.interruptSession,
    getBootstrap: queries.getBootstrap,
    getDatabaseDiagnostics: queries.getDatabaseDiagnostics,
    listProjects: queries.listProjects,
    listSessions: queries.listSessions,
    listSyncMetadata: queries.listSyncMetadata,
    getSessionTranscript: queries.getSessionTranscript,
    subscribeToFoundationUpdates: (listener) => {
      foundationUpdateListeners.add(listener)

      return () => {
        foundationUpdateListeners.delete(listener)
      }
    },
    subscribeToLiveSessionSnapshots: liveSessionRuntime.subscribeToSnapshots,
  }
}

export {
  createFoundationBootstrapState,
  parseDroidExecHelpBootstrap,
  type ReadFoundationBootstrapOptions,
  readDroidExecHelp,
  readFactorySettingsBootstrap,
  readFoundationBootstrap,
}
