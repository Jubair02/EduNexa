import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The correctness rules (rules-of-hooks, exhaustive-deps) stay on as
      // errors. These two are React Compiler readiness advisories rather than
      // bug detectors, and they fire on patterns this app uses deliberately:
      //   set-state-in-effect — fetch-on-mount with a `loading` flag, the shape
      //     every screen uses since there is no data-fetching library here.
      //   immutability — a render-local accumulator while laying out SVG arcs.
      // Revisit both if the React Compiler is ever enabled for this project.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
