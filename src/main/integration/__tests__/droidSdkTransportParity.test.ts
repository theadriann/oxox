import { protocol } from '@factory/droid-sdk'
import { describe, expect, it } from 'vitest'

import { DroidSdkDaemonSessionTransport } from '../droidSdk/daemonTransport'
import {
  DROID_SDK_DAEMON_LIVE_METHODS,
  DROID_SDK_PROCESS_ONLY_METHODS,
  DROID_SDK_TRANSPORT_PARITY_METHODS,
} from '../droidSdk/parity'
import { DroidSdkSessionTransport } from '../droidSdk/transport'

function getPrototypeFunctions(implementation: {
  prototype: Record<string, unknown>
}): Set<string> {
  return new Set(
    Object.getOwnPropertyNames(implementation.prototype).filter(
      (name) => name !== 'constructor' && typeof implementation.prototype[name] === 'function',
    ),
  )
}

describe('Droid SDK transport parity guardrails', () => {
  it('keeps exec and daemon live-session transports aligned on renderer-visible actions', () => {
    const execMethods = getPrototypeFunctions(DroidSdkSessionTransport)
    const daemonMethods = getPrototypeFunctions(DroidSdkDaemonSessionTransport)

    for (const method of DROID_SDK_TRANSPORT_PARITY_METHODS) {
      expect(execMethods.has(method), `exec transport missing ${method}`).toBe(true)
      expect(daemonMethods.has(method), `daemon transport missing ${method}`).toBe(true)
    }

    for (const method of DROID_SDK_PROCESS_ONLY_METHODS) {
      expect(execMethods.has(method), `exec transport missing ${method}`).toBe(true)
      expect(daemonMethods.has(method), `daemon transport unexpectedly exposes ${method}`).toBe(
        false,
      )
    }
  })

  it('tracks low-level daemon live-session RPC fallbacks with SDK method constants', () => {
    const sdkDaemonMethods = new Set(Object.values(protocol.daemon.DaemonDroidMethod))

    expect(DROID_SDK_DAEMON_LIVE_METHODS).toEqual([
      protocol.daemon.DaemonDroidMethod.LIST_MCP_REGISTRY,
      protocol.daemon.DaemonDroidMethod.CANCEL_MCP_AUTH,
      protocol.daemon.DaemonDroidMethod.CLEAR_MCP_AUTH,
      protocol.daemon.DaemonDroidMethod.SUBMIT_MCP_AUTH_CODE,
      protocol.daemon.DaemonDroidMethod.TOGGLE_MCP_TOOL,
      protocol.daemon.DaemonDroidMethod.KILL_WORKER_SESSION,
      protocol.daemon.DaemonDroidMethod.SUBMIT_BUG_REPORT,
    ])

    for (const method of DROID_SDK_DAEMON_LIVE_METHODS) {
      expect(sdkDaemonMethods.has(method), `${method} is not exported by the SDK`).toBe(true)
    }
  })
})
