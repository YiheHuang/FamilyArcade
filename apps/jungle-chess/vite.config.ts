import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5207, strictPort: true },
  preview: { port: 4207 },
  build: { target: 'es2022' },
});
