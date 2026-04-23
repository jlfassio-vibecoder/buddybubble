import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@utils': path.resolve(__dirname, './utils'),
    },
  },
  test: {
    // happy-dom provides File/Blob and other browser globals used by attachment tests (Node alone does not).
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
