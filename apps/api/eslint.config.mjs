// @ts-check
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  // Generated or build output — never lint these.
  { ignores: ["dist/**", "node_modules/**", "src/generated/**"] },

  eslint.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      // Underscore-prefixed params (e.g. `_request`) are the project's
      // convention for "required by the signature, intentionally unused".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
