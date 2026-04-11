// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const {
  useFoundationPollMock,
  useLiveSessionPollMock,
  usePluginCapabilityEventsMock,
  usePluginHostEventsMock,
  useNotificationNavigationMock,
} = vi.hoisted(() => ({
  useFoundationPollMock: vi.fn(),
  useLiveSessionPollMock: vi.fn(),
  usePluginCapabilityEventsMock: vi.fn(),
  usePluginHostEventsMock: vi.fn(),
  useNotificationNavigationMock: vi.fn(),
}))

vi.mock('../useFoundationPoll', () => ({
  useFoundationPoll: useFoundationPollMock,
}))

vi.mock('../useLiveSessionPoll', () => ({
  useLiveSessionPoll: useLiveSessionPollMock,
}))

vi.mock('../usePluginCapabilityEvents', () => ({
  usePluginCapabilityEvents: usePluginCapabilityEventsMock,
}))

vi.mock('../usePluginHostEvents', () => ({
  usePluginHostEvents: usePluginHostEventsMock,
}))

vi.mock('../useNotificationNavigation', () => ({
  useNotificationNavigation: useNotificationNavigationMock,
}))

import { useAppRuntime } from '../useAppRuntime'

function RuntimeProbe(props: Parameters<typeof useAppRuntime>[0]) {
  useAppRuntime(props)
  return null
}

describe('useAppRuntime', () => {
  it('wires runtime hooks through the injected root-store apis', () => {
    const rootStore = {
      api: {
        app: { onNotificationNavigation: vi.fn() },
        foundation: { onChanged: vi.fn() },
        plugin: {
          onCapabilitiesChanged: vi.fn(),
          onHostChanged: vi.fn(),
        },
        session: { onSnapshotChanged: vi.fn() },
      },
    }
    const foundationStore = {
      initRuntime: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
    }
    const liveSessionStore = {
      selectedSnapshotId: 'session-live-1',
      selectedSnapshot: null,
      refreshSnapshot: vi.fn().mockResolvedValue(undefined),
      upsertSnapshot: vi.fn(),
      snapshotsById: new Map<string, unknown>(),
    }
    const pluginCapabilityStore = {
      refresh: vi.fn().mockResolvedValue(undefined),
    }
    const pluginHostStore = {
      refresh: vi.fn().mockResolvedValue(undefined),
      applySnapshot: vi.fn(),
    }
    const sessionStore = {
      selectedSessionId: 'session-1',
    }
    const transcriptStore = {
      openSession: vi.fn().mockResolvedValue(undefined),
    }
    const composerStore = {
      resetForSession: vi.fn(),
    }
    const onSelectSession = vi.fn()

    render(
      <RuntimeProbe
        rootStore={rootStore as never}
        foundationStore={foundationStore}
        liveSessionStore={liveSessionStore}
        pluginCapabilityStore={pluginCapabilityStore}
        pluginHostStore={pluginHostStore}
        sessionStore={sessionStore}
        transcriptStore={transcriptStore}
        composerStore={composerStore}
        onSelectSession={onSelectSession}
      />,
    )

    expect(useFoundationPollMock).toHaveBeenCalledWith({
      foundationApi: rootStore.api.foundation,
      foundationStore,
    })
    expect(useLiveSessionPollMock).toHaveBeenCalledWith({
      liveSessionStore,
      sessionApi: rootStore.api.session,
    })
    expect(usePluginCapabilityEventsMock).toHaveBeenCalledWith({
      pluginApi: rootStore.api.plugin,
      pluginCapabilityStore,
    })
    expect(usePluginHostEventsMock).toHaveBeenCalledWith({
      pluginApi: rootStore.api.plugin,
      pluginHostStore,
    })
    expect(useNotificationNavigationMock).toHaveBeenCalledWith({
      appApi: rootStore.api.app,
      liveSessionStore,
      transcriptStore,
      onSelectSession,
    })
  })

  it('resets composer state for the selected session and opens the transcript again when selection changes to a live session', async () => {
    const transcriptStore = {
      openSession: vi.fn().mockResolvedValue(undefined),
    }
    const composerStore = {
      resetForSession: vi.fn(),
    }

    const { rerender } = render(
      <RuntimeProbe
        rootStore={
          {
            api: {
              app: {},
              foundation: {},
              plugin: {},
              session: {},
            },
          } as never
        }
        foundationStore={{
          initRuntime: vi.fn().mockResolvedValue(undefined),
          refresh: vi.fn().mockResolvedValue(undefined),
        }}
        liveSessionStore={{
          selectedSnapshotId: null,
          selectedSnapshot: null,
          refreshSnapshot: vi.fn().mockResolvedValue(undefined),
          upsertSnapshot: vi.fn(),
          snapshotsById: new Map<string, unknown>(),
        }}
        pluginCapabilityStore={{
          refresh: vi.fn().mockResolvedValue(undefined),
        }}
        pluginHostStore={{
          refresh: vi.fn().mockResolvedValue(undefined),
          applySnapshot: vi.fn(),
        }}
        sessionStore={{
          selectedSessionId: 'session-1',
        }}
        transcriptStore={transcriptStore}
        composerStore={composerStore}
        onSelectSession={vi.fn()}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(composerStore.resetForSession).toHaveBeenCalledWith('session-1')
    expect(transcriptStore.openSession).toHaveBeenCalledWith('session-1')

    rerender(
      <RuntimeProbe
        rootStore={
          {
            api: {
              app: {},
              foundation: {},
              plugin: {},
              session: {},
            },
          } as never
        }
        foundationStore={{
          initRuntime: vi.fn().mockResolvedValue(undefined),
          refresh: vi.fn().mockResolvedValue(undefined),
        }}
        liveSessionStore={{
          selectedSnapshotId: 'session-2',
          selectedSnapshot: {
            sessionId: 'session-2',
          },
          refreshSnapshot: vi.fn().mockResolvedValue(undefined),
          upsertSnapshot: vi.fn(),
          snapshotsById: new Map<string, unknown>(),
        }}
        pluginCapabilityStore={{
          refresh: vi.fn().mockResolvedValue(undefined),
        }}
        pluginHostStore={{
          refresh: vi.fn().mockResolvedValue(undefined),
          applySnapshot: vi.fn(),
        }}
        sessionStore={{
          selectedSessionId: 'session-2',
        }}
        transcriptStore={transcriptStore}
        composerStore={composerStore}
        onSelectSession={vi.fn()}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(transcriptStore.openSession).toHaveBeenCalledTimes(2)
  })
})
