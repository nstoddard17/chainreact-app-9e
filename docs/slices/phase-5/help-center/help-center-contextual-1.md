# Help Center — Contextual Links (HELP-CENTER-CONTEXTUAL-1)

**Status:** Implemented locally (not pushed). Builds on HELP-CENTER-1 (`9bf381ca7`).

## What shipped

Restrained, secondary Help Center links at the product's existing confusion
points. Every link is produced by ONE central resolver — components never
hardcode `/help/<slug>` strings — and every destination is an existing
article from the HELP-CENTER-1 catalog. No new articles were needed.

## The contract

`features/marketing/help/contextualHelp.ts` → `resolveHelpLink(ctx)`:

```ts
type HelpContext =
  | { type: "provider_setup"; providerId: string }   // provider connect guide
  | { type: "connection_problem" }                   // reconnect-needed states
  | { type: "run_error"; action?: string | null }    // persisted HumanizedError.action enum
  | { type: "billing"; reason: "task_usage" | "ai_credits" | "plan_change" }
  | { type: "onboarding"; step: "create" | "connect" | "configure" | "test" | "activate" }
  | { type: "builder_concept"; concept: "setup_issues" | "step_data" };

resolveHelpLink(ctx) → { slug, href: `/help/${slug}`, label } | null
```

- Pure + client-safe (consults only the typed catalog — no registry,
  services, or repositories, so client components may import it freely).
- Every slug is verified against the catalog at resolve time; catalog drift
  returns `null`, never a broken URL.
- Keys are STABLE classifications (provider ids, the persisted
  `HumanizedError.action` enum, onboarding step keys). Arbitrary error text
  is never parsed.
- `null` ⇒ the component renders no help control at all.

**How future components request a destination:** import `resolveHelpLink`,
describe the context, render the returned link (or nothing). Add new
contexts/mappings in `contextualHelp.ts` only — never inline slugs.

## Surfaces wired

| Surface | Context | Destination | Placement |
|---|---|---|---|
| Apps card, reconnect-needed row (both variants) | `connection_problem` | `fix-a-disconnected-app` ("How to reconnect") | Under the existing amber copy (`ReconnectNeededCopy`); per-row Reconnect stays primary |
| Apps card, not-connected provider with a dedicated article | `provider_setup` | `connect-<provider>` ("View setup guide") | Text link beside the primary Connect button; no link for providers without an article |
| Runs page failed-run block (`RunRow`) | `run_error` | see mapping below ("Read troubleshooting guide") | Secondary link beside the unchanged primary CTA |
| Builder run-results drawer (`RunResultsPanel`) + Runs-tab detail (`RunDetail`) | `run_error` | same mapping | Beside the existing CTA / in the actions row |
| Billing task-usage + AI-credits rows | `billing` | `understand-task-usage` / `understand-ai-credits` | ONLY in near-limit/over-limit states; normal rows stay clean |
| Billing cancel-subscription row | `billing: plan_change` | `change-or-cancel-your-subscription` | Under the cancel panel |
| Onboarding checklist expanded steps | `onboarding` | the five quick-start articles ("Learn how") | Beside the primary CTA; completion + analytics untouched (help clicks fire no onboarding event) |
| Builder validation drawer (issues state) | `builder_concept: setup_issues` | `fix-workflow-setup-issues` | Single footer link; ready state renders nothing |
| Variable-picker popover footer | `builder_concept: step_data` | `use-data-from-an-earlier-step` | Visible only while the picker is open |

## Run-error mapping (keyed on the persisted action enum)

- `reconnect` → `fix-a-disconnected-app`
- `open_node` → `fix-workflow-setup-issues`
- `upgrade_plan` → `understand-task-usage` (covers task/AI/plan-feature failures;
  the persisted classification carries no engine code, so per-code refinement —
  e.g. AI-credit failures → `understand-ai-credits` — is deferred until the
  code is persisted)
- `retry_later` / `contact_support` / unknown / legacy / absent →
  `troubleshoot-a-failed-run` (general fallback)
- `review_pending` → **null, deliberate** ("a connected app changed" requires
  no user action; a troubleshooting link would invite one)
- `link_vehicles` → **null, deferred** (no vehicle-links article exists yet)

## Deliberate gaps / deferred

- No vehicle-links article (see above).
- Provider articles exist only for the curated six; other providers render no
  setup-guide link (fallback is deliberately absent for `provider_setup`).
- Builder surfaces skipped by design after audit: `HeaderRunControls` (dense
  48px strip, no link idiom) and the deterministic "Check workflow" text card
  (plain-text output, markup-guarded).
- All contextual links open in the SAME tab, matching the established
  builder→`/apps` link convention. A "new tab from inside the builder to
  protect unsaved edits" policy would be a product decision — flagged, not
  taken unilaterally.
- Task-limit BLOCKING states elsewhere (e.g. activation gates) reuse the
  failed-run `upgrade_plan` path already; no separate surfaces were found
  that warranted links this batch.

## Follow-up: session-aware header + card polish (same batch, Marcus QA)

- `/help` and `/help/[slug]` now resolve the viewer session server-side
  (read-only, fail-safe to signed-out, never a gate/redirect — pinned by
  tests): a signed-in user sees a single "Open ChainReact" → `/workflows`
  header CTA instead of Sign in / Try it free. `MarketingHeader` gained an
  optional `authenticated` prop (default false ⇒ every other marketing page
  is byte-identical). The zero-arg SSR `getUser()` lives inside the
  `page.tsx` shells per the PR-AUTH-7 lint carve-out.
- "Help with the apps you use" cards now stretch to equal height per grid
  row (short descriptions no longer render ragged cards).

## Structural fix folded in

HELP-CENTER-1's outcome doc had pushed `docs/slices/phase-5/` to 51 files
(over the 50-file leaf cap; the gate had been run before the doc was
written). Help Center docs now live in `docs/slices/phase-5/help-center/`.

## Tests

- `tests/unit/features/marketing/help/contextualHelp.test.ts` — full mapping,
  deliberate nulls, unknown-context nulls, URL well-formedness against the
  catalog.
- Surface suites: `AppCardHelpLinks`, `RunRowHelpLink` (+ updated
  `RunRow.test.tsx` link-count pins), `BillingSectionHelpLinks`,
  `OnboardingHelpLinks`, `ValidationSummaryHelpLink`,
  `VariablePickerHelpLink` — each pins presence in the problem state, absence
  in the healthy state, unchanged primary actions, and no leaked error detail
  in hrefs/labels.
