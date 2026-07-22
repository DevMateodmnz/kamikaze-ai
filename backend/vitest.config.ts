import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // DB-backed suites share one disposable schema; keep files sequential so
    // setup/cleanup from one suite cannot invalidate another suite's rows.
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/', 'dist/'],
    },
    testTimeout: 10000,
    setupFiles: ['./tests/setup.ts'],
  },
});
