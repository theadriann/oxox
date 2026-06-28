import {
  InitializeSessionRequestParamsSchema,
  protocol,
  SessionSettingsFileSchema,
  SessionSettingsSchema,
  UpdateSessionSettingsRequestParamsSchema,
} from '@factory/droid-sdk'
import { describe, expect, it } from 'vitest'

import {
  DROID_SDK_SETTINGS_PARITY_IGNORED_FIELDS,
  DROID_SDK_SETTINGS_PARITY_MATRIX,
} from '../droidSdk/settingsParity'

describe('Droid SDK settings parity matrix', () => {
  it('covers every live SDK session init, update, default, and persisted settings field', () => {
    const fields = new Set(DROID_SDK_SETTINGS_PARITY_MATRIX.map((entry) => entry.field))
    const requiredFields = collectRequiredSdkSettingsParityFields()

    expect([...fields].sort()).toEqual([...requiredFields].sort())
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

  it('keeps SDK surface flags in sync with the live SDK schemas', () => {
    const sdkInitFields = collectAliasedSchemaFields(protocol.InitializeSessionRequestParamsSchema)
    const sdkUpdateFields = collectAliasedSchemaFields(
      protocol.UpdateSessionSettingsRequestParamsSchema,
    )
    const sdkDefaultFields = new Set([
      ...collectAliasedSchemaFields(protocol.daemon.DaemonGetDefaultSettingsResultSchema),
      ...collectAliasedSchemaFields(protocol.daemon.DaemonUpdateSessionDefaultsRequestParamsSchema),
    ])
    const sdkPersistedFields = new Set([
      ...collectAliasedSchemaFields(protocol.SessionSettingsSchema),
      ...collectAliasedSchemaFields(SessionSettingsFileSchema),
    ])

    for (const entry of DROID_SDK_SETTINGS_PARITY_MATRIX) {
      expect(entry.sdk.init, `${entry.field} init SDK flag`).toBe(sdkInitFields.has(entry.field))
      expect(entry.sdk.update, `${entry.field} update SDK flag`).toBe(
        sdkUpdateFields.has(entry.field),
      )
      expect(entry.sdk.defaults, `${entry.field} defaults SDK flag`).toBe(
        sdkDefaultFields.has(entry.field),
      )
      expect(entry.sdk.persisted, `${entry.field} persisted SDK flag`).toBe(
        sdkPersistedFields.has(entry.field),
      )
    }
  })
})

const SDK_SETTINGS_FIELD_ALIASES = new Map([
  ['model', 'modelId'],
  ['specModeModel', 'specModeModelId'],
])

interface ShapeBackedSchema {
  shape: Record<string, unknown>
}

function collectRequiredSdkSettingsParityFields(): Set<string> {
  const ignoredFields = new Set(DROID_SDK_SETTINGS_PARITY_IGNORED_FIELDS)
  const fields = new Set<string>()

  for (const schema of [
    InitializeSessionRequestParamsSchema,
    UpdateSessionSettingsRequestParamsSchema,
    SessionSettingsSchema,
    protocol.InitializeSessionRequestParamsSchema,
    protocol.UpdateSessionSettingsRequestParamsSchema,
    protocol.SessionSettingsSchema,
    protocol.daemon.DaemonGetDefaultSettingsResultSchema,
    protocol.daemon.DaemonUpdateSessionDefaultsRequestParamsSchema,
    SessionSettingsFileSchema,
  ]) {
    for (const field of collectAliasedSchemaFields(schema)) {
      if (!ignoredFields.has(field)) {
        fields.add(field)
      }
    }
  }

  return fields
}

function collectAliasedSchemaFields(schema: ShapeBackedSchema): Set<string> {
  return new Set(
    Object.keys(schema.shape).map((field) => SDK_SETTINGS_FIELD_ALIASES.get(field) ?? field),
  )
}
