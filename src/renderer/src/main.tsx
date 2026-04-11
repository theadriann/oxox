import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import { StoreProvider } from './stores/StoreProvider'
import './styles.css'
import { ThemeProvider } from './components/ui/theme-provider'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <StoreProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StoreProvider>
  </React.StrictMode>,
)
