import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({ base: './', plugins: [viteSingleFile()], build: { target: 'es2022', chunkSizeWarningLimit: 4000 }, test: { globals: true, environment: 'node' } } as never);
