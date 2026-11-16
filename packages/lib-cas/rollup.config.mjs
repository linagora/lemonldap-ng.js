import typescript from "@rollup/plugin-typescript";
import dmts from "../../rollup-dmts.mjs";

export default {
  input: "src/index.ts",
  output: [
    {
      file: "lib/index.cjs",
      format: "cjs",
      sourcemap: true,
    },
    {
      file: "lib/index.mjs",
      format: "es",
      sourcemap: true,
    },
  ],
  plugins: [
    typescript({
      exclude: ["**/__tests__", "**/*.test.ts"],
      tsconfig: "./tsconfig.json",
      declaration: true,
      declarationDir: "./lib",
    }),
    dmts({ dir: "lib" }),
  ],
  external: [],
};
