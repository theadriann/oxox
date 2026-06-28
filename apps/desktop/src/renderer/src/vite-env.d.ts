/// <reference types="vite/client" />

import type { OxoxBridge } from '../../shared/ipc/contracts'

declare global {
  interface Window {
    oxox: OxoxBridge
  }
}
