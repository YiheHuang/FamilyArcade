import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const engineEntry = fileURLToPath(new URL('../engine/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 相对路径产物：同时兼容服务器托管（/）与桌面壳 file:// 加载
  base: './',
  resolve: {
    alias: {
      '@splendor/engine': engineEntry,
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
