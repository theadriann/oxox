import { useObserveEffect } from '@legendapp/state/react'
import type { ComposerStore } from '../state/composer/composer.model'
import type { FoundationStore } from '../state/foundation/foundation.model'
import type { LiveSessionStore } from '../state/live-sessions/live-session.model'
import type { PluginCapabilityStore } from '../state/plugins/plugin-capability.model'
import type { PluginHostStore } from '../state/plugins/plugin-host.model'
import type { RootStore } from '../state/root/root.model'
import type { SessionStore } from '../state/sessions/session.model'
import type { TranscriptStore } from '../state/transcripts/transcript.model'
import type { UpdateStore } from '../state/updates/update.model'
import { useAppUpdateEvents } from './useAppUpdateEvents'
import { useFoundationPoll } from './useFoundationPoll'
import { useLiveSessionPoll } from './useLiveSessionPoll'
import { useNotificationNavigation } from './useNotificationNavigation'
import { usePluginCapabilityEvents } from './usePluginCapabilityEvents'
import { usePluginHostEvents } from './usePluginHostEvents'

interface UseAppRuntimeOptions {
  rootStore: RootStore
  composerStore: ComposerStore
  foundationStore: FoundationStore
  liveSessionStore: LiveSessionStore
  pluginCapabilityStore: PluginCapabilityStore
  pluginHostStore: PluginHostStore
  sessionStore: SessionStore
  transcriptStore: TranscriptStore
  updateStore: UpdateStore
  onSelectSession: (sessionId: string) => void
}

export function useAppRuntime({
  rootStore,
  composerStore,
  foundationStore,
  liveSessionStore,
  pluginCapabilityStore,
  pluginHostStore,
  sessionStore,
  transcriptStore,
  updateStore,
  onSelectSession,
}: UseAppRuntimeOptions): void {
  useAppUpdateEvents({ appApi: rootStore.api.app, updateStore })
  useFoundationPoll({ foundationApi: rootStore.api.foundation, foundationStore })
  useLiveSessionPoll({ liveSessionStore, sessionApi: rootStore.api.session })
  usePluginCapabilityEvents({ pluginApi: rootStore.api.plugin, pluginCapabilityStore })
  usePluginHostEvents({ pluginApi: rootStore.api.plugin, pluginHostStore })
  useNotificationNavigation({
    appApi: rootStore.api.app,
    liveSessionStore,
    transcriptStore,
    onSelectSession,
  })

  useObserveEffect(() => {
    const nextSessionId = sessionStore.selectedSessionId
    composerStore.resetForSession(nextSessionId || '')

    if (!nextSessionId) {
      return
    }

    void transcriptStore.openSession(nextSessionId)
  })
}
