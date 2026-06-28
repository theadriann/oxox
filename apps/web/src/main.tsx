import React from 'react'
import ReactDOM from 'react-dom/client'

import App from '../../desktop/src/renderer/src/App'
import { ThemeProvider } from '../../desktop/src/renderer/src/components/ui/theme-provider'
import { TooltipProvider } from '../../desktop/src/renderer/src/components/ui/tooltip'
import { RootStore } from '../../desktop/src/renderer/src/state/root/root.model'
import { StoreProvider } from '../../desktop/src/renderer/src/state/root/store-provider'
import { createWebPlatformApiClient } from './platform/webApiClient'
import './styles.css'

const rootStore = new RootStore(createWebPlatformApiClient())

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <StoreProvider rootStore={rootStore}>
      <ThemeProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </ThemeProvider>
    </StoreProvider>
  </React.StrictMode>,
)
