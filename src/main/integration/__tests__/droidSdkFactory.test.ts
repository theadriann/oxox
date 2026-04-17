import { describe, expect, it, vi } from 'vitest'

import {
  buildDroidSdkProcessTransportOptions,
  createDroidSdkSessionFactory,
} from '../droidSdk/factory'

describe('buildDroidSdkProcessTransportOptions', () => {
  it('builds pinned stream-jsonrpc exec options for fresh sessions', () => {
    expect(
      buildDroidSdkProcessTransportOptions({
        cwd: '/tmp/workspace',
        droidPath: '/opt/factory/bin/droid',
        homeDirectory: '/Users/tester',
        processEnv: {
          PATH: '/Users/tester/.factory/bin:/usr/bin:/bin:/usr/sbin:/sbin',
          FOO: 'bar',
        },
        shellPath: '/bin/fish',
        sessionId: null,
      }),
    ).toEqual({
      cwd: '/tmp/workspace',
      env: {
        FOO: 'bar',
        PATH: [
          '/Users/tester/.factory/bin',
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin',
          '/opt/homebrew/bin',
          '/opt/homebrew/sbin',
          '/usr/local/bin',
          '/usr/local/sbin',
          '/Users/tester/Library/pnpm',
          '/Users/tester/.local/bin',
          '/Users/tester/.local/share/pnpm',
        ].join(':'),
      },
      execArgs: ['exec', '--input-format', 'stream-jsonrpc', '--output-format', 'stream-jsonrpc'],
      execPath: '/opt/factory/bin/droid',
    })
  })

  it('builds pinned stream-jsonrpc exec options for resumed sessions', () => {
    expect(
      buildDroidSdkProcessTransportOptions({
        cwd: '/tmp/workspace',
        droidPath: 'droid',
        homeDirectory: '/Users/tester',
        processEnv: {
          PATH: '/usr/bin:/bin',
        },
        shellPath: '/bin/fish',
        sessionId: 'session-123',
      }),
    ).toEqual({
      cwd: '/tmp/workspace',
      env: {
        PATH: [
          '/usr/bin',
          '/bin',
          '/opt/homebrew/bin',
          '/opt/homebrew/sbin',
          '/usr/local/bin',
          '/usr/local/sbin',
          '/Users/tester/Library/pnpm',
          '/Users/tester/.local/bin',
          '/Users/tester/.local/share/pnpm',
        ].join(':'),
      },
      execArgs: [
        'exec',
        '--input-format',
        'stream-jsonrpc',
        '--output-format',
        'stream-jsonrpc',
        '--session-id',
        'session-123',
      ],
      execPath: 'droid',
    })
  })

  it('merges the login-shell PATH so fnm and pnpm shims are available to droid exec', () => {
    const spawnSyncFn = vi.fn(() => ({
      status: 0,
      stdout:
        'noise before __OXOX_SHELL_ENV_START__PATH=/Users/tester/.local/state/fnm_multishells/2495_1775840110637/bin:/opt/homebrew/bin:/usr/bin:/bin\0KUBECONFIG=/Users/tester/.kube/config\0__OXOX_SHELL_ENV_END__ noise after',
      stderr: '',
    }))

    expect(
      buildDroidSdkProcessTransportOptions({
        cwd: '/tmp/workspace',
        droidPath: '/opt/factory/bin/droid',
        homeDirectory: '/Users/tester',
        processEnv: {
          PATH: '/Users/tester/.factory/bin:/usr/bin:/bin:/usr/sbin:/sbin',
          FOO: 'bar',
        },
        sessionId: null,
        shellPath: '/bin/zsh',
        spawnSyncFn,
      }),
    ).toEqual({
      cwd: '/tmp/workspace',
      env: {
        FOO: 'bar',
        KUBECONFIG: '/Users/tester/.kube/config',
        PATH: [
          '/Users/tester/.factory/bin',
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin',
          '/Users/tester/.local/state/fnm_multishells/2495_1775840110637/bin',
          '/opt/homebrew/bin',
          '/opt/homebrew/sbin',
          '/usr/local/bin',
          '/usr/local/sbin',
          '/Users/tester/Library/pnpm',
          '/Users/tester/.local/bin',
          '/Users/tester/.local/share/pnpm',
        ].join(':'),
      },
      execArgs: ['exec', '--input-format', 'stream-jsonrpc', '--output-format', 'stream-jsonrpc'],
      execPath: '/opt/factory/bin/droid',
    })

    expect(spawnSyncFn).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-lic', `printf '__OXOX_SHELL_ENV_START__'; env -0; printf '__OXOX_SHELL_ENV_END__'`],
      expect.objectContaining({
        env: {
          PATH: '/Users/tester/.factory/bin:/usr/bin:/bin:/usr/sbin:/sbin',
          FOO: 'bar',
        },
        timeout: 5_000,
      }),
    )
  })
})

describe('createDroidSdkSessionFactory', () => {
  it('creates transport and client only through the dedicated SDK seam', () => {
    const processTransportCalls: unknown[] = []
    const droidClientCalls: unknown[] = []

    class FakeProcessTransport {}
    class FakeDroidClient {}
    class ProcessTransport extends FakeProcessTransport {
      constructor(options?: unknown) {
        super()
        processTransportCalls.push(options)
      }
    }
    class DroidClient extends FakeDroidClient {
      constructor(options: unknown) {
        super()
        droidClientCalls.push(options)
      }
    }

    const factory = createDroidSdkSessionFactory({
      DroidClient,
      ProcessTransport,
    })

    const createdTransport = factory.createTransport({
      cwd: '/tmp/workspace',
      droidPath: '/opt/factory/bin/droid',
      homeDirectory: '/Users/tester',
      processEnv: {
        PATH: '/usr/bin:/bin',
      },
      shellPath: '/bin/fish',
      sessionId: 'session-123',
    })
    const createdClient = factory.createClient(createdTransport)

    expect(processTransportCalls).toEqual([
      {
        cwd: '/tmp/workspace',
        env: {
          PATH: [
            '/usr/bin',
            '/bin',
            '/opt/homebrew/bin',
            '/opt/homebrew/sbin',
            '/usr/local/bin',
            '/usr/local/sbin',
            '/Users/tester/Library/pnpm',
            '/Users/tester/.local/bin',
            '/Users/tester/.local/share/pnpm',
          ].join(':'),
        },
        execArgs: [
          'exec',
          '--input-format',
          'stream-jsonrpc',
          '--output-format',
          'stream-jsonrpc',
          '--session-id',
          'session-123',
        ],
        execPath: '/opt/factory/bin/droid',
      },
    ])
    expect(droidClientCalls).toEqual([
      {
        transport: createdTransport,
      },
    ])
    expect(createdTransport).toBeInstanceOf(FakeProcessTransport)
    expect(createdClient).toBeInstanceOf(FakeDroidClient)
  })
})
