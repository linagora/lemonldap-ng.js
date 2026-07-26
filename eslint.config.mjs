import { defineConfig } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import js from "@eslint/js";

export default defineConfig([
  {
    extends: [
      js.configs.recommended,
      typescriptEslint.configs["flat/eslint-recommended"],
    ],

    plugins: {
      "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // Vitest globals (vitest.config.ts sets globals: true)
        suite: "readonly",
        test: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        assert: "readonly",
        vi: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        onTestFinished: "readonly",
        onTestFailed: "readonly",
        Atomics: "readonly",
        SharedArrayBuffer: "readonly",
      },

      parser: tsParser,
      ecmaVersion: 13,
      sourceType: "module",
    },

    rules: {
      // Disable base rule in favor of TypeScript version
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
