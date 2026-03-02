import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for interop tests.
 * These tests require Docker containers and are run in the interop-tests CI job.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/interop/**/*.test.ts"],
    testTimeout: 100000,
  },
});
