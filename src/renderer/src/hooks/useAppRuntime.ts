import { useEffect } from 'react'

import type { ComposerStore } from '../stores/ComposerStore'
import type { FoundationStore } from '../stores/FoundationStore'
import type { LiveSessionStore } from '../stores/LiveSessionStore'
import type { PluginCapabilityStore } from '../stores/PluginCapabilityStore'
import type { PluginHostStore } from '../stores/PluginHostStore'
import type { RootStore } from '../stores/RootStore'
import type { SessionStore } from '../stores/SessionStore'
import type { TranscriptStore } from '../stores/TranscriptStore'
import type { UpdateStore } from '../stores/UpdateStore'
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

  useEffect(() => {
    composerStore.resetForSession(sessionStore.selectedSessionId || '')
  }, [composerStore, sessionStore.selectedSessionId])

  useEffect(() => {
    if (!sessionStore.selectedSessionId) {
      return
    }

    void transcriptStore.openSession(sessionStore.selectedSessionId)
  }, [sessionStore.selectedSessionId, transcriptStore])
}
