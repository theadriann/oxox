import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.tsx'],
  },
})
