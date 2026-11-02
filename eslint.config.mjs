import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // AGENTS.md の「any と as によるキャスト逃げを使わない」を機械で守る。
  // no-explicit-any は Next の既定にもあるが、既定が変わっても緩まないようここで持つ。
  // as const は型を狭めるだけなので、この規則でも通る。
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    ".test-runtime/**",
    // ウィジェットのまとめた出力（元は src/widget/*.ts）
    "src/widget/dist/**",
    // スライドの配布用検査（元は scripts/build/deck-design-check.ts）
    "bin/deck-design-check.mjs",
    // 外から取ってきてそのまま置いてある 2 本（1 バイトも直さない）
    "vendor/**",
  ]),
]);

export default eslintConfig;
