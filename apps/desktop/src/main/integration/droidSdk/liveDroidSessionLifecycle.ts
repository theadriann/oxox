import type { InitializeSessionRequestParams, LoadSessionRequestParams } from '@factory/droid-sdk'

import type { InitializeSessionRequest } from '../sessions/types'

export interface OxoxLiveDroidSessionLifecycleContext {
  getSessionId: () => string | null
}

export interface OxoxLiveDroidSessionInitializeContext
  extends OxoxLiveDroidSessionLifecycleContext {
  request: InitializeSessionRequest
}

export interface OxoxLiveDroidSessionLoadContext extends OxoxLiveDroidSessionLifecycleContext {
  sessionId: string
}

export interface OxoxLiveDroidSessionInitializeExtension {
  cleanup?: () => Promise<void>
  params?: Partial<InitializeSessionRequestParams>
}

export interface OxoxLiveDroidSessionLoadExtension {
  cleanup?: () => Promise<void>
  params?: Partial<Omit<LoadSessionRequestParams, 'sessionId'>>
}

export interface OxoxLiveDroidSessionLifecycleHook {
  prepareInitialize?: (
    context: OxoxLiveDroidSessionInitializeContext,
  ) => Promise<OxoxLiveDroidSessionInitializeExtension | undefined>
  prepareLoad?: (
    context: OxoxLiveDroidSessionLoadContext,
  ) => Promise<OxoxLiveDroidSessionLoadExtension | undefined>
}

export interface PreparedOxoxLiveDroidSessionLifecycle<TExtension> {
  cleanups: Array<() => Promise<void>>
  extensions: TExtension[]
}

export async function prepareOxoxLiveDroidSessionInitializeLifecycle(
  hooks: readonly OxoxLiveDroidSessionLifecycleHook[],
  context: OxoxLiveDroidSessionInitializeContext,
): Promise<PreparedOxoxLiveDroidSessionLifecycle<OxoxLiveDroidSessionInitializeExtension>> {
  const prepared: PreparedOxoxLiveDroidSessionLifecycle<OxoxLiveDroidSessionInitializeExtension> = {
    cleanups: [],
    extensions: [],
  }

  try {
    for (const hook of hooks) {
      const extension = await hook.prepareInitialize?.(context)
      if (!extension) {
        continue
      }
      prepared.extensions.push(extension)
      if (extension.cleanup) {
        prepared.cleanups.push(extension.cleanup)
      }
    }
  } catch (error) {
    await runOxoxLiveDroidSessionCleanups(prepared.cleanups)
    throw error
  }

  return prepared
}

export async function prepareOxoxLiveDroidSessionLoadLifecycle(
  hooks: readonly OxoxLiveDroidSessionLifecycleHook[],
  context: OxoxLiveDroidSessionLoadContext,
): Promise<PreparedOxoxLiveDroidSessionLifecycle<OxoxLiveDroidSessionLoadExtension>> {
  const prepared: PreparedOxoxLiveDroidSessionLifecycle<OxoxLiveDroidSessionLoadExtension> = {
    cleanups: [],
    extensions: [],
  }

  try {
    for (const hook of hooks) {
      const extension = await hook.prepareLoad?.(context)
      if (!extension) {
        continue
      }
      prepared.extensions.push(extension)
      if (extension.cleanup) {
        prepared.cleanups.push(extension.cleanup)
      }
    }
  } catch (error) {
    await runOxoxLiveDroidSessionCleanups(prepared.cleanups)
    throw error
  }

  return prepared
}

export async function runOxoxLiveDroidSessionCleanups(
  cleanups: ReadonlyArray<() => Promise<void>>,
): Promise<void> {
  await Promise.all(cleanups.map((cleanup) => cleanup()))
}
