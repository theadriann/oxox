import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const daemonUrl = process.env.VITE_OXOX_API_URL ?? 'http://127.0.0.1:3210'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: resolve(currentDirectory, '../desktop/src/renderer/public'),
  resolve: {
    alias: {
      '@': resolve(currentDirectory, '../desktop/src/renderer/src'),
    },
  },
  server: {
    port: 3211,
    proxy: {
      '/events': {
        target: daemonUrl,
        changeOrigin: true,
      },
      '/health': {
        target: daemonUrl,
        changeOrigin: true,
      },
      '/rpc': {
        target: daemonUrl,
        changeOrigin: true,
      },
    },
    strictPort: true,
  },
  preview: {
    port: 3211,
    strictPort: true,
  },
})
