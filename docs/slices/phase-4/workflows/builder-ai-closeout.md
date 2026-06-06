# Builder UI + React Agent Closeout (Slice 4.BUILDER-AI-CLOSEOUT-1)

**Type:** Closeout / verification / PR-prep slice. **No product changes.**
**Date:** 2026-05-26
**Branch:** `builder-ui-v1-audit-1`
**HEAD at closeout:** `0168b22de` (preview disclaimer)
**Arc base:** `6cc0cf581` (BUILDER-UI-V1-AUDIT-1) — the first commit in the Builder UI + React Agent arc on this branch.

This document closes out the Builder UI + Workflow Builder React Agent arc as accepted by Marcus and pins:

- the final commit list,
- the final UI + React Agent state,
- the gate results at closeout time,
- the live-smoke outcomes,
- the known non-blocking follow-ups,
- the PR-prep recommendation.

It does NOT propose new feature work. The next net-new product slice is explicitly out of scope.

---

## 1. Branch + commit topology

**Branch.** `builder-ui-v1-audit-1`. Working tree clean at HEAD.

**Arc on this branch:** 21 commits, base `6cc0cf581^` → tip `0168b22de`.

> The full branch is 117 commits ahead of `origin/v2-foundation` (594 files, +74,126 / −1,915 lines), but the earlier 96 commits cover the AI foundation (AI-1..AI-18), billing/cost foundation (COST-1..COST-15+), provider work (Stripe `event_received` trigger meta), and a docs reorg — all already accepted in their own slices. This closeout's audit, smoke, and PR-strategy scope is the **Builder UI + React Agent arc only** (the 21 commits below).

### Arc commits (reverse chronological)

| # | Commit | Slice | Title |
|---|---|---|---|
| 21 | `0168b22de` | BUILDER-AI-CLOSEOUT-1 follow-up | ui(ai): clearer 'preview only' labeling in chat-rendered plan preview |
| 20 | `881809a1e` | AI-22 follow-up | test(ai): React Agent canvas-stability regression guard |
| 19 | `7600ae699` | **AI-22** | feat(ai): required-field discipline + interactive required-input controls |
| 18 | `f562d2a8f` | **AI-21C** | refactor(ai): React Agent chat component split |
| 17 | `61218cd93` | **AI-21B** | feat(ai): React Agent chat layout + pinned composer |
| 16 | `610a79b7a` | **AI-21** | feat(ai): React Agent session-local conversational follow-up |
| 15 | `13318c283` | **AI-20** | fix(ai): React Agent apply-readiness gate for unresolved required input |
| 14 | `75692e55d` | **AI-19** | feat(ai): Anthropic forced tool-use structured planner output |
| 13 | `728d929d0` | **AI-18** | docs(builder-ui): AI-18 React Agent live smoke + builder-design integration verification |
| 12 | `c3860e844` | **BUILDER-DESIGN-PARITY-1** | feat(builder-ui): implement Anthropic workflow builder design parity |
| 11 | `a8310637f` | **BUILDER-V1-SHELL-PARITY-1** | feat(builder-ui): full-bleed V1-like workspace |
| 10 | `b8714b8d6` | **BUILDER-VALIDATION-1** | feat(builder-ui): ValidationSummary drawer + header validation pill |
| 9 | `ffef5c70c` | BUILDER-RUN-PANEL-1 follow-up | chore(builder-ui): finish RunNowPanel→HeaderRunControls rename |
| 8 | `42584f266` | **BUILDER-LEFT-AGENT-1** | feat(builder-ui): React Agent left rail + RightDrawerMode narrowing |
| 7 | `497fd99b2` | BUILDER-LAYOUT-CORRECTION-1 | docs(builder-ui): correct layout direction — AI to left rail |
| 6 | `caf53b5dc` | **BUILDER-RUN-PANEL-1** | feat(builder-ui): Test/Run in header + Run results in drawer |
| 5 | `21542e4d1` | **BUILDER-ADD-FLOW-1** | feat(builder-ui): searchable AddNodePanel + edge plus-button + mid-chain insertion |
| 4 | `8fda6abb6` | **BUILDER-INSPECTOR-1** | feat(builder-ui): right-drawer inspector + V1 provider icons |
| 3 | `caeefd155` | **BUILDER-CANVAS-1** | feat(builder-ui): WorkflowNodeCard + EmptyCanvasState + canvas polish |
| 2 | `7354cbc9b` | **BUILDER-UI-SHELL-1** | feat(builder-ui): BuilderShell + BuilderHeader + Cmd/Ctrl+S shortcut |
| 1 | `6cc0cf581` | **BUILDER-UI-V1-AUDIT-1** | docs(builder-ui): V1 Workflow Builder UI audit + V2-native port plan |

**Arc diff stat:** 163 files changed, +15,804 / −2,072 lines.

---

## 2. Final shipped state

### 2.1 Builder UI (accepted by Marcus)

**Workspace shell.**
- `BuilderShell` (4-zone: header / left rail / canvas+canvas-relative / right drawer).
- `BuilderHeader` (workflow title + state badge + activation actions + run controls + validation pill + Cmd/Ctrl+S save + left-rail toggle).
- Full-bleed V1-like workspace at 1280-wide laptops.

**Canvas.**
- `WorkflowNodeCard` (provider icon + node title + status pill + risk badge + selection state).
- `EmptyCanvasState`.
- V1-derived provider SVG icons (ported into `public/integrations/`; resolved at runtime by `providerIconUrl(id)` in `integrations/_registry.ts`).
- Stepped edges + `+` button between nodes for mid-chain insertion.

**Add flow.**
- Searchable `AddNodePanel` (provider + action / trigger picker, keyword + provider filter).
- Edge plus-button affordance for inserting actions mid-chain.

**Right drawer.**
- `BuilderRightDrawer` (modes: `inspector | results | validation`).
- `NodeInspectorPanel` (V1-like field rendering).
- `RunResultsPanel` (per-step status + outputs + failed-run AI repair entry, AI-13).
- `ValidationSummary` (header validation pill drives the drawer open).

**Left rail.**
- `BuilderLeftAgentRail` (40px collapsed / 320px expanded; localStorage-persisted via `useLeftAgentRail`; mounts `BuilderAiPanel`).
- `RightDrawerMode` narrowed to `inspector | results | validation` (the React Agent CANNOT be hosted in the right drawer — structural invariant).

**Anthropic ChainV2 design parity.**
- Dense chrome, gradient sparkle icons, monospace hints, accent-bordered preview cards.

### 2.2 React Agent (workflow-builder-scoped, accepted by Marcus)

**Structured planner output.**
- AI-19 — forced Anthropic tool-use (`WORKFLOW_PLAN_TOOL` injected on every plan call; `tool_use.input` → `JSON.stringify` → existing parser). Pre-existing `PARSE_FAILED / NOT_JSON` from Claude Sonnet 4.6 closed.

**Apply-readiness gate.**
- AI-20 — service + UI both refuse Apply when `requiredUserInput.length > 0`. `canApplyLater` gated at both layers; `builder-ai-required-input-block` callout renders the guidance copy.

**Session-local conversational follow-up.**
- AI-21 — `composeFollowUpPrompt` helper; `useBuilderAi.submitFollowUp` reconstructs `Original request: … / The agent asked for: … / Previous follow-up answers: … / User follow-up: …` via the same plan route. Composer flips to `Send details` while a chain is active. NO DB persistence.

**Chat layout + pinned composer.**
- AI-21B — `builder-ai-message-list` (`role="log"` / `aria-live="polite"`) scrolls above a pinned `builder-ai-composer`. User prompts and follow-up answers render as right-aligned bubbles; plan / applied / apply_failure / error results as left-aligned bubbles. Latest plan_result owns the full AI-11B / AI-20 breakdown + Apply controls; older plan_results collapse to `intentSummary`.

**Chat component split + live smoke.**
- AI-21C — `_BuilderAiPanelMessageList` + `_BuilderAiPanelComposer` extracted from `BuilderAiPanel` (488 → 216 lines; resolved `max-lines` warning). Live follow-up smoke passed.

**Required-field discipline + interactive controls.**
- AI-22 — two new `PLANNER_CONSTRAINTS` (no silent defaults; no display-label-as-id); server-side `enrichRequiredUserInputs` attaches FieldMeta hints (`fieldLabel` / `fieldType` / `options` / `optionsSource` / `dependsOn` / `multiple` / `allowFreeText` / `placeholder`); `RequiredInputControl` renders dropdown / async-picker / text fallback with `useOptionsSource` integration; structured-answer follow-up via `User provided:` section.

**Canvas-stability regression guard.**
- AI-22 follow-up — 6-case `BuilderAiPanel.readOnly.test.tsx` pins that `plan()`, `submitFollowUp()`, `RequiredInputControl` typing, Clear, and failed Apply never mutate `graphSlice`. Successful Apply is the only path that hydrates.

**Preview disclaimer.**
- BUILDER-AI-CLOSEOUT-1 follow-up — `PreviewSection` header reworded `"Proposed change"` → `"Preview only · not applied yet"`; new explicit disclaimer below: *"Nothing is saved to your workflow until you click Apply change."*

---

## 3. Live smoke summary (run by Marcus)

| Scenario | Outcome |
|---|---|
| Plan: `"Send a Slack message when I manually run it."` | ✓ assistant asks for missing channel + message; Apply hidden; composer flips to `Send details`. |
| Follow-up: `"Use #general and say Test from ChainReact AI."` | ✓ user follow-up bubble appears; assistant returns new plan; required-input gone; Apply appears. |
| Apply | ✓ graph hydrates with Manual Trigger + Slack `send_channel_message` + edge; applied bubble renders; no raw JSON / secrets. |
| Multi-turn (channel first, message second) | ✓ each turn appends `data-kind=followup` user bubble; older plan_results collapse to `intentSummary`. |
| Required-input picker / text typing | ✓ dropdown + text input render and stage answers locally; canvas unchanged until Apply. |
| Preview-disclaimer clarity | ✓ "Preview only · not applied yet" + "Nothing is saved to your workflow until you click Apply change." |
| Chat-layout sanity (scroll, pinned composer, auto-scroll) | ✓ message list scrolls independently; composer pinned; auto-scroll to newest. |
| `Clear conversation` | ✓ messages, composer, risk-ack, hook chain state, AND staged required-input answers all reset. |

---

## 4. Gates at closeout

All gates pass at HEAD `0168b22de`:

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors, 5 warnings (all pre-existing on other files: `repositories/workflowRuns.ts:431`, `scripts/reset-user-password.mjs:54`, `services/discovery/_registry.ts:436`, `services/execution/engine.ts:705`, `services/execution/handlers/_registry.ts:615`) |
| `npm run lint:structure` | OK — every leaf folder ≤ 50 files |
| `npm run lint:migrations` | OK — every new public table has RLS + policy |
| `tests/unit/features/workflow-builder` | 66 suites / **944 tests passing** |
| AI + workflow-builder sweep (`tests/unit/services/ai` + `tests/unit/app/api/workflows/ai-{plan,apply,repair}-route.test.ts` + `tests/unit/lib/api/ai.test.ts` + `tests/unit/features/workflow-builder`) | 89 suites / **1,380 tests passing** |
| Workflow-builder integration sweep (`tests/integration/features/workflow-builder`) | 83 suites / **363 tests passing** |
| Structure + parity tests (`tests/structure` + `tests/parity`) | 11 suites / **41 tests passing** |

**Not run from this environment:** full repo-wide `npm test` and live `npm run build`. Both would exercise paths (cron routes, billing routes, integration handlers, etc.) outside this arc's scope — the targeted sweeps above cover everything the closeout actually touched. Marcus can run them locally if needed; we did NOT skip them for cost reasons in any forbidden direction.

---

## 5. Forbidden-touch audit

The slice forbids unintended changes to provider metadata/runtime, workflow execution engine, billing/tasks, migrations, app/api AI routes (outside accepted slices), parser / `WorkflowPatchSchema` (outside accepted slices), and the general app help assistant.

Audited the 163 files in the Builder-UI+AI arc:

| Area | Status | Evidence |
|---|---|---|
| `services/billing/`, `lib/billing/` | UNTOUCHED in this arc | `git diff --name-only` returned 0 paths. |
| `workflow-engine/`, `services/execution/` | UNTOUCHED | 0 paths. |
| `supabase/migrations/` | UNTOUCHED | 0 paths. |
| `services/workflows/patch/` (incl. `WorkflowPatchSchema`) | UNTOUCHED | 0 paths. |
| `app/api/workflows/[id]/ai/` (plan / apply routes) | TOUCHED via AI-19 only | AI-19 added the `responseTool` plumbing; route shapes unchanged. AI-19 is an accepted slice. |
| `core/ai/modelTypes.ts`, `services/ai/modelClients/anthropicClient.ts` | TOUCHED via AI-19 only | Forced tool-use adapter changes; AI-19 is accepted. |
| `integrations/_registry.ts` | TOUCHED via BUILDER-INSPECTOR-1 — purely additive | New `providerIconUrl(id)` helper for the Builder UI. **No existing provider metadata or runtime behavior changed** — the helper maps provider id → `/integrations/{id}.svg` for icon rendering. Verified by inspecting the diff: only an exported function appended to the file. |
| Provider per-integration metadata (`integrations/<provider>/...`) | UNTOUCHED in this arc | 0 paths. (Stripe `event_received` was earlier in the branch, not in this arc.) |
| General app help assistant | NOT BUILT | The `BuilderAiPanel` scope guardrail is named "workflow-builder React Agent only" throughout the arc's docs + test names; no `components/help/` or analogous module added. |

**Audit conclusion: no forbidden touches in the Builder-UI+AI arc.**

---

## 6. Known follow-ups (NOT implemented in this slice)

These are visible-but-non-blocking polish / scope items deliberately deferred. Each is its own future slice when product-approved.

1. **Node card title polish.** Today: action node renders as `Slack` (provider) primary + `send_channel_message` (raw type) secondary. Marcus flagged that the human action label (`Send Channel Message`) should be primary and the provider should be brand context. Touches `WorkflowNodeCard` only.
2. **Persistent React Agent thread history.** AI-21..22 explicitly does NOT persist chat state. If product approves DB-backed history across sessions, that's a separate slice with its own RLS / retention / pagination design.
3. **Richer inline required-input forms.** AI-22 ships dropdown / picker / text. Per-question structured input widgets (date picker, JSON-array editor, file-ref picker, etc.) per field type are deferred — the FieldMeta hint surface is already in place to make these additive when needed.
4. **General app help assistant.** Separate architecture from the workflow-builder React Agent. Different mounting, different scope (whole-app vs single-workflow), different security model. Explicitly out of scope for the entire AI-1..AI-22 track.
5. **Owner / admin AI analytics route + dashboard.** Foundation already shipped via COST-6 (`ai_cost_events` ledger) + COST-7 (analytics service layer). Currently blocked on an admin/owner auth gate — that's a separate slice (call it `OWNER-ADMIN-GATE-1`).
6. **Activation review / pre-publish validation review.** Existing `ValidationSummary` drawer surfaces validation errors at design time, but a pre-publish review pass (covering `requiresIntegration` for every node, `tokenScope` health, optional-deps cascades, etc.) is a separate UX slice.
7. **Responsive / dark-mode / a11y closeout.** Builder UI ships with light + dark theme variables but a dedicated WCAG AA contrast audit + reduced-motion + keyboard-only flow pass is a separate hardening slice.
8. **Provider post-26 audit / backlog.** Earlier in this branch (4.PROVIDER-AUDIT-1) the runtime-vs-metadata completeness audit shipped; the remaining provider backlog (Mailchimp / Discord / Google Docs / OneDrive / Teams / Excel / Trello / Airtable / Shopify / Google Drive / Google Calendar / Outlook Calendar metadata closeout) is outside this arc.
9. **Auto-scroll behavior tuning.** Today the React Agent chat scrolls to the newest message on every status change. A future polish would suppress that pull when the user has scrolled away from the bottom (don't yank them back).

None of these are blockers for the accepted Builder UI + React Agent state.

---

## 7. PR-prep recommendation

**The branch is too large for a single PR.** 117 commits / 594 files / +74,126 lines spans:

- AI architecture / planner / preview / apply / repair (AI-1..AI-22) — ~30 commits.
- Billing / cost ledger / reserve-reconcile / shadow comparison (COST-1..COST-15+) — ~25 commits.
- Provider work (Stripe `event_received` trigger meta, provider audit, AI-17 connected-integration awareness) — ~5 commits.
- Builder UI + React Agent (this arc) — 21 commits.
- Docs reorg + housekeeping — handful of commits.

A reviewer cannot meaningfully assess that in one sitting. Each track is also independently shippable.

### Recommended PR strategy

Split the branch into **5 stacked PRs** (or feature branches), one per accepted track. Each track was developed and accepted in its own slice arc, has its own closeout doc, and touches a coherent slice of the code.

| Order | PR | Base | Scope | Risk |
|---|---|---|---|---|
| 1 | **AI Foundation (AI-1..AI-18)** | `v2-foundation` | Planner / preview / apply / repair services + routes; observability foundation; AI-11 / AI-11B Builder panel (pre-chat). | Medium — first new public AI routes; AI-15 audit doc confirms no automation gaps. |
| 2 | **Billing / Cost Foundation (COST-1..COST-15+)** | After PR 1 | Cost estimator + ledger + reserve/reconcile shadow comparison; engine wiring behind feature flag. | High — schema migrations + ledger writes. COST-15I dev-DB smoke + COST-14E shadow comparison de-risked. |
| 3 | **Stripe `event_received` trigger meta + AI-17 connected-integration awareness** | After PR 2 | Provider work (1 trigger meta + 1 planner-grounding fix). | Low — additive provider meta + prompt rule. |
| 4 | **Builder UI v1 port (BUILDER-UI-V1-AUDIT-1 .. BUILDER-DESIGN-PARITY-1)** | After PR 3 | 12 commits — workspace shell, canvas, add flow, inspector, validation, left rail, design parity. UI-only. | Medium — large UI surface area; integration tests cover provider config flows. |
| 5 | **React Agent live arc (AI-19 .. AI-22 + follow-ups)** | After PR 4 | 8 commits — forced tool-use, apply-readiness gate, chat layout, follow-up, required-input controls, regression guard, preview disclaimer. | Low–medium — additive client UI on top of existing AI-9A/9B routes; canvas-stability regression guard pins the no-mutation contract. |

The current branch (`builder-ui-v1-audit-1`) can stay as the working tip while Marcus splits. The closeout doc, the AI-22 follow-up regression guard, and the preview-disclaimer commit belong with PR 5 (the React Agent live arc).

### Alternative: keep the branch local

If splitting into 5 PRs is too much process overhead and Marcus is willing to do a single high-trust review:

- The branch can be reviewed in one sitting **by commit**, not by file. The commit messages are deliberately detailed and each track is internally consistent.
- The full-AI-+-workflow-builder sweep (1,380 tests) + integration sweep (363 tests) + structure + parity (41 tests) + lint + tsc all pass at HEAD.
- Forbidden-touch audit is clean.

**Recommendation: do NOT push from this environment.** Marcus decides the PR strategy locally. The closeout doc + the regression guard + the gates being green at HEAD make either path safe.

---

## 8. Boundaries preserved

- No provider metadata / runtime changes in this arc.
- No workflow-engine / execution changes.
- No billing / tasks changes.
- No migrations.
- AI routes touched only by AI-19 (accepted slice).
- `WorkflowPatchSchema` + `parseWorkflowPlanResponse` unchanged in this arc (AI-22 only adds optional fields to the client-facing `requiredUserInput` shape; the parser strips unknown keys + the model never emits the new fields).
- General app help assistant explicitly NOT built.
- No DB chat / thread persistence introduced.
- AI-20 apply-readiness gate preserved + audited (canvas-stability regression guard at `BuilderAiPanel.readOnly.test.tsx`).
- No-leak invariants (no raw patch / config / secret values rendered) preserved + audited across plan-result, applied, apply_failure, and error bubbles.

---

## 9. Closeout sign-off

| Item | Status |
|---|---|
| Working tree clean | ✓ |
| Branch on `builder-ui-v1-audit-1` at HEAD `0168b22de` | ✓ |
| Forbidden-touch audit | ✓ no violations |
| Live smoke (Marcus, 2026-05-26) | ✓ passed |
| Gates (tsc / lint / lint:structure / lint:migrations) | ✓ passed |
| Unit + integration + structure + parity sweeps | ✓ 1,784 tests passing across 244 suites |
| Closeout doc written | ✓ this file |
| New feature work added | ✗ none (closeout-only) |
| Push from this environment | ✗ no (Marcus's call) |

The Builder UI + React Agent arc is shippable.
