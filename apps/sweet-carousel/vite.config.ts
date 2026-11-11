import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
  preview: { port: 5176 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
