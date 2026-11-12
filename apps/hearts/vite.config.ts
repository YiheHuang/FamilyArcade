import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5208, strictPort: true },
  preview: { port: 4208 },
  build: { target: 'es2022' },
});
