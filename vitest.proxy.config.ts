import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for proxy tests.
 * These tests use lasso.js native bindings which can crash workers.
 * They run in a single fork to isolate native crashes.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/proxy/**/*.test.ts"],
    testTimeout: 100000,
    // Run in a single fork to isolate lasso.js native crashes
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Ignore unhandled errors from native bindings cleanup
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
