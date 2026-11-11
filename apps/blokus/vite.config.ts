import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 8192,
    reportCompressedSize: true,
  },
  worker: {
    format: 'es',
  },
});
