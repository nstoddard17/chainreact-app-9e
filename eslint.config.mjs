import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

const REPO_PATTERNS = [
  "@/repositories",
  "@/repositories/**",
  "**/repositories",
  "**/repositories/**",
];
const SERVICE_PATTERNS = [
  "@/services",
  "@/services/**",
  "**/services",
  "**/services/**",
];
const SUPABASE_PATTERNS = ["@supabase/supabase-js", "@supabase/ssr"];

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "**/dist/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
      // scripts/trash/ is the repo's disposable, never-shipped one-off zone
      // (migration sweeps, provider probes). Linting it gates CI on throwaway
      // scripts (restricted-import / unused-var noise) for no value. Real
      // production scripts live in scripts/ root and stay linted. A physical
      // purge of scripts/trash is a separate cleanup; ignoring keeps lint green
      // without touching another session's in-progress untracked probes.
      "scripts/trash/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // The base no-redeclare rule fires on the common Zod pattern of declaring
      // a value and an inferred type with the same name. typescript-eslint's
      // version understands TS declaration merging.
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "error",
      "max-lines": [
        "warn",
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // BOUNDARY: components/ may not call fetch() directly.
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'CallExpression[callee.name="fetch"]',
          message:
            "Components must not call fetch() directly. Use a feature hook → lib/api/<domain>.ts. (project-structure-and-module-boundaries.md §4)",
        },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // BOUNDARY: stores/ no console.log.
  {
    files: ["stores/**/*.{ts,tsx}"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // BOUNDARY: features/ hooks: no console.log.
  {
    files: ["features/**/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // BOUNDARY: client code may not import server-only modules.
  // Repositories AND services are server-side only. Client uses lib/api/.
  {
    files: [
      "features/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "stores/**/*.{ts,tsx}",
      "lib/api/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: REPO_PATTERNS,
              message:
                "Repositories are server-side only. Client code calls lib/api/<domain>.ts. (workflow-state-store.md, project-structure-and-module-boundaries.md §4)",
            },
            {
              group: SERVICE_PATTERNS,
              message:
                "Server services are not importable from client code. Use lib/api/<domain>.ts. (project-structure-and-module-boundaries.md §4)",
            },
          ],
        },
      ],
    },
  },

  // BOUNDARY: direct Supabase imports outside repositories/, core/auth/, tests/.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "repositories/**",
      "core/auth/**",
      "tests/**",
      "utils/supabase/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: SUPABASE_PATTERNS,
              message:
                "Direct Supabase imports allowed only in repositories/, core/auth/, and tests/. (project-structure-and-module-boundaries.md §10)",
            },
          ],
        },
      ],
    },
  },

  // BOUNDARY: zero-arg supabase.auth.getSession() / getUser() — PR-AUTH-7 invariant.
  // The rule targets CLIENT code; server-side SSR contexts (app/**/page.tsx,
  // app/**/layout.tsx, app/api/**, app/auth/**, middleware) read the user via
  // the canonical Supabase SSR pattern with no argument.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "core/auth/**",
      "stores/auth*.ts",
      "stores/authBootMachine.ts",
      "app/**/page.tsx",
      "app/**/layout.tsx",
      "app/auth/**",
      "features/auth/**",
      "app/api/**",
      "middleware.ts",
      "utils/supabase/**",
      "tests/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(getSession|getUser)$/][arguments.length=0]",
          message:
            "Zero-arg auth.getSession()/getUser() forbidden in client code. Use core/auth/getAuthHeader(). (PR-AUTH-7 invariant)",
        },
      ],
    },
  },

  // BOUNDARY: core/ purity — no app/features/components/repositories/services/stores.
  {
    files: ["core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/app",
                "@/app/**",
                "@/features",
                "@/features/**",
                "@/components",
                "@/components/**",
                "@/repositories",
                "@/repositories/**",
                "@/services",
                "@/services/**",
                "@/stores",
                "@/stores/**",
              ],
              message:
                "core/ may import only from contracts/. (project-structure-and-module-boundaries.md §4)",
            },
          ],
        },
      ],
    },
  },

  // BOUNDARY: repositories/ may not import services/ or business logic.
  {
    files: ["repositories/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: SERVICE_PATTERNS,
              message:
                "Repositories must not import services. (project-structure-and-module-boundaries.md §4)",
            },
          ],
        },
      ],
    },
  },

  // Test files: Jest globals + relax max-lines and `any`.
  // Slice 4.BUILDER-V1-SHELL-PARITY-1 — `jest.setup.ts` lives at the
  // repo root (not under `tests/`) but uses jest globals for the
  // global `next/navigation` default mock; include it explicitly.
  {
    files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "jest.setup.ts"],
    languageOptions: {
      globals: { ...globals.jest, ...globals.node },
    },
    rules: {
      "max-lines": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // AI-28 follow-up — per-file max-lines exceptions.
  //
  // Hand-maintained data inventories: one entry per registered
  // action / trigger / handler. These files exist specifically so the rest
  // of the registry can stay small; splitting them further by alphabetical
  // halves hurts review (the reviewer reads a single PR diff to see exactly
  // which providers a slice covers — that's the whole point of explicit
  // hand-maintained registration). Capped at 800 LOC to leave headroom for
  // future providers without auto-allowing unbounded growth.
  {
    files: [
      "services/discovery/_metaInventory.ts",
      "services/execution/handlers/_handlerInventory.ts",
    ],
    rules: {
      "max-lines": [
        "warn",
        { max: 800, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // services/execution/engine.ts — the canonical execution engine.
  // After AI-28 extracted types (engineTypes.ts), persistence helpers
  // (runPersistence.ts), and traversal helpers (executionOrder.ts), the
  // remaining body is the WorkflowEngine class itself — a single
  // ~500-LOC orchestrator method. Splitting that method into named phases
  // is a real refactor that belongs in the v2-canonical-execution-engine
  // consolidation plan (see CLAUDE.md → "v2 canonical execution engine
  // plan"); doing it as part of a lint sweep risks subtle regressions in
  // billing reservation / test-mode gating / failure classification.
  // Capped (with headroom) to make further drift visible. Raised 550→580 for
  // the Slice 6 durable-queue claim-or-create block (claimQueuedWorkflowRun
  // before the create-at-start fallback); the phase split remains future work.
  {
    files: ["services/execution/engine.ts"],
    rules: {
      "max-lines": [
        "warn",
        { max: 580, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // features/analytics/connectedAppSources.ts — hand-maintained connected-app
  // analytics descriptor inventory: one literal block per provider (provider key,
  // credential visibility, connect-CTA copy, per-widget-type metric options). Same
  // rationale as the registry inventories above — keeping every provider's analytics
  // descriptor in one reviewable list is the point; splitting it by alphabetical
  // halves hurts review. Most recent providers (Excel / Facebook / Workspace /
  // Google Analytics) live in sibling descriptor files, so each costs only ~2
  // registration lines (import + ALL entry) here. Capped at 620 to leave headroom
  // for those registration lines without allowing unbounded growth (Google
  // Analytics is the final connected-app provider — 25/25).
  {
    files: ["features/analytics/connectedAppSources.ts"],
    rules: {
      "max-lines": [
        "warn",
        { max: 620, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // features/workflow-builder/WorkflowBuilder.tsx — the central builder orchestrator (canvas/rail/drawer
  // composition + the add-node and right-drawer state machines). The AI-preview lifecycle + checkpoint
  // orchestration + "Review changes" config diff were extracted into the useBuilderPreview hook, which
  // dropped this file from 585 → 452 counted lines. Capped at 460 (snug, modest headroom) to keep
  // further drift visible; still over the 400 default because of the canvas/rail/drawer wiring. Next
  // extraction candidates if it grows again: the right-drawer and add-node state machines.
  {
    files: ["features/workflow-builder/WorkflowBuilder.tsx"],
    rules: {
      "max-lines": [
        "warn",
        { max: 460, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // features/workflows/WorkflowGuidancePanel.tsx — the advisory "Build with me" rail. Already at the
  // default cap after the conversational chat mode + auto-show + dedup + Check-workflow review wiring;
  // HERMES-AGENT-WORKFLOW-EDITOR added the currentDraft send + proposedDefinition carry-through. Splitting
  // the conversational panel out of the dual-mode container is the real long-term fix. Capped at 420.
  {
    files: ["features/workflows/WorkflowGuidancePanel.tsx"],
    rules: {
      "max-lines": [
        "warn",
        { max: 420, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // core/workflows/officialTemplateMatcher.ts — the pure, deterministic official-template matcher +
  // strong/weak/no-match classifier (REACT-AGENT-TEMPLATE-MATCH). It is intentionally ONE cohesive,
  // side-effect-free module: the provider/alias/stopword tables, the request analyzer, the scorer, and
  // the strong-match structural gate all share the same private primitives (splitting them would force
  // exporting those internals and break encapsulation). The semantic action-effect layer WAS extracted
  // to `actionEffect.ts`; what remains here is the structural gate plus the single-/multi-provider
  // specificity checks (MATCH-4 + the multi-provider action-contribution hardening). Capped at 520
  // (snug headroom) to keep further drift visible.
  {
    files: ["core/workflows/officialTemplateMatcher.ts"],
    rules: {
      "max-lines": [
        "warn",
        { max: 520, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // features/workflow-builder/state/graphSlice.ts — the single source of truth for the builder's
  // nodes/edges/dirty/save state. It was already over the default cap (a long-standing, accepted
  // pre-existing warning); BUILDER-TOPBAR-UNDO-REDO added the intrinsic draft-edit history (the
  // history-capturing `set` wrapper + undo/redo, which must live ON the store's mutation surface to
  // stay correct). Splitting the store is a real refactor (every action shares `set`/`get` + the
  // hydrate/save reconciliation), not a top-bar cleanup commit. Capped at 650 to make further drift
  // visible. Mirrors the engine.ts / WorkflowBuilder.tsx precedent above.
  {
    files: ["features/workflow-builder/state/graphSlice.ts"],
    rules: {
      "max-lines": [
        "warn",
        { max: 650, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // features/workflow-builder/config-modal/fields/ComboboxField.tsx — the searchable single-select
  // renderer. Already over the default cap as a long-standing, accepted pre-existing warning (its
  // async-status-list switch covers every options-source UX arm: loading/ready/empty/error/
  // disconnected/needs-reconnect/owner-gated, plus the static-options path). CS-2 added the opt-in
  // `allowManualEntry` "name-or-ID" affordance. Splitting the async body / status list into its own
  // file is a real refactor, not a field-UX commit. Capped at 460 to make further drift visible;
  // mirrors the WorkflowBuilder.tsx / graphSlice.ts precedent above.
  {
    files: ["features/workflow-builder/config-modal/fields/ComboboxField.tsx"],
    rules: {
      "max-lines": [
        // Bumped 460 → 480 for the SWEEP-2 Scope A variable-insertion affordance
        // (shared VariablePickerButton wiring). Splitting the async body out is
        // the real long-term fix; capped to keep further drift visible.
        "warn",
        { max: 480, skipBlankLines: true, skipComments: true },
      ],
    },
  },
];
