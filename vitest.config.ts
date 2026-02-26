import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      "test/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    testTimeout: 100000,
    // Isolate each test file in its own worker to prevent
    // lasso native crash from affecting other tests
    isolate: true,
    // Ignore unhandled errors from native bindings (lasso) crash during cleanup
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
