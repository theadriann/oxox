import {
  LEGACY_FACTORY_API_VERSION as FACTORY_API_VERSION,
  JSONRPC_VERSION as JSON_RPC_VERSION,
} from '@factory/droid-sdk'

import type { SessionEvent } from './sessionEvents'

export { FACTORY_API_VERSION, JSON_RPC_VERSION }

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
