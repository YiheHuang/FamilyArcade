import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5212, strictPort: true },
  preview: { port: 4212 },
  build: { target: 'es2022' },
});
