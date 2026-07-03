import { describe, expect, it } from 'vitest'

import { createRemoteAuthCookies, readBrowserCredentials } from './auth'

describe('readBrowserCredentials', () => {
  it('reads remote credentials from query parameters for EventSource clients', () => {
    const url = new URL('https://relay.example.com/events?hostId=macbook&token=phone-token')

    expect(readBrowserCredentials({}, url)).toEqual({
      hostId: 'macbook',
      token: 'phone-token',
    })
  })

  it('prefers headers for fetch clients', () => {
    const url = new URL('https://relay.example.com/rpc/session%3Aattach?hostId=query-host')

    expect(
      readBrowserCredentials(
        {
          'x-oxox-remote-host': 'header-host',
          'x-oxox-remote-token': 'header-token',
        },
        url,
      ),
    ).toEqual({
      hostId: 'header-host',
      token: 'header-token',
    })
  })

  it('rejects incomplete credentials', () => {
    expect(
      readBrowserCredentials({}, new URL('https://relay.example.com/events?hostId=macbook')),
    ).toBeNull()
  })

  it('reads remote credentials from secure login cookies', () => {
    expect(
      readBrowserCredentials(
        {
          cookie: 'oxox_remote_host=macbook; oxox_remote_token=phone-token',
        },
        new URL('https://relay.example.com/events'),
      ),
    ).toEqual({
      hostId: 'macbook',
      token: 'phone-token',
    })
  })
})

describe('createRemoteAuthCookies', () => {
  it('creates HttpOnly secure cookies for the remote browser session', () => {
    expect(createRemoteAuthCookies({ hostId: 'macbook', token: 'phone-token' })).toEqual([
      'oxox_remote_host=macbook; HttpOnly; Max-Age=2592000; Path=/; SameSite=Lax; Secure',
      'oxox_remote_token=phone-token; HttpOnly; Max-Age=2592000; Path=/; SameSite=Lax; Secure',
    ])
  })
})
