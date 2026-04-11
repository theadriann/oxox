import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(currentDirectory, 'src/main/index.ts'),
          'artifact-scanner-worker': resolve(
            currentDirectory,
            'src/main/integration/artifacts/worker.ts',
          ),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(currentDirectory, 'src/preload/index.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: resolve(currentDirectory, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(currentDirectory, 'src/renderer/src'),
      },
    },
    server: {
      port: 3105,
      strictPort: true,
    },
    preview: {
      port: 3105,
      strictPort: true,
    },
  },
})
