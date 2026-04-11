import { describe, expect, it, vi } from 'vitest'

import type { RegisteredPlugin } from '../../app/PluginRegistry'
import { createLocalPluginHostManager } from '../plugins/localPluginHost'

function createRegisteredPlugin(
  overrides: Partial<RegisteredPlugin> & Pick<RegisteredPlugin, 'manifest'>,
): RegisteredPlugin {
  return {
    manifest: overrides.manifest,
    capabilities:
      overrides.capabilities ??
      overrides.manifest.capabilities.map((capability) => ({
        qualifiedId: `${overrides.manifest.id}:${capability.name}`,
        pluginId: overrides.manifest.id,
        capability,
      })),
    source: overrides.source ?? {
      pluginPath: `/tmp/${overrides.manifest.id}`,
      manifestPath: `/tmp/${overrides.manifest.id}/oxox-plugin.json`,
      entryPointPath: `/tmp/${overrides.manifest.id}/dist/index.js`,
    },
  }
}

const encoder = new TextEncoder()

class FakePluginChildProcess {
  readonly pid: number
  readonly stdin = {
    write: vi.fn((chunk: string) => {
      this.writes.push(chunk)
      return true
    }),
  }
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array>
  readonly writes: string[] = []

  stdoutWriter: WritableStreamDefaultWriter<Uint8Array>
  stderrWriter: WritableStreamDefaultWriter<Uint8Array>
  kill = vi.fn(() => {
    this.emitExit(this.exitCode ?? 0)
  })
  exitCode: number | null = null

  private resolveExit!: (code: number | null) => void
  readonly exited = new Promise<number | null>((resolve) => {
    this.resolveExit = resolve
  })

  constructor(pid: number) {
    this.pid = pid

    const stdoutStream = new TransformStream<Uint8Array, Uint8Array>()
    const stderrStream = new TransformStream<Uint8Array, Uint8Array>()

    this.stdout = stdoutStream.readable
    this.stderr = stderrStream.readable
    this.stdoutWriter = stdoutStream.writable.getWriter()
    this.stderrWriter = stderrStream.writable.getWriter()
  }

  emitStdout(message: unknown): void {
    void this.stdoutWriter.write(encoder.encode(`${JSON.stringify(message)}\n`))
  }

  emitStderr(text: string): void {
    void this.stderrWriter.write(encoder.encode(text))
  }

  emitExit(code: number): void {
    this.exitCode = code
    void this.stdoutWriter.close()
    void this.stderrWriter.close()
    this.resolveExit(code)
  }
}

function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve()
        return
      }

      if (Date.now() >= deadline) {
        reject(new Error(`timed out after ${timeoutMs}ms`))
        return
      }

      setTimeout(tick, 10)
    }

    tick()
  })
}

describe('createLocalPluginHostManager', () => {
  it('starts registered plugins in isolated node-mode child processes and waits for readiness handshake', async () => {
    const child = new FakePluginChildProcess(4242)
    const spawnProcess = vi.fn(() => child)
    const manager = createLocalPluginHostManager({ spawnProcess })

    manager.registerPlugins([
      createRegisteredPlugin({
        manifest: {
          id: 'plugin.example',
          displayName: 'Example Plugin',
          version: '1.0.0',
          entryPoint: './dist/index.js',
          capabilities: [
            {
              kind: 'session-action',
              name: 'summarize',
              displayName: 'Summarize Session',
            },
          ],
          sandbox: {
            kind: 'node-process',
            permissions: ['session:read'],
          },
        },
      }),
    ])

    await manager.startAll()

    expect(spawnProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        command: process.execPath,
        args: ['/tmp/plugin.example/dist/index.js'],
        cwd: '/tmp/plugin.example',
        env: expect.objectContaining({
          ELECTRON_RUN_AS_NODE: '1',
          OXOX_PLUGIN_ID: 'plugin.example',
          OXOX_PLUGIN_PERMISSIONS: 'session:read',
          OXOX_PLUGIN_CAPABILITIES: 'plugin.example:summarize',
          OXOX_PLUGIN_MANIFEST_PATH: '/tmp/plugin.example/oxox-plugin.json',
        }),
      }),
    )

    expect(manager.listHosts()).toEqual([
      expect.objectContaining({
        pluginId: 'plugin.example',
        processId: 4242,
        status: 'starting',
      }),
    ])

    child.emitStdout({
      type: 'host.ready',
      protocolVersion: '1.0.0',
    })

    await waitFor(() =>
      manager
        .listHosts()
        .some((host) => host.pluginId === 'plugin.example' && host.status === 'running'),
    )

    expect(manager.listHosts()).toEqual([
      expect.objectContaining({
        pluginId: 'plugin.example',
        processId: 4242,
        status: 'running',
      }),
    ])
  })

  it('disposes running plugin hosts and marks failed starts without crashing the manager', async () => {
    const runningChild = new FakePluginChildProcess(5252)
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(runningChild)
      .mockImplementationOnce(() => {
        throw new Error('spawn failed')
      })
    const manager = createLocalPluginHostManager({ spawnProcess })

    manager.registerPlugins([
      createRegisteredPlugin({
        manifest: {
          id: 'plugin.running',
          displayName: 'Running Plugin',
          version: '1.0.0',
          entryPoint: './dist/index.js',
          capabilities: [],
          sandbox: {
            kind: 'node-process',
            permissions: [],
          },
        },
      }),
      createRegisteredPlugin({
        manifest: {
          id: 'plugin.broken',
          displayName: 'Broken Plugin',
          version: '1.0.0',
          entryPoint: './dist/index.js',
          capabilities: [],
          sandbox: {
            kind: 'node-process',
            permissions: [],
          },
        },
      }),
    ])

    await manager.startAll()
    runningChild.emitStdout({
      type: 'host.ready',
      protocolVersion: '1.0.0',
    })

    await waitFor(() =>
      manager
        .listHosts()
        .some((host) => host.pluginId === 'plugin.running' && host.status === 'running'),
    )

    expect(manager.listHosts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginId: 'plugin.running',
          status: 'running',
          processId: 5252,
        }),
        expect.objectContaining({
          pluginId: 'plugin.broken',
          status: 'error',
          processId: null,
          lastError: 'spawn failed',
        }),
      ]),
    )

    await manager.dispose()

    expect(runningChild.kill).toHaveBeenCalledWith()
    expect(manager.listHosts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginId: 'plugin.running',
          status: 'stopped',
          processId: null,
        }),
      ]),
    )
  })

  it('emits host snapshots when plugin host lifecycle changes', async () => {
    const child = new FakePluginChildProcess(6161)
    const manager = createLocalPluginHostManager({
      spawnProcess: vi.fn(() => child),
    })
    const listener = vi.fn()

    manager.subscribe(listener)
    manager.registerPlugins([
      createRegisteredPlugin({
        manifest: {
          id: 'plugin.observable',
          displayName: 'Observable Plugin',
          version: '1.0.0',
          entryPoint: './dist/index.js',
          capabilities: [],
          sandbox: {
            kind: 'node-process',
            permissions: [],
          },
        },
      }),
    ])

    await manager.startAll()
    child.emitStdout({
      type: 'host.ready',
      protocolVersion: '1.0.0',
    })
    await waitFor(() =>
      listener.mock.calls.some(
        ([snapshot]) => snapshot.pluginId === 'plugin.observable' && snapshot.status === 'running',
      ),
    )
    await manager.dispose()

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'plugin.observable',
        status: 'stopped',
      }),
    )
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'plugin.observable',
        status: 'starting',
        processId: 6161,
      }),
    )
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'plugin.observable',
        status: 'running',
        processId: 6161,
      }),
    )
  })

  it('marks plugin hosts as errored when the host protocol reports an error or exits unexpectedly', async () => {
    const child = new FakePluginChildProcess(7171)
    const manager = createLocalPluginHostManager({
      spawnProcess: vi.fn(() => child),
    })

    manager.registerPlugins([
      createRegisteredPlugin({
        manifest: {
          id: 'plugin.faulty',
          displayName: 'Faulty Plugin',
          version: '1.0.0',
          entryPoint: './dist/index.js',
          capabilities: [],
          sandbox: {
            kind: 'node-process',
            permissions: [],
          },
        },
      }),
    ])

    await manager.startAll()
    child.emitStdout({
      type: 'host.error',
      protocolVersion: '1.0.0',
      message: 'Plugin bootstrap failed',
    })

    await waitFor(() =>
      manager
        .listHosts()
        .some((host) => host.pluginId === 'plugin.faulty' && host.status === 'error'),
    )

    expect(manager.listHosts()).toEqual([
      expect.objectContaining({
        pluginId: 'plugin.faulty',
        status: 'error',
        lastError: 'Plugin bootstrap failed',
      }),
    ])

    child.emitExit(1)

    await waitFor(() =>
      manager
        .listHosts()
        .some(
          (host) =>
            host.pluginId === 'plugin.faulty' &&
            host.status === 'error' &&
            host.lastError === 'Plugin host exited unexpectedly with code 1.',
        ),
    )
  })

  it('invokes plugin capabilities over the host protocol and resolves typed results', async () => {
    const child = new FakePluginChildProcess(8181)
    const manager = createLocalPluginHostManager({
      spawnProcess: vi.fn(() => child),
    })

    manager.registerPlugins([
      createRegisteredPlugin({
        manifest: {
          id: 'plugin.invokable',
          displayName: 'Invokable Plugin',
          version: '1.0.0',
          entryPoint: './dist/index.js',
          capabilities: [
            {
              kind: 'session-action',
              name: 'summarize',
              displayName: 'Summarize Session',
            },
          ],
          sandbox: {
            kind: 'node-process',
            permissions: ['session:read'],
          },
        },
      }),
    ])

    await manager.startAll()
    child.emitStdout({
      type: 'host.ready',
      protocolVersion: '1.0.0',
    })
    await waitFor(() =>
      manager
        .listHosts()
        .some((host) => host.pluginId === 'plugin.invokable' && host.status === 'running'),
    )

    const resultPromise = manager.invokeCapability('plugin.invokable:summarize', {
      sessionId: 'session-1',
    })
    const requestEnvelope = JSON.parse(child.writes[0] ?? '{}') as {
      type?: string
      capabilityId?: string
      requestId?: string
      payload?: unknown
    }

    expect(requestEnvelope).toMatchObject({
      type: 'capability.invoke',
      capabilityId: 'plugin.invokable:summarize',
      payload: {
        sessionId: 'session-1',
      },
    })

    child.emitStdout({
      type: 'capability.result',
      protocolVersion: '1.0.0',
      requestId: requestEnvelope.requestId,
      payload: {
        summary: 'Done',
      },
    })

    await expect(resultPromise).resolves.toEqual({
      capabilityId: 'plugin.invokable:summarize',
      payload: {
        summary: 'Done',
      },
    })
  })

  it('restarts a running plugin host once after an unexpected exit and returns it to running', async () => {
    const firstChild = new FakePluginChildProcess(7001)
    const restartedChild = new FakePluginChildProcess(7002)
    const spawnProcess = vi.fn().mockReturnValueOnce(firstChild).mockReturnValueOnce(restartedChild)
    const manager = createLocalPluginHostManager({ spawnProcess })

    manager.registerPlugins([
      createRegisteredPlugin({
        manifest: {
          id: 'plugin.restartable',
          displayName: 'Restartable Plugin',
          version: '1.0.0',
          entryPoint: './dist/index.js',
          capabilities: [],
          sandbox: {
            kind: 'node-process',
            permissions: [],
          },
        },
      }),
    ])

    await manager.startAll()
    firstChild.emitStdout({
      type: 'host.ready',
      protocolVersion: '1.0.0',
    })
    await waitFor(() =>
      manager
        .listHosts()
        .some((host) => host.pluginId === 'plugin.restartable' && host.status === 'running'),
    )

    firstChild.emitExit(1)

    await waitFor(() =>
      manager
        .listHosts()
        .some(
          (host) =>
            host.pluginId === 'plugin.restartable' &&
            host.status === 'starting' &&
            host.processId === 7002,
        ),
    )
    expect(spawnProcess).toHaveBeenCalledTimes(2)

    restartedChild.emitStdout({
      type: 'host.ready',
      protocolVersion: '1.0.0',
    })

    await waitFor(() =>
      manager
        .listHosts()
        .some(
          (host) =>
            host.pluginId === 'plugin.restartable' &&
            host.status === 'running' &&
            host.processId === 7002,
        ),
    )
  })
})
