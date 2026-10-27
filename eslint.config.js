import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [
    "dist", "coverage", "playwright-report", "test-results",
    // Preserved diagnostic snapshots are evidence, not maintained application scripts.
    "docs/reviews/2026-10-27-c9-p2-cornice-authoring/**/*.mjs",
    "docs/reviews/2026-10-27-t4-shadow-discriminator/**/*.mjs",
    "docs/reviews/2026-10-27-t5-cornice-shadow-parts/**/*.mjs",
    "docs/reviews/2026-10-27-t6-shadow-bias-sweep/**/*.mjs",
    "docs/reviews/2026-10-27-t7-shadow-frustum-study/**/*.mjs"
  ] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["*.config.{js,ts}", "scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ["docs/reviews/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  },
  {
    files: ["server/**/*.ts"],
    languageOptions: {
      globals: globals.node
    },
    rules: {
      "react-refresh/only-export-components": "off"
    }
  }
);
