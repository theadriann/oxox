import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import {
  DroidClient,
  type DroidClientTransport,
  ProcessTransport,
  type ProcessTransportOptions,
} from '@factory/droid-sdk'

export interface DroidSdkProcessTransportConfig {
  cwd?: string
  droidPath?: string
  homeDirectory?: string
  processEnv?: NodeJS.ProcessEnv
  sessionId?: string | null
  shellPath?: string
  spawnSyncFn?: typeof spawnSync
}

export interface DroidSdkSessionFactory {
  createTransport: (config: DroidSdkProcessTransportConfig) => DroidClientTransport
  createClient: (transport: DroidClientTransport) => DroidClient
}

export interface DroidSdkConstructors {
  DroidClient: new (options: { transport: DroidClientTransport }) => DroidClient
  ProcessTransport: new (options?: ProcessTransportOptions) => DroidClientTransport
}

const DEFAULT_DROID_PATH = 'droid'
const DEFAULT_STREAM_JSONRPC_ARGS = [
  'exec',
  '--input-format',
  'stream-jsonrpc',
  '--output-format',
  'stream-jsonrpc',
] as const
const PATH_MARKER_START = '__OXOX_PATH_START__'
const PATH_MARKER_END = '__OXOX_PATH_END__'

export function buildDroidSdkProcessTransportOptions({
  cwd,
  droidPath = DEFAULT_DROID_PATH,
  homeDirectory = homedir(),
  processEnv = process.env,
  sessionId,
  shellPath = processEnv.SHELL ?? '/bin/zsh',
  spawnSyncFn = spawnSync,
}: DroidSdkProcessTransportConfig): ProcessTransportOptions {
  return {
    cwd,
    env: buildDroidExecEnv({
      processEnv,
      homeDirectory,
      shellPath,
      spawnSyncFn,
    }),
    execArgs: sessionId
      ? [...DEFAULT_STREAM_JSONRPC_ARGS, '--session-id', sessionId]
      : [...DEFAULT_STREAM_JSONRPC_ARGS],
    execPath: droidPath,
  }
}

export function buildDroidExecEnv({
  processEnv,
  homeDirectory,
  shellPath,
  spawnSyncFn,
}: {
  processEnv: NodeJS.ProcessEnv
  homeDirectory: string
  shellPath: string
  spawnSyncFn: typeof spawnSync
}): NodeJS.ProcessEnv | undefined {
  const shellPathEnvironment = resolveShellPathEnvironment({
    processEnv,
    shellPath,
    spawnSyncFn,
  })

  return {
    ...processEnv,
    PATH: mergePathEntries(processEnv.PATH ?? '', shellPathEnvironment ?? '', [
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/local/sbin',
      join(homeDirectory, 'Library', 'pnpm'),
      join(homeDirectory, '.local', 'bin'),
      join(homeDirectory, '.local', 'share', 'pnpm'),
    ]),
  }
}

function resolveShellPathEnvironment({
  processEnv,
  shellPath,
  spawnSyncFn,
}: {
  processEnv: NodeJS.ProcessEnv
  shellPath: string
  spawnSyncFn: typeof spawnSync
}): string | null {
  const shellName = shellPath.split('/').at(-1) ?? ''

  if (shellName !== 'zsh' && shellName !== 'bash') {
    return null
  }

  const result = spawnSyncFn(
    shellPath,
    ['-lic', `printf '${PATH_MARKER_START}%s${PATH_MARKER_END}' "$PATH"`],
    {
      encoding: 'utf8',
      env: processEnv,
      timeout: 5_000,
    },
  )

  if (result.status !== 0) {
    return null
  }

  const output = `${result.stdout ?? ''}`
  const startIndex = output.indexOf(PATH_MARKER_START)
  const endIndex = output.indexOf(PATH_MARKER_END)

  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    return null
  }

  return output.slice(startIndex + PATH_MARKER_START.length, endIndex).trim() || null
}

function mergePathEntries(...sources: Array<string | readonly string[]>): string {
  const pathEntries = new Set<string>()

  for (const source of sources) {
    const entries = Array.isArray(source) ? source : source.split(delimiter)

    for (const entry of entries.map((value) => value.trim()).filter(Boolean)) {
      pathEntries.add(entry)
    }
  }

  return [...pathEntries].join(delimiter)
}

export function createDroidSdkSessionFactory({
  DroidClient: DroidClientConstructor = DroidClient,
  ProcessTransport: ProcessTransportConstructor = ProcessTransport,
}: Partial<DroidSdkConstructors> = {}): DroidSdkSessionFactory {
  return {
    createTransport: (config) =>
      new ProcessTransportConstructor(buildDroidSdkProcessTransportOptions(config)),
    createClient: (transport) =>
      new DroidClientConstructor({
        transport,
      }),
  }
}
