import { useState } from 'react'

import App from '../../desktop/src/renderer/src/App'
import { ThemeProvider } from '../../desktop/src/renderer/src/components/ui/theme-provider'
import { TooltipProvider } from '../../desktop/src/renderer/src/components/ui/tooltip'
import { useMountEffect } from '../../desktop/src/renderer/src/hooks/useMountEffect'
import { RootStore } from '../../desktop/src/renderer/src/state/root/root.model'
import { StoreProvider } from '../../desktop/src/renderer/src/state/root/store-provider'
import {
  checkWebRemoteAuthentication,
  createWebPlatformApiClient,
  type WebRemoteAuthenticationState,
} from './platform/webApiClient'

type WebRemoteShellState =
  | { status: 'checking' }
  | { status: 'ready'; rootStore: RootStore }
  | { status: 'blocked'; auth: Exclude<WebRemoteAuthenticationState, { status: 'authenticated' }> }

export function WebRemoteShell() {
  const [state, setState] = useState<WebRemoteShellState>({ status: 'checking' })

  useMountEffect(() => {
    let disposed = false

    void checkWebRemoteAuthentication().then((auth) => {
      if (disposed) {
        return
      }

      if (auth.status === 'authenticated') {
        setState({ status: 'ready', rootStore: new RootStore(createWebPlatformApiClient()) })
        return
      }

      setState({ status: 'blocked', auth })
    })

    return () => {
      disposed = true
    }
  })

  if (state.status === 'checking') {
    return (
      <WebTerminalState
        code="..."
        title="Connecting"
        message="Checking remote OXOX access."
        actionLabel="Stand by"
      />
    )
  }

  if (state.status === 'blocked') {
    const code = state.auth.status === 'unauthenticated' ? state.auth.statusCode : 503
    const title = state.auth.status === 'unauthenticated' ? 'Forbidden' : 'Unavailable'

    return (
      <WebTerminalState
        code={String(code)}
        title={title}
        message={state.auth.message}
        actionLabel="Reload [0]"
        onReload={() => window.location.reload()}
      />
    )
  }

  return (
    <StoreProvider rootStore={state.rootStore}>
      <ThemeProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </ThemeProvider>
    </StoreProvider>
  )
}

function WebTerminalState({
  actionLabel,
  code,
  message,
  onReload,
  title,
}: {
  actionLabel: string
  code: string
  message: string
  onReload?: () => void
  title: string
}) {
  return (
    <main className="oxox-web-auth-screen" aria-label={`${title}: ${message}`}>
      <div className="oxox-web-auth-noise" aria-hidden="true" />
      <section className="oxox-web-auth-terminal">
        <p className="oxox-web-auth-code">ERROR: {code}</p>
        <h1>{title}</h1>
        <p className="oxox-web-auth-message">{message}</p>
        <div className="oxox-web-auth-rule" />
        <div className="oxox-web-auth-rule" />
        <button
          className="oxox-web-auth-action"
          disabled={!onReload}
          onClick={onReload}
          type="button"
        >
          {actionLabel}
        </button>
      </section>
    </main>
  )
}
