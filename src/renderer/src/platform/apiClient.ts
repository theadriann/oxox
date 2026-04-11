import type { OxoxBridge } from '../../../shared/ipc/contracts'

type OptionalGroup<T> = {
  [K in keyof T]?: T[K]
}

export interface PlatformBridgeSource {
  oxox?: OxoxBridge
}

export interface PlatformApiClient {
  bridge: OxoxBridge | null
  runtime: OptionalGroup<OxoxBridge['runtime']>
  app: OptionalGroup<NonNullable<OxoxBridge['app']>>
  plugin: OptionalGroup<NonNullable<OxoxBridge['plugin']>>
  dialog: OptionalGroup<OxoxBridge['dialog']>
  foundation: OptionalGroup<OxoxBridge['foundation']>
  database: OptionalGroup<OxoxBridge['database']>
  transcript: OptionalGroup<OxoxBridge['transcript']>
  session: OptionalGroup<OxoxBridge['session']>
}

let hasWarnedAboutRawWindowBridgeFallback = false

function getWindowPlatformBridgeSource(): PlatformBridgeSource {
  return typeof window === 'undefined' ? {} : window
}

function shouldWarnAboutRawWindowBridgeFallback(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.oxox) &&
    typeof import.meta !== 'undefined' &&
    Boolean(import.meta.env?.DEV)
  )
}

function warnAboutRawWindowBridgeFallback(): void {
  if (hasWarnedAboutRawWindowBridgeFallback || !shouldWarnAboutRawWindowBridgeFallback()) {
    return
  }

  hasWarnedAboutRawWindowBridgeFallback = true
  console.warn(
    'createPlatformApiClient() fell back to window.oxox directly. Prefer explicit platform-client injection or createRendererPlatformApiClient() at renderer bootstrap.',
  )
}

function buildPlatformApiClient(bridge: OxoxBridge | null): PlatformApiClient {
  return {
    bridge,
    runtime: bridge?.runtime ?? {},
    app: bridge?.app ?? {},
    plugin: bridge?.plugin ?? {},
    dialog: bridge?.dialog ?? {},
    foundation: bridge?.foundation ?? {},
    database: bridge?.database ?? {},
    transcript: bridge?.transcript ?? {},
    session: bridge?.session ?? {},
  }
}

export function createPlatformApiClient(source?: PlatformBridgeSource): PlatformApiClient {
  if (source === undefined) {
    warnAboutRawWindowBridgeFallback()
  }

  const resolvedSource = source ?? getWindowPlatformBridgeSource()
  const bridge = resolvedSource.oxox ?? null

  return buildPlatformApiClient(bridge)
}

export function createRendererPlatformApiClient(): PlatformApiClient {
  const bridge = getWindowPlatformBridgeSource().oxox ?? null

  return buildPlatformApiClient(bridge)
}
