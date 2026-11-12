import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5220, strictPort: true },
  preview: { port: 4220 },
  build: { target: 'es2022' },
});
