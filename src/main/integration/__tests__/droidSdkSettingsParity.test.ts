import {
  InitializeSessionRequestParamsSchema,
  UpdateSessionSettingsRequestParamsSchema,
} from '@factory/droid-sdk'
import { describe, expect, it } from 'vitest'

import {
  DROID_SDK_SETTINGS_PARITY_MATRIX,
  REQUIRED_DROID_SDK_SETTINGS_PARITY_FIELDS,
} from '../droidSdk/settingsParity'

describe('Droid SDK settings parity matrix', () => {
  it('covers every relevant SDK session init, update, default, and persisted settings field', () => {
    const fields = new Set(DROID_SDK_SETTINGS_PARITY_MATRIX.map((entry) => entry.field))

    expect([...fields].sort()).toEqual([...REQUIRED_DROID_SDK_SETTINGS_PARITY_FIELDS].sort())
  })

  it('classifies current OXOX support and known blockers explicitly', () => {
    expect(DROID_SDK_SETTINGS_PARITY_MATRIX).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'modelId',
          status: 'supported-now',
          oxox: expect.objectContaining({
            init: 'supported',
            update: 'supported',
            defaults: 'supported',
            ui: 'supported',
            tests: 'supported',
          }),
        }),
        expect.objectContaining({
          field: 'worktree',
          status: 'blocked-by-sdk-public-schema',
          oxox: expect.objectContaining({
            init: 'blocked',
            defaults: 'missing',
            ui: 'missing',
          }),
        }),
        expect.objectContaining({
          field: 'missionSettings',
          status: 'blocked-by-sdk-public-schema',
          oxox: expect.objectContaining({
            init: 'blocked',
            update: 'blocked',
            defaults: 'supported',
            ui: 'missing',
          }),
        }),
        expect.objectContaining({
          field: 'tags',
          status: 'internal-only',
          oxox: expect.objectContaining({
            init: 'supported',
            update: 'blocked',
          }),
        }),
        expect.objectContaining({
          field: 'compactionTokenLimit',
          status: 'blocked-by-sdk-public-schema',
          oxox: expect.objectContaining({
            update: 'blocked',
            defaults: 'supported',
            ui: 'supported',
          }),
        }),
        expect.objectContaining({
          field: 'runInWorktree',
          status: 'product-relevant-missing',
          oxox: expect.objectContaining({
            defaults: 'supported',
            ui: 'missing',
          }),
        }),
        expect.objectContaining({
          field: 'compactionModel',
          status: 'supported-now',
          oxox: expect.objectContaining({
            defaults: 'supported',
            ui: 'supported',
          }),
        }),
        expect.objectContaining({
          field: 'subagentModelSettings',
          status: 'supported-now',
          oxox: expect.objectContaining({
            defaults: 'supported',
            ui: 'supported',
          }),
        }),
        expect.objectContaining({
          field: 'providerLock',
          status: 'internal-only',
          oxox: expect.objectContaining({
            init: 'not-applicable',
            update: 'not-applicable',
            ui: 'not-applicable',
          }),
        }),
      ]),
    )
  })

  it('does not mark init/update settings supported unless the public SDK client schema exposes them', () => {
    const sdkInitFields = new Set(Object.keys(InitializeSessionRequestParamsSchema.shape))
    const sdkUpdateFields = new Set(Object.keys(UpdateSessionSettingsRequestParamsSchema.shape))

    for (const entry of DROID_SDK_SETTINGS_PARITY_MATRIX) {
      if (entry.oxox.init === 'supported') {
        expect(sdkInitFields, `${entry.field} is marked init-supported`).toContain(entry.field)
      }

      if (entry.oxox.update === 'supported') {
        expect(sdkUpdateFields, `${entry.field} is marked update-supported`).toContain(entry.field)
      }
    }
  })
})
