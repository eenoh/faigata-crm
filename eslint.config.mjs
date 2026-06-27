import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "./node_modules/eslint-config-next/node_modules/eslint-plugin-react-hooks/index.js";

export default defineConfig([
  globalIgnores([
    ".next/**",
    "build/**",
    "coverage/**",
    "node_modules/**",
    "out/**",
    "tmp/**",
    "next-env.d.ts",
    "testfile.tmp",
  ]),
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        afterEach: "readonly",
        beforeEach: "readonly",
        describe: "readonly",
        expect: "readonly",
        it: "readonly",
        vi: "readonly",
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@next/next/no-assign-module-variable": "off",
    },
  },
]);
