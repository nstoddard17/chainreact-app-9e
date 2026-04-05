import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "public/**",
      "scripts/**/*.js",
      "scripts/**/*.cjs",
      "scripts/**/*.mjs",
    ],
  },
  {
    rules: {
      "no-console": "off",
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
      "jsx-a11y/alt-text": "off",
      "import/no-anonymous-default-export": "off",
      // Hooks rules OFF globally — enforced per-path below
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  // Scoped hooks enforcement for high-risk hook-bearing files
  {
    files: [
      "hooks/**/*.ts",
      "hooks/**/*.tsx",
      "components/workflows/WorkspaceSelectionModal.tsx",
      "components/workflows/WorkflowsPageContent.tsx",
    ],
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];

export default eslintConfig;
