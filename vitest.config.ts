import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/protocol', 'packages/engine', 'apps/server/vitest.config.ts'],
  },
});
