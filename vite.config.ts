import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        editor: 'index.html',
        viewer: 'viewer.html',
      },
    },
  },
  test: {
    environment: 'node',
  },
})
