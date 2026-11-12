import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __HUB_LITE__: JSON.stringify(mode === 'lite'),
  },
  server: { port: 5200, strictPort: true },
  preview: { port: 4200 },
  build: { target: 'es2022' },
}));
