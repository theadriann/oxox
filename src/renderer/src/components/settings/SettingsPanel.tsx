import type { SettingsSection } from '../../stores/UIStore'
import { ArchiveSettings } from './ArchiveSettings'
import { GeneralSettings } from './GeneralSettings'

interface SettingsPanelProps {
  section: SettingsSection
}

export function SettingsPanel({ section }: SettingsPanelProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-6">
      {section === 'general' ? <GeneralSettings /> : null}
      {section === 'archive' ? <ArchiveSettings /> : null}
    </div>
  )
}
