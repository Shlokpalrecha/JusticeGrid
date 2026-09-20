// Root ESLint flat config for the JusticeGrid monorepo.
// Every package extends this. packages/rules-engine gets extra restrictions
// (see below) that ban non-deterministic globals — it must produce
// byte-identical output for identical input, always.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "apps/api/prisma/migrations/**",
      "docs/diagrams/**",
      // Plain JS config file (PostCSS plugin list) — no type-aware linting
      // needed, and pulling it into a typed tsconfig project isn't worth it.
      "apps/web/postcss.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Typed linting resolves each file against its package's
        // tsconfig.json. Package-root tooling config files (vitest.config.ts,
        // tailwind.config.ts, ...) are deliberately added to each package's
        // tsconfig "include" so they're covered by that project rather than
        // relying on an unbounded default-project fallback here.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "import/no-duplicates": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // ⭐ packages/rules-engine determinism guardrail (spec §6.2).
    // The engine must never read wall-clock time or randomness directly —
    // `now` is always injected. This is enforced here AND by a source-scan
    // unit test in the package itself (belt and suspenders).
    files: ["packages/rules-engine/src/**/*.ts"],
    ignores: ["packages/rules-engine/src/**/__tests__/**"],
    rules: {
      // Only the zero-arg `new Date()` and `Date.now()` read wall-clock
      // time — both banned. `new Date(x)` WITH an argument (e.g. shifting
      // an injected `now` by a fixed offset for Asia/Kolkata maths) is
      // legitimate date arithmetic and must stay legal, so this is
      // `no-restricted-syntax` only — a blanket `no-restricted-globals`
      // on the `Date` identifier would also flag that legitimate form.
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "new Date() with no argument is banned in the rules engine — inject `now` instead.",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Date.now() is banned in the rules engine — inject `now` instead.",
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: "Math.random() is banned in the rules engine — it must be fully deterministic.",
        },
      ],
    },
  },
  eslintConfigPrettier,
);
