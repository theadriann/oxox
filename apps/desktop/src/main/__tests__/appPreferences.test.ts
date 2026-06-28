import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createAppPreferencesStore, DEFAULT_APP_PREFERENCES } from '../app/appPreferences'

describe('app preferences', () => {
  it('defaults OXOX integration off', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'oxox-preferences-'))
    const store = createAppPreferencesStore({ userDataPath })

    expect(store.getPreferences()).toEqual(DEFAULT_APP_PREFERENCES)
  })

  it('persists the OXOX integration preference', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'oxox-preferences-'))
    const store = createAppPreferencesStore({ userDataPath })

    await expect(store.updatePreferences({ isOxoxIntegrationEnabled: true })).resolves.toEqual({
      isOxoxIntegrationEnabled: true,
    })
    expect(JSON.parse(await readFile(join(userDataPath, 'app-preferences.json'), 'utf8'))).toEqual({
      isOxoxIntegrationEnabled: true,
    })
    expect(createAppPreferencesStore({ userDataPath }).getPreferences()).toEqual({
      isOxoxIntegrationEnabled: true,
    })
  })
})
