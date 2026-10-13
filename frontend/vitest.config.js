import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.js, which loads the local API handlers (and Puppeteer) on start.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{js,jsx}', 'tests/db/**/*.test.js'],
    environment: 'node',
    // The database tests share two real accounts, so they run one file at a time.
    fileParallelism: false,
    testTimeout: 30000,
  },
});
