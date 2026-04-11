import type { SessionEvent } from './sessionEvents'

export const FACTORY_API_VERSION = '1.0.0'
export const JSON_RPC_VERSION = '2.0'

export type JsonRpcId = string | number

export interface JsonRpcRequestEnvelope<TParams = unknown> {
  readonly jsonrpc: typeof JSON_RPC_VERSION
  readonly factoryApiVersion: typeof FACTORY_API_VERSION
  readonly type: 'request'
  readonly id: JsonRpcId
  readonly method: string
  readonly params: TParams
}

export interface JsonRpcSuccessEnvelope<TResult = unknown> {
  readonly jsonrpc: typeof JSON_RPC_VERSION
  readonly factoryApiVersion: typeof FACTORY_API_VERSION
  readonly type: 'response'
  readonly id: JsonRpcId
  readonly result: TResult
}

export interface JsonRpcErrorEnvelope {
  readonly jsonrpc: typeof JSON_RPC_VERSION
  readonly factoryApiVersion: typeof FACTORY_API_VERSION
  readonly type: 'response'
  readonly id: JsonRpcId
  readonly error: {
    readonly code: number
    readonly message: string
    readonly data?: unknown
  }
}

export interface JsonRpcNotificationEnvelope<TParams = unknown> {
  readonly jsonrpc: typeof JSON_RPC_VERSION
  readonly factoryApiVersion: typeof FACTORY_API_VERSION
  readonly type: 'notification'
  readonly method: string
  readonly params: TParams
}

export type StreamJsonRpcEnvelope<TResult = unknown, TParams = unknown> =
  | JsonRpcRequestEnvelope<TParams>
  | JsonRpcSuccessEnvelope<TResult>
  | JsonRpcErrorEnvelope
  | JsonRpcNotificationEnvelope<TParams>

export type SessionEventSink = (event: SessionEvent) => Promise<void> | void
export type Unsubscribe = () => void

export interface StreamJsonRpcTransport {
  readonly id: 'stream-jsonrpc'
  readonly factoryApiVersion: typeof FACTORY_API_VERSION
  sendRequest<TResult = unknown, TParams = unknown>(
    method: string,
    params: TParams,
  ): Promise<TResult>
  subscribe(sink: SessionEventSink): Unsubscribe
}
