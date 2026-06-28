import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { AppPreferences, AppPreferencesUpdate } from '../../shared/ipc/contracts'

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  isOxoxIntegrationEnabled: false,
}

export interface AppPreferencesStore {
  getPreferences: () => AppPreferences
  updatePreferences: (update: AppPreferencesUpdate) => Promise<AppPreferences>
}

export interface CreateAppPreferencesStoreOptions {
  userDataPath: string
  preferencesPath?: string
}

export function createAppPreferencesStore({
  userDataPath,
  preferencesPath = join(userDataPath, 'app-preferences.json'),
}: CreateAppPreferencesStoreOptions): AppPreferencesStore {
  let snapshot = readPreferences(preferencesPath)

  return {
    getPreferences: () => snapshot,
    updatePreferences: async (update) => {
      snapshot = normalizePreferences({ ...snapshot, ...update })
      await mkdir(userDataPath, { recursive: true })
      const tempPath = `${preferencesPath}.tmp`
      writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`)
      renameSync(tempPath, preferencesPath)
      return snapshot
    },
  }
}

function readPreferences(preferencesPath: string): AppPreferences {
  if (!existsSync(preferencesPath)) {
    return DEFAULT_APP_PREFERENCES
  }

  try {
    return normalizePreferences(JSON.parse(readFileSync(preferencesPath, 'utf8')))
  } catch {
    return DEFAULT_APP_PREFERENCES
  }
}

function normalizePreferences(value: unknown): AppPreferences {
  if (!isRecord(value)) {
    return DEFAULT_APP_PREFERENCES
  }

  return {
    isOxoxIntegrationEnabled: value.isOxoxIntegrationEnabled === true,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
