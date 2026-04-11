import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import type { DroidCliStatus } from '../../../shared/ipc/contracts'

const DROID_BINARY_NAME = 'droid'

export interface ResolveDroidCliStatusOptions {
  homeDirectory?: string
  pathEnvironment?: string
  knownLocations?: string[]
}

function getDefaultKnownLocations(homeDirectory: string): string[] {
  return [
    join(homeDirectory, '.local/bin', DROID_BINARY_NAME),
    '/opt/homebrew/bin/droid',
    '/usr/local/bin/droid',
  ]
}

function collectCandidates({
  homeDirectory,
  pathEnvironment,
  knownLocations,
}: Required<ResolveDroidCliStatusOptions>): string[] {
  const candidates = new Set<string>([
    ...knownLocations,
    ...getDefaultKnownLocations(homeDirectory),
    ...pathEnvironment
      .split(delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => join(entry, DROID_BINARY_NAME)),
  ])

  return [...candidates]
}

function readVersion(binaryPath: string): { version: string | null; error: string | null } {
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
  })

  if (result.error) {
    return {
      version: null,
      error: result.error.message,
    }
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (result.status !== 0) {
    return {
      version: null,
      error: output ?? `Version check failed with exit code ${result.status ?? 'unknown'}`,
    }
  }

  return {
    version: output ?? null,
    error: output ? null : 'Droid CLI did not return a version string.',
  }
}

export function resolveDroidCliStatus(options: ResolveDroidCliStatusOptions = {}): DroidCliStatus {
  const homeDirectory = options.homeDirectory ?? homedir()
  const pathEnvironment = options.pathEnvironment ?? process.env.PATH ?? ''
  const knownLocations = options.knownLocations ?? []
  const searchedLocations = collectCandidates({
    homeDirectory,
    pathEnvironment,
    knownLocations,
  })

  let lastError: string | null = null

  for (const candidate of searchedLocations) {
    if (!existsSync(candidate)) {
      continue
    }

    const versionInfo = readVersion(candidate)

    if (versionInfo.version) {
      return {
        available: true,
        path: candidate,
        version: versionInfo.version,
        searchedLocations,
        error: null,
      }
    }

    lastError = versionInfo.error
  }

  return {
    available: false,
    path: null,
    version: null,
    searchedLocations,
    error: lastError ?? 'Droid CLI not found on PATH.',
  }
}
