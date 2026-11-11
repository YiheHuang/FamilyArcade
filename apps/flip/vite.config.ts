import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5182, strictPort: true },
  preview: { port: 4182 },
  build: { target: 'es2022' },
});
