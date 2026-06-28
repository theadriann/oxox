import { describe, expect, it, vi } from 'vitest'

import { startRuntimeCoordinator } from '../app/runtimeCoordinator'

describe('startRuntimeCoordinator', () => {
  it('subscribes to runtime sources, broadcasts payloads, and cleans up subscriptions', () => {
    let foundationListener: ((payload: { refreshedAt: string }) => void) | undefined
    let liveSnapshotListener: ((sessionId: string) => void) | undefined
    let liveEventListener:
      | ((payload: {
          sessionId: string
          event: { type: 'message.delta'; messageId: string; delta: string }
        }) => void)
      | undefined
    let pluginHostListener:
      | ((snapshot: {
          pluginId: string
          status: string
          processId: number | null
          lastError: string | null
        }) => void)
      | undefined
    const unsubscribeFoundation = vi.fn()
    const unsubscribeSnapshots = vi.fn()
    const unsubscribeEvents = vi.fn()
    const unsubscribePluginHost = vi.fn()
    const foundationService = {
      subscribeToFoundationUpdates: vi.fn(
        (listener: (payload: { refreshedAt: string }) => void) => {
          foundationListener = listener
          return unsubscribeFoundation
        },
      ),
      subscribeToLiveSessionSnapshots: vi.fn((listener: (sessionId: string) => void) => {
        liveSnapshotListener = listener
        return unsubscribeSnapshots
      }),
      subscribeToLiveSessionEvents: vi.fn(
        (
          listener: (payload: {
            sessionId: string
            event: { type: 'message.delta'; messageId: string; delta: string }
          }) => void,
        ) => {
          liveEventListener = listener
          return unsubscribeEvents
        },
      ),
    }
    const pluginHost = {
      subscribe: vi.fn(
        (
          listener: (snapshot: {
            pluginId: string
            status: string
            processId: number | null
            lastError: string | null
          }) => void,
        ) => {
          pluginHostListener = listener
          return unsubscribePluginHost
        },
      ),
    }
    const broadcastFoundationChanged = vi.fn()
    const broadcastLiveSessionSnapshot = vi.fn()
    const broadcastLiveSessionEvent = vi.fn()
    const broadcastPluginHostSnapshot = vi.fn()
    const startPluginBootstrap = vi.fn()

    const stop = startRuntimeCoordinator({
      foundationService,
      pluginHost,
      broadcastFoundationChanged,
      broadcastLiveSessionEvent,
      broadcastLiveSessionSnapshot,
      broadcastPluginHostSnapshot,
      startPluginBootstrap,
    })

    foundationListener?.({ refreshedAt: '2026-04-02T00:00:00.000Z' })
    liveSnapshotListener?.('session-1')
    liveEventListener?.({
      sessionId: 'session-1',
      event: { type: 'message.delta', messageId: 'assistant-1', delta: 'Hello' },
    })
    pluginHostListener?.({
      pluginId: 'plugin.example',
      processId: 4242,
      status: 'running',
      lastError: null,
    })

    expect(broadcastFoundationChanged).toHaveBeenCalledWith({
      refreshedAt: '2026-04-02T00:00:00.000Z',
    })
    expect(broadcastLiveSessionSnapshot).toHaveBeenCalledWith({
      sessionId: 'session-1',
    })
    expect(broadcastLiveSessionEvent).toHaveBeenCalledWith({
      sessionId: 'session-1',
      event: { type: 'message.delta', messageId: 'assistant-1', delta: 'Hello' },
    })
    expect(broadcastPluginHostSnapshot).toHaveBeenCalledWith({
      snapshot: {
        pluginId: 'plugin.example',
        processId: 4242,
        status: 'running',
        lastError: null,
      },
    })
    expect(startPluginBootstrap).toHaveBeenCalledTimes(1)

    stop()

    expect(unsubscribeFoundation).toHaveBeenCalledTimes(1)
    expect(unsubscribeSnapshots).toHaveBeenCalledTimes(1)
    expect(unsubscribeEvents).toHaveBeenCalledTimes(1)
    expect(unsubscribePluginHost).toHaveBeenCalledTimes(1)
  })
})
