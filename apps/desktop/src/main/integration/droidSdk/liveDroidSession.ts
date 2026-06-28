import { randomUUID } from 'node:crypto'

import type {
  AddMcpServerRequestParams,
  AddMcpServerResult,
  AuthenticateMcpServerRequestParams,
  AuthenticateMcpServerResult,
  CompactSessionRequestParams,
  CompactSessionResult,
  ExecuteRewindRequestParams,
  ExecuteRewindResult,
  ForkSessionResult,
  GetContextStatsResult,
  GetRewindInfoRequestParams,
  GetRewindInfoResult,
  InitializeSessionResult,
  ListMcpServersResult,
  ListMcpToolsResult,
  ListSkillsResult,
  ListToolsRequestParams,
  ListToolsResult,
  LoadSessionResult,
  MessageOptions,
  RemoveMcpServerRequestParams,
  RemoveMcpServerResult,
  RenameSessionRequestParams,
  RenameSessionResult,
  ToggleMcpServerRequestParams,
  ToggleMcpServerResult,
  UpdateSessionSettingsRequestParams,
  UpdateSessionSettingsResult,
} from '@factory/droid-sdk'
import { type DroidClient, DroidSession, SDK_TAG } from '@factory/droid-sdk'

import type { LiveSessionAddUserMessageRequest } from '../../../shared/ipc/contracts'
import type { InitializeSessionRequest } from '../sessions/types'
import {
  type OxoxLiveDroidSessionLifecycleHook,
  prepareOxoxLiveDroidSessionInitializeLifecycle,
  prepareOxoxLiveDroidSessionLoadLifecycle,
  runOxoxLiveDroidSessionCleanups,
} from './liveDroidSessionLifecycle'

export type OxoxLiveDroidSessionInitResult = InitializeSessionResult | LoadSessionResult

export interface OxoxLiveDroidSessionAddUserMessageRequest
  extends LiveSessionAddUserMessageRequest {
  messageId?: string
}

export interface OxoxLiveDroidSessionOptions {
  lifecycleHooks?: readonly OxoxLiveDroidSessionLifecycleHook[]
  onStreamError?: (error: Error) => void | Promise<void>
}

const REWIND_REQUEST_TIMEOUT_MS = 120_000

interface DroidClientProtocolEngine {
  sendRequest: (
    method: string,
    params: Record<string, unknown>,
    timeout?: number,
  ) => Promise<unknown>
}

interface DroidClientWithProtocolEngine extends DroidClient {
  _engine?: DroidClientProtocolEngine
}

export class OxoxLiveDroidSession {
  constructor(
    private readonly client: DroidClient,
    private readonly sdkSession: DroidSession,
    private readonly lifecycleCleanups: Array<() => Promise<void>> = [],
    private readonly options: OxoxLiveDroidSessionOptions = {},
  ) {}

  get sessionId(): string {
    return this.sdkSession.sessionId
  }

  get initResult(): OxoxLiveDroidSessionInitResult {
    return this.sdkSession.initResult
  }

  async addUserMessage(request: OxoxLiveDroidSessionAddUserMessageRequest): Promise<string> {
    const messageId = request.messageId ?? randomUUID()
    try {
      void drainDroidSessionStream(
        this.sdkSession.stream(request.text, createDroidSessionMessageOptions(request, messageId)),
      ).catch((error) => {
        void this.reportStreamError(error)
      })
    } catch (error) {
      await this.reportStreamError(error)
      throw error
    }
    return messageId
  }

  async interrupt(): Promise<void> {
    await this.sdkSession.interrupt()
  }

  async close(): Promise<void> {
    try {
      await this.sdkSession.close()
    } finally {
      await runOxoxLiveDroidSessionCleanups(this.lifecycleCleanups)
    }
  }

  async updateSettings(
    params: Partial<UpdateSessionSettingsRequestParams>,
  ): Promise<UpdateSessionSettingsResult> {
    return this.sdkSession.updateSettings(params)
  }

  async addMcpServer(params: AddMcpServerRequestParams): Promise<AddMcpServerResult> {
    return this.sdkSession.addMcpServer(params)
  }

  async removeMcpServer(params: RemoveMcpServerRequestParams): Promise<RemoveMcpServerResult> {
    return this.sdkSession.removeMcpServer(params)
  }

  async toggleMcpServer(params: ToggleMcpServerRequestParams): Promise<ToggleMcpServerResult> {
    return this.sdkSession.toggleMcpServer(params)
  }

  async authenticateMcpServer(
    params: AuthenticateMcpServerRequestParams,
  ): Promise<AuthenticateMcpServerResult> {
    return this.sdkSession.authenticateMcpServer(params)
  }

  async listMcpServers(): Promise<ListMcpServersResult> {
    return this.sdkSession.listMcpServers()
  }

  async listMcpTools(): Promise<ListMcpToolsResult> {
    return this.sdkSession.listMcpTools()
  }

  async listTools(params: ListToolsRequestParams = {}): Promise<ListToolsResult> {
    return this.sdkSession.listTools(params)
  }

  async listSkills(): Promise<ListSkillsResult> {
    return this.sdkSession.listSkills()
  }

  async getRewindInfo(params: GetRewindInfoRequestParams): Promise<GetRewindInfoResult> {
    const engine = (this.client as DroidClientWithProtocolEngine)._engine
    if (!engine) {
      return this.sdkSession.getRewindInfo(params)
    }

    return (await engine.sendRequest(
      'droid.get_rewind_info',
      {
        sessionId: this.sessionId,
        ...params,
      },
      REWIND_REQUEST_TIMEOUT_MS,
    )) as GetRewindInfoResult
  }

  async executeRewind(params: ExecuteRewindRequestParams): Promise<ExecuteRewindResult> {
    const engine = (this.client as DroidClientWithProtocolEngine)._engine
    if (!engine) {
      return this.sdkSession.executeRewind(params)
    }

    return (await engine.sendRequest(
      'droid.execute_rewind',
      {
        sessionId: this.sessionId,
        ...params,
      },
      REWIND_REQUEST_TIMEOUT_MS,
    )) as ExecuteRewindResult
  }

  async compactSession(params?: CompactSessionRequestParams): Promise<CompactSessionResult> {
    return this.sdkSession.compactSession(params)
  }

  async fork(): Promise<ForkSessionResult> {
    return this.sdkSession.forkSession()
  }

  async getContextStats(): Promise<GetContextStatsResult> {
    return this.sdkSession.getContextStats()
  }

  async renameSession(params: RenameSessionRequestParams): Promise<RenameSessionResult> {
    return this.sdkSession.renameSession(params)
  }

  private async reportStreamError(error: unknown): Promise<void> {
    if (!this.options.onStreamError) {
      return
    }

    await this.options.onStreamError(normalizeError(error))
  }
}

export async function createOxoxLiveDroidSession(
  client: DroidClient,
  request: InitializeSessionRequest,
  options: OxoxLiveDroidSessionOptions = {},
): Promise<OxoxLiveDroidSession> {
  let currentSessionId: string | null = null
  const lifecycle = await prepareOxoxLiveDroidSessionInitializeLifecycle(
    options.lifecycleHooks ?? [],
    {
      getSessionId: () => currentSessionId,
      request,
    },
  )

  try {
    const settings = request.settings ?? {}
    const result = await client.initializeSession({
      machineId: 'oxox-electron',
      cwd: request.cwd,
      ...settings,
      tags: [SDK_TAG],
      ...mergeInitializeLifecycleParams(lifecycle.extensions),
    })
    currentSessionId = result.sessionId

    return new OxoxLiveDroidSession(
      client,
      new DroidSession(client, result.sessionId, result),
      lifecycle.cleanups,
      options,
    )
  } catch (error) {
    await runOxoxLiveDroidSessionCleanups(lifecycle.cleanups)
    throw error
  }
}

export async function loadOxoxLiveDroidSession(
  client: DroidClient,
  sessionId: string,
  options: OxoxLiveDroidSessionOptions = {},
): Promise<OxoxLiveDroidSession> {
  const lifecycle = await prepareOxoxLiveDroidSessionLoadLifecycle(options.lifecycleHooks ?? [], {
    getSessionId: () => sessionId,
    sessionId,
  })

  try {
    const result = await client.loadSession({
      sessionId,
      ...mergeLoadLifecycleParams(lifecycle.extensions),
    })
    return new OxoxLiveDroidSession(
      client,
      new DroidSession(client, sessionId, result),
      lifecycle.cleanups,
      options,
    )
  } catch (error) {
    await runOxoxLiveDroidSessionCleanups(lifecycle.cleanups)
    throw error
  }
}

export function attachOxoxLiveDroidSession(
  client: DroidClient,
  sessionId: string,
  options: OxoxLiveDroidSessionOptions = {},
): OxoxLiveDroidSession {
  return new OxoxLiveDroidSession(
    client,
    new DroidSession(client, sessionId, {
      session: { messages: [] },
    }),
    [],
    options,
  )
}

function mergeInitializeLifecycleParams(
  extensions: Awaited<
    ReturnType<typeof prepareOxoxLiveDroidSessionInitializeLifecycle>
  >['extensions'],
) {
  return Object.assign({}, ...extensions.map((extension) => extension.params ?? {}))
}

function mergeLoadLifecycleParams(
  extensions: Awaited<ReturnType<typeof prepareOxoxLiveDroidSessionLoadLifecycle>>['extensions'],
) {
  return Object.assign({}, ...extensions.map((extension) => extension.params ?? {}))
}

function createDroidSessionMessageOptions(
  request: OxoxLiveDroidSessionAddUserMessageRequest,
  messageId: string,
): MessageOptions {
  return {
    messageId,
    ...(request.images ? { images: request.images } : {}),
    ...(request.files ? { files: request.files } : {}),
    ...(request.outputFormat ? { outputFormat: request.outputFormat } : {}),
    ...(request.queuePlacement ? { queuePlacement: request.queuePlacement } : {}),
  }
}

async function drainDroidSessionStream(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _message of stream) {
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
