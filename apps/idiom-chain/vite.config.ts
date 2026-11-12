import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5225, strictPort: true },
  preview: { port: 4225 },
  build: { target: 'es2022' },
});
