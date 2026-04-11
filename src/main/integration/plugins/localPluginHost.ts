import { spawn } from 'node:child_process'

import type {
  PluginCapabilityErrorMessage,
  PluginCapabilityInvokeMessage,
  PluginCapabilityInvokeResult,
  PluginCapabilityResultMessage,
  PluginHostErrorMessage,
  PluginHostMessage,
  PluginHostReadyMessage,
  PluginHostSnapshot,
} from '../../../shared/plugins/contracts'
import type { RegisteredPlugin } from '../../app/PluginRegistry'
import { consumeReadable, waitForExit } from '../sessions/processLifecycle'
import type { ReadableLike } from '../sessions/types'

export interface SpawnPluginProcessRequest {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

export interface PluginChildProcess {
  pid?: number
  stdin: {
    write: (chunk: string | Uint8Array) => boolean | undefined
  }
  stdout: ReadableLike
  stderr?: ReadableLike
  kill: () => void
  exited?: Promise<number | null>
}

export interface LocalPluginHostManager {
  registerPlugins: (plugins: RegisteredPlugin[]) => void
  startAll: () => Promise<void>
  invokeCapability: (
    capabilityId: string,
    payload?: unknown,
  ) => Promise<PluginCapabilityInvokeResult>
  listHosts: () => PluginHostSnapshot[]
  subscribe: (listener: (snapshot: PluginHostSnapshot) => void) => () => void
  dispose: () => Promise<void>
}

export interface CreateLocalPluginHostManagerOptions {
  spawnProcess?: (request: SpawnPluginProcessRequest) => PluginChildProcess
}

interface ManagedPluginHost {
  plugin: RegisteredPlugin
  child: PluginChildProcess | null
  snapshot: PluginHostSnapshot
  restartAttempts: number
  nextRequestId: number
  pendingInvocations: Map<
    string,
    {
      capabilityId: string
      resolve: (result: PluginCapabilityInvokeResult) => void
      reject: (error: unknown) => void
    }
  >
}

export function createLocalPluginHostManager({
  spawnProcess = spawnPluginProcess,
}: CreateLocalPluginHostManagerOptions = {}): LocalPluginHostManager {
  const hosts = new Map<string, ManagedPluginHost>()
  const listeners = new Set<(snapshot: PluginHostSnapshot) => void>()
  let disposed = false

  const emitSnapshot = (snapshot: PluginHostSnapshot): void => {
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  const startHost = (host: ManagedPluginHost, lastError: string | null = null): void => {
    const child = spawnProcess(createSpawnRequest(host.plugin))
    host.child = child
    host.snapshot = {
      pluginId: host.plugin.manifest.id,
      processId: child.pid ?? null,
      status: 'starting',
      lastError,
    }
    emitSnapshot(host.snapshot)
    bindChildLifecycle(host, child, () => disposed, emitSnapshot, startHost)
  }

  return {
    registerPlugins: (plugins) => {
      hosts.clear()
      disposed = false

      for (const plugin of plugins) {
        const host: ManagedPluginHost = {
          plugin,
          child: null,
          snapshot: {
            pluginId: plugin.manifest.id,
            processId: null,
            status: 'stopped',
            lastError: null,
          },
          restartAttempts: 0,
          nextRequestId: 0,
          pendingInvocations: new Map(),
        }

        hosts.set(plugin.manifest.id, host)
        emitSnapshot(host.snapshot)
      }
    },
    startAll: async () => {
      for (const host of hosts.values()) {
        if (!host.plugin.source || host.child) {
          continue
        }

        try {
          startHost(host)
        } catch (error) {
          host.snapshot = {
            pluginId: host.plugin.manifest.id,
            processId: null,
            status: 'error',
            lastError: error instanceof Error ? error.message : 'Unknown plugin host failure.',
          }
          emitSnapshot(host.snapshot)
        }
      }
    },
    invokeCapability: (capabilityId, payload) => {
      const host = Array.from(hosts.values()).find((candidate) =>
        candidate.plugin.capabilities.some((capability) => capability.qualifiedId === capabilityId),
      )

      if (!host) {
        return Promise.reject(new Error(`Plugin capability "${capabilityId}" is not registered.`))
      }

      if (!host.child || host.snapshot.status !== 'running') {
        return Promise.reject(
          new Error(`Plugin host for capability "${capabilityId}" is not ready.`),
        )
      }

      const requestId = `${host.plugin.manifest.id}:${++host.nextRequestId}`
      const message: PluginCapabilityInvokeMessage = {
        type: 'capability.invoke',
        protocolVersion: '1.0.0',
        requestId,
        capabilityId,
        ...(payload === undefined ? {} : { payload }),
      }

      const resultPromise = new Promise<PluginCapabilityInvokeResult>((resolve, reject) => {
        host.pendingInvocations.set(requestId, {
          capabilityId,
          resolve,
          reject,
        })
      })

      host.child.stdin.write(`${JSON.stringify(message)}\n`)
      return resultPromise
    },
    listHosts: () => Array.from(hosts.values()).map((host) => host.snapshot),
    subscribe: (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    dispose: async () => {
      disposed = true

      for (const host of hosts.values()) {
        rejectPendingInvocations(host, new Error('Plugin host disposed.'))
        host.child?.kill()
        host.child = null
        host.snapshot = {
          pluginId: host.plugin.manifest.id,
          processId: null,
          status: 'stopped',
          lastError: null,
        }
        emitSnapshot(host.snapshot)
      }
    },
  }
}

function createSpawnRequest(plugin: RegisteredPlugin): SpawnPluginProcessRequest {
  if (!plugin.source) {
    throw new Error(`Plugin "${plugin.manifest.id}" is missing its source metadata.`)
  }

  return {
    command: process.execPath,
    args: [plugin.source.entryPointPath],
    cwd: plugin.source.pluginPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OXOX_PLUGIN_ID: plugin.manifest.id,
      OXOX_PLUGIN_MANIFEST_PATH: plugin.source.manifestPath,
      OXOX_PLUGIN_CAPABILITIES: plugin.capabilities
        .map((capability) => capability.qualifiedId)
        .join(','),
      OXOX_PLUGIN_PERMISSIONS: plugin.manifest.sandbox.permissions.join(','),
    },
  }
}

function spawnPluginProcess(_request: SpawnPluginProcessRequest): PluginChildProcess {
  const child = spawn(_request.command, _request.args, {
    cwd: _request.cwd,
    env: _request.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  return Object.assign(child, {
    exited: new Promise<number | null>((resolve) => {
      child.once('exit', resolve)
    }),
  })
}

function bindChildLifecycle(
  host: ManagedPluginHost,
  child: PluginChildProcess,
  isDisposed: () => boolean,
  emitSnapshot: (snapshot: PluginHostSnapshot) => void,
  restartHost: (host: ManagedPluginHost, lastError?: string | null) => void,
): void {
  const lineBuffer = new PluginLineBuffer()

  consumeReadable(child.stdout, (text) => {
    for (const line of lineBuffer.write(text)) {
      handleProtocolLine(host, line, emitSnapshot)
    }
  }).catch((error) => {
    rejectPendingInvocations(host, error)
    host.snapshot = {
      pluginId: host.plugin.manifest.id,
      processId: child.pid ?? null,
      status: 'error',
      lastError: error instanceof Error ? error.message : 'Plugin host stream failure.',
    }
    emitSnapshot(host.snapshot)
  })

  if (child.stderr) {
    consumeReadable(child.stderr, () => undefined).catch(() => undefined)
  }

  void waitForExit(child).then((code) => {
    for (const line of lineBuffer.flush()) {
      handleProtocolLine(host, line, emitSnapshot)
    }

    host.child = null

    if (isDisposed()) {
      return
    }

    if (code === 0) {
      if (host.snapshot.status === 'starting') {
        rejectPendingInvocations(host, new Error('Plugin host exited before reporting readiness.'))
        host.snapshot = {
          pluginId: host.plugin.manifest.id,
          processId: null,
          status: 'error',
          lastError: 'Plugin host exited before reporting readiness.',
        }
      } else if (host.snapshot.status !== 'error') {
        rejectPendingInvocations(host, new Error('Plugin host stopped before responding.'))
        host.snapshot = {
          pluginId: host.plugin.manifest.id,
          processId: null,
          status: 'stopped',
          lastError: null,
        }
      }

      emitSnapshot(host.snapshot)
      return
    }

    const exitError = `Plugin host exited unexpectedly with code ${code ?? 'unknown'}.`
    rejectPendingInvocations(host, new Error(exitError))

    if (host.snapshot.status !== 'error' && host.restartAttempts < MAX_PLUGIN_HOST_RESTARTS) {
      host.restartAttempts += 1

      try {
        restartHost(host, `Restarting after unexpected exit with code ${code ?? 'unknown'}.`)
        return
      } catch (error) {
        host.snapshot = {
          pluginId: host.plugin.manifest.id,
          processId: null,
          status: 'error',
          lastError:
            error instanceof Error ? error.message : 'Plugin host restart failed unexpectedly.',
        }
        emitSnapshot(host.snapshot)
        return
      }
    }

    host.snapshot = {
      pluginId: host.plugin.manifest.id,
      processId: null,
      status: 'error',
      lastError: exitError,
    }
    emitSnapshot(host.snapshot)
  })
}

function handleProtocolLine(
  host: ManagedPluginHost,
  line: string,
  emitSnapshot: (snapshot: PluginHostSnapshot) => void,
): void {
  let message: PluginHostMessage

  try {
    message = JSON.parse(line) as PluginHostMessage
  } catch {
    host.snapshot = {
      pluginId: host.plugin.manifest.id,
      processId: host.snapshot.processId,
      status: 'error',
      lastError: 'Plugin host emitted invalid protocol output.',
    }
    emitSnapshot(host.snapshot)
    return
  }

  if (!isPluginHostMessage(message) || message.protocolVersion !== '1.0.0') {
    host.snapshot = {
      pluginId: host.plugin.manifest.id,
      processId: host.snapshot.processId,
      status: 'error',
      lastError: 'Plugin host emitted an unsupported protocol message.',
    }
    emitSnapshot(host.snapshot)
    return
  }

  if (message.type === 'host.ready') {
    host.restartAttempts = 0
    host.snapshot = {
      pluginId: host.plugin.manifest.id,
      processId: host.snapshot.processId,
      status: 'running',
      lastError: null,
    }
    emitSnapshot(host.snapshot)
    return
  }

  if (message.type === 'capability.result') {
    const pendingInvocation = host.pendingInvocations.get(message.requestId)

    if (!pendingInvocation) {
      return
    }

    host.pendingInvocations.delete(message.requestId)
    pendingInvocation.resolve({
      capabilityId: pendingInvocation.capabilityId,
      payload: message.payload,
    })
    return
  }

  if (message.type === 'capability.error') {
    const pendingInvocation = host.pendingInvocations.get(message.requestId)

    if (!pendingInvocation) {
      return
    }

    host.pendingInvocations.delete(message.requestId)
    pendingInvocation.reject(new Error(message.message))
    return
  }

  rejectPendingInvocations(host, new Error(message.message))
  host.snapshot = {
    pluginId: host.plugin.manifest.id,
    processId: host.snapshot.processId,
    status: 'error',
    lastError: message.message,
  }
  emitSnapshot(host.snapshot)
}

function isPluginHostMessage(message: unknown): message is PluginHostMessage {
  return (
    isPluginHostReadyMessage(message) ||
    isPluginHostErrorMessage(message) ||
    isPluginCapabilityResultMessage(message) ||
    isPluginCapabilityErrorMessage(message)
  )
}

function isPluginHostReadyMessage(message: unknown): message is PluginHostReadyMessage {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    'type' in message &&
    'protocolVersion' in message &&
    message.type === 'host.ready' &&
    message.protocolVersion === '1.0.0'
  )
}

function isPluginHostErrorMessage(message: unknown): message is PluginHostErrorMessage {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    'type' in message &&
    'protocolVersion' in message &&
    'message' in message &&
    message.type === 'host.error' &&
    message.protocolVersion === '1.0.0' &&
    typeof message.message === 'string'
  )
}

function isPluginCapabilityResultMessage(
  message: unknown,
): message is PluginCapabilityResultMessage {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    'type' in message &&
    'protocolVersion' in message &&
    'requestId' in message &&
    message.type === 'capability.result' &&
    message.protocolVersion === '1.0.0' &&
    typeof message.requestId === 'string'
  )
}

function isPluginCapabilityErrorMessage(message: unknown): message is PluginCapabilityErrorMessage {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    'type' in message &&
    'protocolVersion' in message &&
    'requestId' in message &&
    'message' in message &&
    message.type === 'capability.error' &&
    message.protocolVersion === '1.0.0' &&
    typeof message.requestId === 'string' &&
    typeof message.message === 'string'
  )
}

function rejectPendingInvocations(host: ManagedPluginHost, error: unknown): void {
  for (const pendingInvocation of host.pendingInvocations.values()) {
    pendingInvocation.reject(error)
  }

  host.pendingInvocations.clear()
}

const MAX_PLUGIN_HOST_RESTARTS = 1

class PluginLineBuffer {
  private buffer = ''

  write(chunk: string): string[] {
    this.buffer += chunk

    const lines: string[] = []
    let newlineIndex = this.buffer.indexOf('\n')

    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)

      if (line.length > 0) {
        lines.push(line)
      }

      newlineIndex = this.buffer.indexOf('\n')
    }

    return lines
  }

  flush(): string[] {
    const remainder = this.buffer.trim()
    this.buffer = ''
    return remainder.length > 0 ? [remainder] : []
  }
}
