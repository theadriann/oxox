// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { NotificationNavigationPayload } from '../../../../../shared/ipc/contracts'
import { useNotificationNavigation } from '../useNotificationNavigation'

type NotificationAppApi = {
  onNotificationNavigation?: (
    listener: (payload: NotificationNavigationPayload) => void | Promise<void>,
  ) => (() => void) | undefined
}

function NotificationNavigationProbe({
  appApi,
  liveSessionStore,
  transcriptStore,
  onSelectSession,
}: {
  appApi: NotificationAppApi
  liveSessionStore: {
    refreshSnapshot: (sessionId: string) => Promise<void>
    snapshotsById: Map<string, unknown>
  }
  transcriptStore: {
    openSession: (sessionId: string) => Promise<void>
  }
  onSelectSession: (sessionId: string) => void
}) {
  useNotificationNavigation({
    appApi,
    liveSessionStore,
    transcriptStore,
    onSelectSession,
  })

  return null
}

describe('useNotificationNavigation', () => {
  it('subscribes through the injected app api, opens the transcript when needed, and unsubscribes on cleanup', async () => {
    Reflect.deleteProperty(window, 'oxox')

    const refreshSnapshot = vi.fn().mockResolvedValue(undefined)
    const openSession = vi.fn().mockResolvedValue(undefined)
    const onSelectSession = vi.fn()
    const unsubscribe = vi.fn()
    const snapshotsById = new Map<string, unknown>()
    let notificationListener:
      | ((payload: NotificationNavigationPayload) => void | Promise<void>)
      | undefined

    const onNotificationNavigation = vi.fn((listener) => {
      notificationListener = listener
      return unsubscribe
    })

    const { unmount } = render(
      <NotificationNavigationProbe
        appApi={{ onNotificationNavigation }}
        liveSessionStore={{ refreshSnapshot, snapshotsById }}
        transcriptStore={{ openSession }}
        onSelectSession={onSelectSession}
      />,
    )

    expect(onNotificationNavigation).toHaveBeenCalledTimes(1)

    await act(async () => {
      await notificationListener?.({ sessionId: '  session-live-2  ' })
    })

    expect(refreshSnapshot).toHaveBeenCalledWith('session-live-2')
    expect(openSession).toHaveBeenCalledWith('session-live-2')
    expect(onSelectSession).toHaveBeenCalledWith('session-live-2')

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
