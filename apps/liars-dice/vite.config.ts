import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5224, strictPort: true },
  preview: { port: 4224 },
  build: { target: 'es2022' },
});
