import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// Integration tests: real Durable Objects + WebSockets inside workerd (vitest 4 + pool 0.22).
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: { compatibilityFlags: ['nodejs_compat'] },
    }),
  ],
  test: {
    name: 'server-workers',
    include: ['test/workers/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
