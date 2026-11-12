import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5205, strictPort: true },
  preview: { port: 4205 },
  build: { target: 'es2022' },
});
