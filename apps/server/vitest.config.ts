import { defineConfig } from 'vitest/config';

// Unit tests: RoomCore against MemoryRoomStorage and a fake transport. Runs in plain Node.
export default defineConfig({
  test: { name: 'server-unit', include: ['test/unit/**/*.test.ts'], environment: 'node' },
});
