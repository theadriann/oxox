export type DroidSdkSettingsParityStatus =
  | 'supported-now'
  | 'product-relevant-missing'
  | 'internal-only'
  | 'blocked-by-sdk-public-schema'

export type DroidSdkSettingsParitySupport =
  | 'supported'
  | 'missing'
  | 'not-applicable'
  | 'blocked'
  | 'internal'

export interface DroidSdkSettingsParityEntry {
  field: string
  sdk: {
    init: boolean
    update: boolean
    defaults: boolean
    persisted: boolean
  }
  oxox: {
    init: DroidSdkSettingsParitySupport
    update: DroidSdkSettingsParitySupport
    defaults: DroidSdkSettingsParitySupport
    ui: DroidSdkSettingsParitySupport
    tests: DroidSdkSettingsParitySupport
  }
  status: DroidSdkSettingsParityStatus
  notes: string
}

export const DROID_SDK_SETTINGS_PARITY_IGNORED_FIELDS = [
  'availableModels',
  'cwd',
  'machineId',
  'management',
  'maxAutonomyLevel',
  'mcpOAuthCallbackUri',
  'resolutionChain',
  'sessionId',
  'specSavePresets',
  'workspaceId',
] as const

const baseSdk = {
  init: false,
  update: false,
  defaults: false,
  persisted: false,
} as const

const allMissing = {
  init: 'missing',
  update: 'missing',
  defaults: 'missing',
  ui: 'missing',
  tests: 'missing',
} satisfies DroidSdkSettingsParityEntry['oxox']

const notApplicable = {
  init: 'not-applicable',
  update: 'not-applicable',
  defaults: 'not-applicable',
  ui: 'not-applicable',
  tests: 'not-applicable',
} satisfies DroidSdkSettingsParityEntry['oxox']

function matrixEntry(
  entry: Omit<DroidSdkSettingsParityEntry, 'notes'> & { notes?: string },
): DroidSdkSettingsParityEntry {
  return {
    ...entry,
    notes: entry.notes ?? '',
  }
}

export const DROID_SDK_SETTINGS_PARITY_MATRIX = [
  matrixEntry({
    field: 'modelId',
    sdk: { init: true, update: true, defaults: true, persisted: true },
    oxox: {
      init: 'supported',
      update: 'supported',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes:
      'New-session model selection now flows through create/init; runtime update and defaults already exist.',
  }),
  matrixEntry({
    field: 'reasoningEffort',
    sdk: { init: true, update: true, defaults: true, persisted: true },
    oxox: {
      init: 'supported',
      update: 'supported',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes:
      'Reasoning effort is exposed in composer settings and threaded through init/update/defaults.',
  }),
  matrixEntry({
    field: 'interactionMode',
    sdk: { init: true, update: true, defaults: true, persisted: true },
    oxox: {
      init: 'supported',
      update: 'supported',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes:
      'Interaction mode is exposed in composer settings and threaded through init/update/defaults.',
  }),
  matrixEntry({
    field: 'autonomyLevel',
    sdk: { init: true, update: true, defaults: true, persisted: true },
    oxox: {
      init: 'supported',
      update: 'supported',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes: 'Create/init, daemon-backed defaults, and UI are supported.',
  }),
  matrixEntry({
    field: 'autonomyMode',
    sdk: { init: true, update: true, defaults: true, persisted: true },
    oxox: {
      init: 'supported',
      update: 'supported',
      defaults: 'supported',
      ui: 'not-applicable',
      tests: 'supported',
    },
    status: 'internal-only',
    notes: 'Deprecated SDK field retained only for compatibility with existing settings/events.',
  }),
  matrixEntry({
    field: 'specModeModelId',
    sdk: { init: true, update: true, defaults: true, persisted: true },
    oxox: {
      init: 'supported',
      update: 'supported',
      defaults: 'supported',
      ui: 'missing',
      tests: 'supported',
    },
    status: 'product-relevant-missing',
    notes:
      'Typed contracts support it, but new-session/settings UI does not expose a spec model control.',
  }),
  matrixEntry({
    field: 'specModeReasoningEffort',
    sdk: { init: true, update: true, defaults: true, persisted: true },
    oxox: {
      init: 'supported',
      update: 'supported',
      defaults: 'supported',
      ui: 'missing',
      tests: 'supported',
    },
    status: 'product-relevant-missing',
    notes:
      'Typed contracts support it, but new-session/settings UI does not expose a spec reasoning control.',
  }),
  matrixEntry({
    field: 'enabledToolIds',
    sdk: { init: true, update: true, defaults: false, persisted: true },
    oxox: {
      init: 'supported',
      update: 'supported',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes: 'Tool override settings are supported through runtime catalog/default settings paths.',
  }),
  matrixEntry({
    field: 'disabledToolIds',
    sdk: { init: true, update: true, defaults: false, persisted: true },
    oxox: {
      init: 'supported',
      update: 'supported',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes: 'Tool override settings are supported through runtime catalog/default settings paths.',
  }),
  matrixEntry({
    field: 'mcpServers',
    sdk: { init: true, update: false, defaults: false, persisted: false },
    oxox: {
      ...allMissing,
      ui: 'supported',
      tests: 'supported',
    },
    status: 'internal-only',
    notes:
      'OXOX manages MCP servers through dedicated session actions instead of create/init settings.',
  }),
  matrixEntry({
    field: 'sessionSource',
    sdk: { ...baseSdk, init: true },
    oxox: {
      init: 'supported',
      update: 'not-applicable',
      defaults: 'not-applicable',
      ui: 'not-applicable',
      tests: 'missing',
    },
    status: 'internal-only',
    notes: 'Session source is system-managed metadata, not a user setting.',
  }),
  matrixEntry({
    field: 'sessionLocation',
    sdk: { ...baseSdk, init: true },
    oxox: {
      ...notApplicable,
      init: 'missing',
    },
    status: 'internal-only',
    notes: 'Delegation/location metadata is not part of OXOX desktop session creation UI.',
  }),
  matrixEntry({
    field: 'sessionOriginHint',
    sdk: { ...baseSdk, init: true },
    oxox: {
      ...notApplicable,
      init: 'blocked',
    },
    status: 'blocked-by-sdk-public-schema',
    notes:
      'Present in protocol initialize schema but absent from the public SDK client schema currently used by OXOX.',
  }),
  matrixEntry({
    field: 'tags',
    sdk: { init: true, update: true, defaults: false, persisted: true },
    oxox: {
      init: 'supported',
      update: 'blocked',
      defaults: 'not-applicable',
      ui: 'not-applicable',
      tests: 'supported',
    },
    status: 'internal-only',
    notes:
      'Session tags can flow through init; update remains blocked by the public SDK client schema.',
  }),
  matrixEntry({
    field: 'decompSessionType',
    sdk: { ...baseSdk, init: true },
    oxox: {
      ...notApplicable,
      init: 'internal',
    },
    status: 'internal-only',
    notes: 'Deprecated mission decomposition field; tags should be preferred.',
  }),
  matrixEntry({
    field: 'decompMissionId',
    sdk: { ...baseSdk, init: true },
    oxox: {
      ...notApplicable,
      init: 'internal',
    },
    status: 'internal-only',
    notes: 'Deprecated mission decomposition field; tags should be preferred.',
  }),
  matrixEntry({
    field: 'skipPermissionsUnsafe',
    sdk: { ...baseSdk, init: true },
    oxox: {
      ...notApplicable,
      init: 'internal',
    },
    status: 'internal-only',
    notes:
      'Worker/autonomous-session safety control; not suitable for user-facing desktop settings.',
  }),
  matrixEntry({
    field: 'missionSettings',
    sdk: { init: true, update: true, defaults: true, persisted: false },
    oxox: {
      init: 'blocked',
      update: 'blocked',
      defaults: 'supported',
      ui: 'missing',
      tests: 'supported',
    },
    status: 'blocked-by-sdk-public-schema',
    notes:
      'Daemon defaults now feed OXOX bootstrap; init/update remain absent from the public SDK client schemas currently used by OXOX.',
  }),
  matrixEntry({
    field: 'worktree',
    sdk: { ...baseSdk, init: true },
    oxox: {
      init: 'blocked',
      update: 'not-applicable',
      defaults: 'missing',
      ui: 'missing',
      tests: 'missing',
    },
    status: 'blocked-by-sdk-public-schema',
    notes:
      'Present in the protocol initialize surface, but absent from the public SDK client schema currently used by OXOX.',
  }),
  matrixEntry({
    field: 'worktreeDir',
    sdk: { ...baseSdk, init: true },
    oxox: {
      init: 'blocked',
      update: 'not-applicable',
      defaults: 'missing',
      ui: 'missing',
      tests: 'missing',
    },
    status: 'blocked-by-sdk-public-schema',
    notes:
      'Present in the protocol initialize surface, but absent from the public SDK client schema currently used by OXOX.',
  }),
  matrixEntry({
    field: 'compactionTokenLimit',
    sdk: { init: false, update: true, defaults: true, persisted: false },
    oxox: {
      init: 'not-applicable',
      update: 'blocked',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'blocked-by-sdk-public-schema',
    notes:
      'Defaults and read-only UI are supported; update is blocked by the public SDK client schema.',
  }),
  matrixEntry({
    field: 'compactionThresholdCheckEnabled',
    sdk: { init: true, update: true, defaults: false, persisted: true },
    oxox: {
      init: 'blocked',
      update: 'blocked',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'blocked-by-sdk-public-schema',
    notes:
      'Default contract/UI can surface it if Droid reports it, but init/update remain absent from the public SDK client schemas currently used by OXOX.',
  }),
  matrixEntry({
    field: 'compactionModel',
    sdk: { init: false, update: false, defaults: true, persisted: true },
    oxox: {
      ...allMissing,
      init: 'not-applicable',
      update: 'not-applicable',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes: 'Daemon default settings feed OXOX bootstrap and the Settings UI surfaces them.',
  }),
  matrixEntry({
    field: 'compactionModelMode',
    sdk: { init: false, update: false, defaults: true, persisted: false },
    oxox: {
      ...allMissing,
      init: 'not-applicable',
      update: 'not-applicable',
    },
    status: 'internal-only',
    notes:
      'Deprecated daemon default-settings wire alias retained by Droid; OXOX uses compactionModel instead.',
  }),
  matrixEntry({
    field: 'compactionTokenLimitPerModel',
    sdk: { init: false, update: false, defaults: true, persisted: false },
    oxox: {
      ...allMissing,
      init: 'not-applicable',
      update: 'not-applicable',
      defaults: 'supported',
      ui: 'missing',
      tests: 'supported',
    },
    status: 'product-relevant-missing',
    notes: 'Daemon default settings feed OXOX bootstrap; product UI controls are deferred.',
  }),
  matrixEntry({
    field: 'runInWorktree',
    sdk: { init: false, update: false, defaults: true, persisted: true },
    oxox: {
      init: 'not-applicable',
      update: 'not-applicable',
      defaults: 'supported',
      ui: 'missing',
      tests: 'supported',
    },
    status: 'product-relevant-missing',
    notes: 'Daemon default settings feed OXOX bootstrap; worktree UI is deferred.',
  }),
  matrixEntry({
    field: 'worktreeDirectory',
    sdk: { init: false, update: false, defaults: true, persisted: false },
    oxox: {
      init: 'not-applicable',
      update: 'not-applicable',
      defaults: 'supported',
      ui: 'missing',
      tests: 'supported',
    },
    status: 'product-relevant-missing',
    notes: 'Daemon default settings feed OXOX bootstrap; worktree UI is deferred.',
  }),
  matrixEntry({
    field: 'specSaveDir',
    sdk: { init: false, update: false, defaults: true, persisted: false },
    oxox: {
      ...allMissing,
      init: 'not-applicable',
      update: 'not-applicable',
    },
    status: 'product-relevant-missing',
    notes:
      'Droid exposes this through daemon default settings, but OXOX does not yet parse or surface spec save directory preferences.',
  }),
  matrixEntry({
    field: 'subagentModelSettings',
    sdk: { init: false, update: false, defaults: true, persisted: false },
    oxox: {
      ...allMissing,
      init: 'not-applicable',
      update: 'not-applicable',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes: 'Daemon default settings feed OXOX bootstrap and the Settings UI summarizes them.',
  }),
  matrixEntry({
    field: 'missionModelSettings',
    sdk: { init: false, update: false, defaults: true, persisted: false },
    oxox: {
      ...allMissing,
      init: 'not-applicable',
      update: 'not-applicable',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes:
      'Daemon mission settings feed OXOX bootstrap using the daemon default-settings shape and the Settings UI summarizes them.',
  }),
  matrixEntry({
    field: 'missionOrchestratorModel',
    sdk: { init: false, update: false, defaults: true, persisted: false },
    oxox: {
      ...allMissing,
      init: 'not-applicable',
      update: 'not-applicable',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes: 'Daemon default settings feed OXOX bootstrap and the Settings UI surfaces them.',
  }),
  matrixEntry({
    field: 'missionOrchestratorReasoningEffort',
    sdk: { init: false, update: false, defaults: true, persisted: false },
    oxox: {
      ...allMissing,
      init: 'not-applicable',
      update: 'not-applicable',
      defaults: 'supported',
      ui: 'supported',
      tests: 'supported',
    },
    status: 'supported-now',
    notes: 'Daemon default settings feed OXOX bootstrap and the Settings UI surfaces them.',
  }),
  matrixEntry({
    field: 'providerLock',
    sdk: { ...baseSdk, persisted: true },
    oxox: notApplicable,
    status: 'internal-only',
    notes: 'Persisted session routing metadata, not a product setting.',
  }),
  matrixEntry({
    field: 'providerLockTimestamp',
    sdk: { ...baseSdk, persisted: true },
    oxox: notApplicable,
    status: 'internal-only',
    notes: 'Persisted session routing metadata, not a product setting.',
  }),
  matrixEntry({
    field: 'apiProviderLock',
    sdk: { ...baseSdk, persisted: true },
    oxox: notApplicable,
    status: 'internal-only',
    notes: 'Persisted provider metadata, not a product setting.',
  }),
  matrixEntry({
    field: 'assistantActiveTimeMs',
    sdk: { ...baseSdk, persisted: true },
    oxox: notApplicable,
    status: 'internal-only',
    notes: 'Persisted usage telemetry, not a product setting.',
  }),
  matrixEntry({
    field: 'tokenUsage',
    sdk: { ...baseSdk, persisted: true },
    oxox: {
      ...notApplicable,
      tests: 'supported',
    },
    status: 'internal-only',
    notes: 'Usage state is shown through token usage events/snapshots, not editable settings.',
  }),
  matrixEntry({
    field: 'inclusiveTokenUsage',
    sdk: { ...baseSdk, persisted: true },
    oxox: notApplicable,
    status: 'internal-only',
    notes: 'Persisted usage telemetry, not an editable setting.',
  }),
  matrixEntry({
    field: 'childInclusiveTokenUsageBySessionId',
    sdk: { ...baseSdk, persisted: true },
    oxox: notApplicable,
    status: 'internal-only',
    notes: 'Persisted usage telemetry, not an editable setting.',
  }),
  matrixEntry({
    field: 'archivedAt',
    sdk: { ...baseSdk, persisted: true },
    oxox: notApplicable,
    status: 'internal-only',
    notes: 'Archive state belongs to session catalog lifecycle, not settings UI.',
  }),
  matrixEntry({
    field: 'effectiveFactoryRouterModel',
    sdk: { ...baseSdk, persisted: true },
    oxox: notApplicable,
    status: 'internal-only',
    notes: 'Effective routing metadata, not user-configurable settings.',
  }),
] as const satisfies readonly DroidSdkSettingsParityEntry[]
