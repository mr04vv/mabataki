import { defineConfig } from 'vitest/config'

const localPath = (relative: string) => new URL(relative, import.meta.url).pathname

export default defineConfig({
  resolve: {
    alias: {
      '@mabataki/core': localPath('../../packages/core/src/index.ts'),
      '@mabataki/mediapipe': localPath('../../packages/mediapipe/src/index.ts'),
      '@mabataki/pixi': localPath('../../packages/pixi/src/index.ts'),
      '@mabataki/web': localPath('../../packages/web/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        camera: localPath('camera.html'),
        editor: localPath('index.html'),
        viewer: localPath('viewer.html'),
      },
    },
  },
  test: {
    environment: 'node',
  },
})
