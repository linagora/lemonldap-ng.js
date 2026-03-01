import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for proxy tests.
 * These tests use lasso.js native bindings for SAML support.
 *
 * Known issue: There's a GC-related crash in lasso.js when vitest cleans up
 * between test files. The crash occurs due to Napi::Error being thrown from
 * a destructor during V8 shutdown.
 *
 * Fixes applied in lasso.js v0.2.2+:
 * - SuppressDestruct() on server_ref_ in Login/Logout constructors
 * - IsLassoInitialized() checks in all destructors
 * - Environment cleanup hook to shutdown lasso before V8 terminates
 *
 * Current workaround:
 * - proxy-oidc-saml.test.ts is excluded because it times out when other
 *   tests trigger the GC crash. Can be run separately with:
 *   npx vitest run test/proxy/proxy-oidc-saml.test.ts
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/proxy/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      // Excluded: times out when GC crash affects vitest worker pool
      // Run separately: npx vitest run test/proxy/proxy-oidc-saml.test.ts
      "test/proxy/proxy-oidc-saml.test.ts",
    ],
    testTimeout: 100000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
      },
    },
    // Ignore unhandled errors from native bindings cleanup
    dangerouslyIgnoreUnhandledErrors: true,
    sequence: {
      shuffle: false,
    },
  },
});
