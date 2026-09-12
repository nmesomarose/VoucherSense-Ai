import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The React Compiler lint preview flags fire-and-forget data fetching in
      // effects (polling) as errors. These screens intentionally poll while a
      // job is in flight; the patterns are idiomatic for this MVP.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
    },
  },
  globalIgnores([".next/**", "node_modules/**", "generated/**", "storage/**"]),
]);