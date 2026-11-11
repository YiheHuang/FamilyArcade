import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5193, strictPort: true },
  preview: { port: 4193 },
  build: { target: 'es2022' },
});
