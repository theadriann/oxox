import { describe, expect, it } from 'vitest'

import type { LiveSessionEventRecord } from '../../../shared/ipc/contracts'
import type { SessionEvent } from '../protocol/sessionEvents'
import type { StreamJsonRpcTransport } from '../protocol/transport'

type Assert<T extends true> = T
type SharedStreamErrorEvent = Extract<LiveSessionEventRecord, { type: 'stream.error' }>
type SharedSettingsChangedEvent = Extract<
  LiveSessionEventRecord,
  { type: 'session.settingsChanged' }
>

const VALID_SHARED_ERROR_EVENT = {
  type: 'stream.error',
  error: 'serialized stream error',
  recoverable: true,
} satisfies LiveSessionEventRecord

const VALID_SHARED_SETTINGS_EVENT = {
  type: 'session.settingsChanged',
  settings: {
    autonomyLevel: 'medium',
    reasoningEffort: 'high',
  },
} satisfies LiveSessionEventRecord

// @ts-expect-error shared IPC snapshots must serialize stream errors to strings
const INVALID_SHARED_ERROR_EVENT = {
  type: 'stream.error',
  error: new Error('stream failed'),
} satisfies LiveSessionEventRecord

type SharedContractsCarrySerializedStreamErrors = Assert<
  { type: 'stream.error'; error: string } extends SharedStreamErrorEvent ? true : false
>
type SharedContractsExposeSettingsPatch = Assert<
  {
    type: 'session.settingsChanged'
    settings: {
      autonomyLevel?: string
      reasoningEffort?: string
    }
  } extends SharedSettingsChangedEvent
    ? true
    : false
>

describe('integration protocol types', () => {
  it('defines the full normalized SessionEvent union', () => {
    const eventTypes: Array<SessionEvent['type']> = [
      'message.delta',
      'message.completed',
      'tool.progress',
      'tool.result',
      'permission.requested',
      'permission.resolved',
      'askUser.requested',
      'askUser.resolved',
      'session.statusChanged',
      'session.settingsChanged',
      'session.titleChanged',
      'session.tokenUsageChanged',
      'stream.warning',
      'stream.error',
      'stream.completed',
    ]

    expect(eventTypes).toHaveLength(15)
  })

  it('describes the stream-jsonrpc transport surface for future adapters', () => {
    const transport = {
      id: 'stream-jsonrpc',
      factoryApiVersion: '1.0.0',
      sendRequest: async () => ({ ok: true }),
      subscribe: () => () => undefined,
    } satisfies StreamJsonRpcTransport

    expect(transport.id).toBe('stream-jsonrpc')
    expect(transport.factoryApiVersion).toBe('1.0.0')
  })

  it('keeps shared live-session events serializable across the preload boundary', () => {
    expect(VALID_SHARED_ERROR_EVENT).toMatchObject({
      type: 'stream.error',
      error: 'serialized stream error',
    })
    expect(VALID_SHARED_SETTINGS_EVENT).toMatchObject({
      type: 'session.settingsChanged',
      settings: {
        autonomyLevel: 'medium',
        reasoningEffort: 'high',
      },
    })
    expect(INVALID_SHARED_ERROR_EVENT.type).toBe('stream.error')
    expectTypeAlias<SharedContractsCarrySerializedStreamErrors>()
    expectTypeAlias<SharedContractsExposeSettingsPatch>()
  })
})

function expectTypeAlias<_T extends true>(): void {
  expect(true).toBe(true)
}
