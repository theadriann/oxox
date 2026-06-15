import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import { StoreProvider } from './state/root/store-provider'
import './styles.css'
import { ThemeProvider } from './components/ui/theme-provider'
import { TooltipProvider } from './components/ui/tooltip'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <StoreProvider>
      <ThemeProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </ThemeProvider>
    </StoreProvider>
  </React.StrictMode>,
)
