import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5223, strictPort: true },
  preview: { port: 4223 },
  build: { target: 'es2022' },
});
