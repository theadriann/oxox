import { createOxoxBridge } from '../../../desktop/src/preload/bridge'
import {
  buildPlatformApiClient,
  type PlatformApiClient,
} from '../../../desktop/src/renderer/src/platform/apiClient'
import { IPC_CHANNELS } from '../../../desktop/src/shared/ipc/contracts'

type InvokePayload = {
  result?: unknown
  error?: {
    message?: string
  }
}

type Listener = (event: unknown, payload: unknown) => void

const WEB_RPC_TIMEOUT_MS = 30_000

function resolveApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_OXOX_API_URL as string | undefined
  const baseUrl = configuredUrl?.trim() || window.location.origin

  return baseUrl.replace(/\/+$/u, '')
}

function resolveRemoteAccessParams(): URLSearchParams | null {
  const searchParams = new URLSearchParams(window.location.search)
  const hostId = searchParams.get('hostId') ?? searchParams.get('remoteHostId')
  const token = searchParams.get('token') ?? searchParams.get('remoteToken')

  if (!hostId || !token) {
    return null
  }

  return new URLSearchParams({ hostId, token })
}

function withRemoteAccessParams(path: string, remoteAccessParams: URLSearchParams | null): string {
  if (!remoteAccessParams) {
    return path
  }

  return `${path}?${remoteAccessParams.toString()}`
}

async function readInvokePayload(response: Response): Promise<InvokePayload | null> {
  try {
    return (await response.json()) as InvokePayload
  } catch {
    return null
  }
}

class OxoxEventStream {
  private readonly listeners = new Map<string, Map<Listener, EventListener>>()
  private source: EventSource | null = null

  constructor(
    private readonly baseUrl: string,
    private readonly remoteAccessParams: URLSearchParams | null,
  ) {}

  subscribe(channel: string, listener: Listener): void {
    const source = this.ensureSource()
    const wrappedListener: EventListener = (event) => {
      const message = event as MessageEvent<string>
      listener(undefined, JSON.parse(message.data) as unknown)
    }

    let channelListeners = this.listeners.get(channel)
    if (!channelListeners) {
      channelListeners = new Map()
      this.listeners.set(channel, channelListeners)
    }

    channelListeners.set(listener, wrappedListener)
    source.addEventListener(channel, wrappedListener)
  }

  unsubscribe(channel: string, listener: Listener): void {
    const channelListeners = this.listeners.get(channel)
    const wrappedListener = channelListeners?.get(listener)

    if (!wrappedListener || !this.source) {
      return
    }

    this.source.removeEventListener(channel, wrappedListener)
    channelListeners?.delete(listener)
  }

  private ensureSource(): EventSource {
    if (!this.source) {
      this.source = new EventSource(
        `${this.baseUrl}${withRemoteAccessParams('/events', this.remoteAccessParams)}`,
        { withCredentials: true },
      )
    }

    return this.source
  }
}

function promptForDaemonWorkspacePath(): string | null {
  const selectedPath = window
    .prompt('Enter a workspace path on the machine running the OXOX daemon:')
    ?.trim()

  return selectedPath && selectedPath.length > 0 ? selectedPath : null
}

export function createWebPlatformApiClient(baseUrl = resolveApiBaseUrl()): PlatformApiClient {
  const remoteAccessParams = resolveRemoteAccessParams()
  const eventStream = new OxoxEventStream(baseUrl, remoteAccessParams)
  const invoke = async <TResult>(channel: string, ...args: unknown[]): Promise<TResult> => {
    const abortController = new AbortController()
    const timeout = window.setTimeout(() => abortController.abort(), WEB_RPC_TIMEOUT_MS)

    try {
      const response = await fetch(
        `${baseUrl}${withRemoteAccessParams(`/rpc/${encodeURIComponent(channel)}`, remoteAccessParams)}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ args }),
          credentials: 'include',
          signal: abortController.signal,
        },
      )
      const payload = await readInvokePayload(response)

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? `OXOX daemon request failed: ${response.status}`)
      }

      return payload?.result as TResult
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('OXOX daemon request timed out.')
      }

      throw error
    } finally {
      window.clearTimeout(timeout)
    }
  }
  const bridge = createOxoxBridge(
    invoke,
    (channel, listener) => eventStream.subscribe(channel, listener),
    (channel, listener) => eventStream.unsubscribe(channel, listener),
  )
  bridge.dialog.selectDirectory = async () => promptForDaemonWorkspacePath()

  return buildPlatformApiClient(bridge)
}

export type WebRemoteAuthenticationState =
  | { status: 'authenticated' }
  | { status: 'unauthenticated'; statusCode: number; message: string }
  | { status: 'unavailable'; message: string }

export async function checkWebRemoteAuthentication(
  baseUrl = resolveApiBaseUrl(),
): Promise<WebRemoteAuthenticationState> {
  const remoteAccessParams = resolveRemoteAccessParams()
  const abortController = new AbortController()
  const timeout = window.setTimeout(() => abortController.abort(), WEB_RPC_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${baseUrl}${withRemoteAccessParams(`/rpc/${encodeURIComponent(IPC_CHANNELS.runtimeInfo)}`, remoteAccessParams)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ args: [] }),
        credentials: 'include',
        signal: abortController.signal,
      },
    )
    const payload = await readInvokePayload(response)

    if (response.ok) {
      return { status: 'authenticated' }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: 'unauthenticated',
        statusCode: response.status,
        message: payload?.error?.message ?? 'Remote access is not authorized.',
      }
    }

    return {
      status: 'unavailable',
      message: payload?.error?.message ?? `OXOX daemon request failed: ${response.status}`,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { status: 'unavailable', message: 'OXOX daemon request timed out.' }
    }

    return {
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'Unable to reach the OXOX daemon.',
    }
  } finally {
    window.clearTimeout(timeout)
  }
}
