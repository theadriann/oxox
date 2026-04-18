import { useValue } from '../../stores/legend'
import { useUIStore } from '../../stores/StoreProvider'

export function GeneralSettings() {
  const uiStore = useUIStore()
  const isSidebarHidden = useValue(() => uiStore.isSidebarHidden)
  const isContextPanelHidden = useValue(() => uiStore.isContextPanelHidden)
  const composerContextUsageDisplayMode = useValue(() => uiStore.composerContextUsageDisplayMode)

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
      </div>

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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        checked ? 'bg-fd-ember-400' : 'bg-fd-tertiary/30'
      }`}
      onClick={onChange}
    >
      <span
        className={`pointer-events-none inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
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
