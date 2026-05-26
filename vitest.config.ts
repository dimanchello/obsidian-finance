import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.modal.ts'],
    },
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, 'src/__tests__/mock-obsidian.ts'),
    },
  },
});
