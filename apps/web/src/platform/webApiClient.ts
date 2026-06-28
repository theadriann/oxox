import { createOxoxBridge } from '../../../desktop/src/preload/bridge'
import {
  buildPlatformApiClient,
  type PlatformApiClient,
} from '../../../desktop/src/renderer/src/platform/apiClient'

type InvokePayload = {
  result?: unknown
  error?: {
    message?: string
  }
}

type Listener = (event: unknown, payload: unknown) => void

function resolveApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_OXOX_API_URL as string | undefined
  const baseUrl = configuredUrl?.trim() || window.location.origin

  return baseUrl.replace(/\/+$/u, '')
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

  constructor(private readonly baseUrl: string) {}

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
      this.source = new EventSource(`${this.baseUrl}/events`)
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
  const eventStream = new OxoxEventStream(baseUrl)
  const invoke = async <TResult>(channel: string, ...args: unknown[]): Promise<TResult> => {
    const response = await fetch(`${baseUrl}/rpc/${encodeURIComponent(channel)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ args }),
    })
    const payload = await readInvokePayload(response)

    if (!response.ok) {
      throw new Error(payload?.error?.message ?? `OXOX daemon request failed: ${response.status}`)
    }

    return payload?.result as TResult
  }
  const bridge = createOxoxBridge(
    invoke,
    (channel, listener) => eventStream.subscribe(channel, listener),
    (channel, listener) => eventStream.unsubscribe(channel, listener),
  )
  bridge.dialog.selectDirectory = async () => promptForDaemonWorkspacePath()

  return buildPlatformApiClient(bridge)
}
