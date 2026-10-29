import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 100000000 },
  assetsInclude: ['**/*.glb'],
  test: { globals: true, environment: 'node' },
} as any);
