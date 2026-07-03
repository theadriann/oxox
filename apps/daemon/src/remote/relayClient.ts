import WebSocket from 'ws'

export interface RemoteRelayClientOptions {
  accessToken: string
  hostId: string
  hostToken: string
  invokeRpc: (channel: string, args: unknown[]) => Promise<unknown>
  relayUrl: string
  reconnectDelayMs?: number
}

type RelayServerMessage =
  | {
      requestId: string
      type: 'rpc.request'
      channel: string
      args?: unknown[]
    }
  | {
      type: 'host.registered'
    }

type RelayHostMessage =
  | {
      type: 'host.register'
      hostId: string
      hostToken: string
      accessToken: string
    }
  | {
      type: 'rpc.response'
      requestId: string
      result?: unknown
      error?: { message: string }
    }
  | {
      type: 'event'
      channel: string
      payload: unknown
    }

export interface RemoteRelayClient {
  publishEvent: (channel: string, payload: unknown) => void
  stop: () => void
}

export function startRemoteRelayClient(options: RemoteRelayClientOptions): RemoteRelayClient {
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const reconnectDelayMs = options.reconnectDelayMs ?? 2_500

  const send = (message: RelayHostMessage): void => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message))
    }
  }

  const connect = (): void => {
    if (stopped) {
      return
    }

    socket = new WebSocket(options.relayUrl)

    socket.on('open', () => {
      send({
        accessToken: options.accessToken,
        hostId: options.hostId,
        hostToken: options.hostToken,
        type: 'host.register',
      })
    })

    socket.on('message', (data) => {
      void handleMessage(String(data))
    })

    socket.on('close', scheduleReconnect)
    socket.on('error', scheduleReconnect)
  }

  const scheduleReconnect = (): void => {
    if (stopped || reconnectTimer) {
      return
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, reconnectDelayMs)
  }

  const handleMessage = async (rawMessage: string): Promise<void> => {
    const message = parseServerMessage(rawMessage)

    if (!message || message.type !== 'rpc.request') {
      return
    }

    try {
      const result = await options.invokeRpc(message.channel, message.args ?? [])
      send({
        requestId: message.requestId,
        result,
        type: 'rpc.response',
      })
    } catch (error) {
      send({
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
        requestId: message.requestId,
        type: 'rpc.response',
      })
    }
  }

  connect()

  return {
    publishEvent: (channel, payload) => {
      send({ channel, payload, type: 'event' })
    },
    stop: () => {
      stopped = true

      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }

      socket?.close()
    },
  }
}

function parseServerMessage(rawMessage: string): RelayServerMessage | null {
  try {
    const parsed = JSON.parse(rawMessage) as RelayServerMessage

    return typeof parsed.type === 'string' ? parsed : null
  } catch {
    return null
  }
}
