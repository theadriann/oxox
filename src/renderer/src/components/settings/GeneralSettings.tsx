import { useValue } from '@legendapp/state/react'
import type { FoundationBootstrap } from '../../../../shared/ipc/contracts'
import { useFoundationStore, useUIStore } from '../../state/root/store-provider'
import { Switch } from '../ui/switch'

export function GeneralSettings() {
  const uiStore = useUIStore()
  const foundationStore = useFoundationStore()
  const isSidebarHidden = useValue(uiStore.state$.isSidebarHidden)
  const isContextPanelHidden = useValue(uiStore.state$.isContextPanelHidden)
  const composerContextUsageDisplayMode = useValue(uiStore.state$.composerContextUsageDisplayMode)
  const childSessionVisibilityMode = useValue(uiStore.state$.childSessionVisibilityMode)
  const factoryDefaultSettings = useValue(foundationStore.state$.foundation.factoryDefaultSettings)
  const defaultRows = buildFactoryDefaultRows(factoryDefaultSettings)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-fd-primary">General</h2>
        <p className="mt-0.5 text-xs text-fd-tertiary">
          Application-wide preferences and behavior.
        </p>
      </div>

      <div className="flex flex-col divide-y divide-fd-border-subtle rounded-lg border border-fd-border-default bg-fd-surface">
        <SettingsRow label="Theme" description="Choose how the app looks.">
          <span className="rounded-md border border-fd-border-default bg-fd-panel px-3 py-1.5 text-xs text-fd-secondary">
            Dark
          </span>
        </SettingsRow>

        <SettingsRow
          label="Sidebar visible on launch"
          description="Show the session sidebar when the app starts."
        >
          <ToggleSwitch
            checked={!isSidebarHidden}
            onChange={() => uiStore.toggleSidebar()}
            label="Sidebar visible"
          />
        </SettingsRow>

        <SettingsRow
          label="Context panel visible on launch"
          description="Show the context panel when the app starts."
        >
          <ToggleSwitch
            checked={!isContextPanelHidden}
            onChange={() => uiStore.toggleContextPanel()}
            label="Context panel visible"
          />
        </SettingsRow>

        <SettingsRow
          label="Composer context usage"
          description="Choose how the inline context indicator next to Send is displayed."
        >
          <div className="flex items-center gap-1 rounded-md border border-fd-border-default bg-fd-panel p-1">
            {(['percentage', 'tokens'] as const).map((mode) => {
              const isActive = composerContextUsageDisplayMode === mode

              return (
                <button
                  key={mode}
                  type="button"
                  className={`rounded px-2 py-1 text-[11px] transition-colors ${
                    isActive
                      ? 'bg-fd-ember-400 text-white'
                      : 'text-fd-secondary hover:bg-fd-border-subtle'
                  }`}
                  onClick={() => uiStore.setComposerContextUsageDisplayMode(mode)}
                >
                  {mode === 'percentage' ? 'Percent' : 'Flat'}
                </button>
              )
            })}
          </div>
        </SettingsRow>

        <SettingsRow
          label="Sub-sessions in sidebar"
          description="Control when child sessions created by subagents appear under their parent."
        >
          <SegmentedControl
            value={childSessionVisibilityMode}
            options={[
              { value: 'always', label: 'Always' },
              { value: 'selected-parent', label: 'Related' },
              { value: 'never', label: 'Never' },
            ]}
            onChange={uiStore.setChildSessionVisibilityMode}
          />
        </SettingsRow>
      </div>

      {defaultRows.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fd-tertiary">
              Droid defaults
            </h3>
            <p className="mt-0.5 text-[11px] text-fd-tertiary">
              Canonical defaults reported by Droid. Composer choices remain per-session preferences.
            </p>
          </div>
          <div className="flex flex-col divide-y divide-fd-border-subtle rounded-lg border border-fd-border-default bg-fd-surface">
            {defaultRows.map((row) => (
              <SettingsRow key={row.label} label={row.label} description={row.description}>
                <SettingsValue>{row.value}</SettingsValue>
              </SettingsRow>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fd-tertiary">
          Keyboard shortcuts
        </h3>
        <div className="flex flex-col divide-y divide-fd-border-subtle rounded-lg border border-fd-border-default bg-fd-surface">
          <ShortcutRow label="Command palette" keys={['⌘', 'K']} />
          <ShortcutRow label="Toggle sidebar" keys={['⌘', 'B']} />
          <ShortcutRow label="Toggle context panel" keys={['⌘', '⌥', 'P']} />
          <ShortcutRow label="Open settings" keys={['⌘', ',']} />
          <ShortcutRow label="Attach / detach session" keys={['⌘', '⇧', 'A']} />
        </div>
      </div>
    </div>
  )
}

interface FactoryDefaultRow {
  label: string
  description: string
  value: string
}

function buildFactoryDefaultRows(
  defaults: FoundationBootstrap['factoryDefaultSettings'],
): FactoryDefaultRow[] {
  return [
    stringDefaultRow('Model', 'Default model for newly created sessions.', defaults.model),
    stringDefaultRow(
      'Interaction mode',
      'Default Droid interaction mode.',
      formatTitleValue(defaults.interactionMode),
    ),
    stringDefaultRow(
      'Reasoning effort',
      'Default reasoning effort when the selected model supports it.',
      formatTitleValue(defaults.reasoningEffort),
    ),
    stringDefaultRow(
      'Autonomy level',
      'Default autonomy level for session work.',
      formatTitleValue(defaults.autonomyLevel),
    ),
    numberDefaultRow(
      'Compaction token limit',
      'Token budget used by the context usage indicator.',
      defaults.compactionTokenLimit,
    ),
    stringDefaultRow(
      'Compaction model',
      'Model Droid uses for compaction.',
      formatUnknownDefault(defaults.compactionModel),
    ),
    booleanDefaultRow(
      'Automatic compaction',
      'Whether threshold-based compaction is enabled by default.',
      defaults.compactionThresholdCheckEnabled,
    ),
    stringDefaultRow(
      'Subagent models',
      'Model defaults used by spawned subagents.',
      formatObjectSummary(defaults.subagentModelSettings),
    ),
    stringDefaultRow(
      'Mission models',
      'Model defaults used by mission workers.',
      formatObjectSummary(defaults.missionSettings ?? defaults.missionModelSettings),
    ),
    stringDefaultRow(
      'Mission orchestrator',
      'Model and reasoning effort for mission orchestration.',
      formatJoinedValues([
        defaults.missionOrchestratorModel,
        formatTitleValue(defaults.missionOrchestratorReasoningEffort),
      ]),
    ),
  ].filter((row): row is FactoryDefaultRow => row !== null)
}

function stringDefaultRow(
  label: string,
  description: string,
  value: string | undefined,
): FactoryDefaultRow | null {
  return value ? { label, description, value } : null
}

function numberDefaultRow(
  label: string,
  description: string,
  value: number | undefined,
): FactoryDefaultRow | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? { label, description, value: value.toLocaleString() }
    : null
}

function booleanDefaultRow(
  label: string,
  description: string,
  value: boolean | undefined,
): FactoryDefaultRow | null {
  return typeof value === 'boolean'
    ? { label, description, value: value ? 'Enabled' : 'Disabled' }
    : null
}

function formatTitleValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function formatUnknownDefault(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return formatObjectSummary(value)
}

function formatObjectSummary(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => typeof entryValue !== 'undefined' && entryValue !== null)
    .slice(0, 3)
    .map(([key, entryValue]) => `${key}: ${formatSummaryValue(entryValue)}`)

  if (entries.length === 0) {
    return undefined
  }

  return entries.join(', ')
}

function formatSummaryValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`
  }

  if (isRecord(value)) {
    return `${Object.keys(value).length} setting${Object.keys(value).length === 1 ? '' : 's'}`
  }

  return 'Configured'
}

function formatJoinedValues(values: Array<string | undefined>): string | undefined {
  const filtered = values.filter((value): value is string => Boolean(value))
  return filtered.length > 0 ? filtered.join(' · ') : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function SegmentedControl<TValue extends string>({
  value,
  options,
  onChange,
}: {
  value: TValue
  options: Array<{ value: TValue; label: string }>
  onChange: (value: TValue) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-fd-border-default bg-fd-panel p-1">
      {options.map((option) => {
        const isActive = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            className={`rounded px-2 py-1 text-[11px] transition-colors ${
              isActive
                ? 'bg-fd-ember-400 text-fd-canvas'
                : 'text-fd-secondary hover:bg-fd-border-subtle'
            }`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-fd-primary">{label}</p>
        <p className="text-[11px] text-fd-tertiary">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SettingsValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="block max-w-72 truncate rounded-md border border-fd-border-default bg-fd-panel px-3 py-1.5 text-right text-xs text-fd-secondary">
      {children}
    </span>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <Switch
      checked={checked}
      className="cursor-pointer data-checked:bg-fd-ember-400 data-unchecked:bg-fd-tertiary/30"
      aria-label={label}
      onCheckedChange={onChange}
    />
  )
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-fd-secondary">{label}</span>
      <div className="flex items-center gap-0.5">
        {keys.map((key) => (
          <kbd
            key={key}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-fd-border-default bg-fd-panel px-1.5 text-[10px] font-medium text-fd-secondary"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  )
}
