import { Archive, ArrowLeft, Settings2 } from 'lucide-react'
import { memo } from 'react'

import type { SettingsSection } from '../../stores/UIStore'

const SETTINGS_SECTIONS: Array<{
  key: SettingsSection
  label: string
  icon: typeof Settings2
}> = [
  { key: 'general', label: 'General', icon: Settings2 },
  { key: 'archive', label: 'Archive', icon: Archive },
]

interface SettingsSidebarProps {
  activeSection: SettingsSection
  onSelectSection: (section: SettingsSection) => void
  onBack: () => void
}

export function SettingsSidebar({ activeSection, onSelectSection, onBack }: SettingsSidebarProps) {
  return (
    <aside
      className="flex h-full flex-col border-r border-fd-border-subtle bg-fd-surface pt-[50px]"
      aria-label="Settings sidebar"
    >
      <div className="border-b border-fd-border-subtle px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fd-secondary transition-colors hover:bg-fd-panel hover:text-fd-primary"
          onClick={onBack}
        >
          <ArrowLeft className="size-3" />
          Back to sessions
        </button>
      </div>

      <div className="px-3 pb-1 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-fd-tertiary">
          Settings
        </p>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-1" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((section) => (
          <SettingsNavItem
            key={section.key}
            section={section}
            isActive={activeSection === section.key}
            onSelect={onSelectSection}
          />
        ))}
      </nav>
    </aside>
  )
}

const SettingsNavItem = memo(function SettingsNavItem({
  section,
  isActive,
  onSelect,
}: {
  section: (typeof SETTINGS_SECTIONS)[number]
  isActive: boolean
  onSelect: (key: SettingsSection) => void
}) {
  const Icon = section.icon

  return (
    <button
      type="button"
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
        isActive
          ? 'bg-white/[0.07] font-medium text-fd-primary'
          : 'text-fd-secondary hover:bg-white/[0.04] hover:text-fd-primary'
      }`}
      onClick={() => onSelect(section.key)}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon className="size-3.5" />
      {section.label}
    </button>
  )
})
