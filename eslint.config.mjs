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
      // `checksVoidReturn.arguments: false`: Express 4's own types model
      // a route handler as returning `void`, but with `express-async-
      // errors` imported once in app.ts, an async handler returning
      // `Promise<void>` is not just safe but the whole point — its
      // rejection is forwarded to the error middleware automatically.
      // Every controller/middleware in this API is written this way.
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false } },
      ],
      "import/no-duplicates": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Test files across every package, plus their shared non-`.test.ts`
    // helpers (`**/test/**` — e.g. apps/api/src/test/httpHelpers.ts):
    // supertest's `Response.body` (and similar ad hoc test doubles/mocks)
    // are typed `any` by the library itself — every `res.body.data.foo`
    // access in an HTTP integration test or its shared helper trips the
    // type-aware "unsafe" rules without adding real safety, since the
    // assertions right below each access already check the runtime
    // shape. Full type-checked strictness stays on for every other file.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      // `expect(mock.someMethod).toHaveBeenCalledWith(...)` is the
      // standard vitest/jest assertion pattern for a spied-on object
      // method — this rule reads that property access as an "unbound
      // method" that could lose its `this` binding if called directly,
      // which is never what's actually happening here.
      "@typescript-eslint/unbound-method": "off",
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
