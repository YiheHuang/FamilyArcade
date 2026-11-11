import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5192, strictPort: true },
  preview: { port: 4192 },
  build: { target: 'es2022' },
});
