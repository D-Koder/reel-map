import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.js, which loads the local API handlers (and Puppeteer) on start.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{js,jsx}', 'tests/db/**/*.test.js', 'tests/live/**/*.test.js'],
    environment: 'node',
    // The database tests share two real accounts, so they run one file at a time.
    fileParallelism: false,
    testTimeout: 30000,
    // Makes the database tests' two throwaway accounts, and deletes them after.
    globalSetup: ['tests/setup/accounts.js'],
  },
});
