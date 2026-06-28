// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPlatformApiClient, createRendererPlatformApiClient } from '../apiClient'

describe('apiClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a client from an explicit source without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const client = createPlatformApiClient({
      oxox: {
        factoryApi: {
          listComputers: vi.fn(),
        },
        workspaceFiles: {
          search: vi.fn(),
        },
        git: {
          getDiff: vi.fn(),
        },
        runtime: { getInfo: vi.fn() },
      } as never,
    })

    expect(client.factoryApi.listComputers).toBeTypeOf('function')
    expect(client.workspaceFiles.search).toBeTypeOf('function')
    expect(client.git.getDiff).toBeTypeOf('function')
    expect(client.runtime.getInfo).toBeTypeOf('function')
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once when falling back to raw window bridge access in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.oxox = {
      runtime: { getInfo: vi.fn() },
    } as never

    const firstClient = createPlatformApiClient()
    const secondClient = createPlatformApiClient()

    expect(firstClient.runtime.getInfo).toBeTypeOf('function')
    expect(secondClient.runtime.getInfo).toBeTypeOf('function')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not warn when the renderer bootstrap path is used intentionally', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.oxox = {
      runtime: { getInfo: vi.fn() },
    } as never

    const client = createRendererPlatformApiClient()

    expect(client.runtime.getInfo).toBeTypeOf('function')
    expect(warn).not.toHaveBeenCalled()
  })
})
