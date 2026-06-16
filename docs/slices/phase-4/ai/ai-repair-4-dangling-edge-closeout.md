# 4.AI-REPAIR-4 — Dangling-edge cleanup repair — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this slice.
**Date:** 2026-06-16
**Branch:** `v2-main`
**Predecessor arc:** [ai-repair-3-apply-arc-closeout.md](./ai-repair-3-apply-arc-closeout.md)
(this was its "next safe repair category", track 2).

> **STATUS: LOCAL / UNPUSHED.** Both commits are local on `v2-main` and **not pushed**
> (`a5fb994d1` 4A, `3a146901f` 4B). Not yet production-smoked. No new feature flag; no
> migration. The deterministic Check / Preview / Apply paths are 0-credit and independent
> of `ENABLE_AI_CREDIT_ENFORCEMENT` (unchanged, OFF).

---

## 1. Summary

This slice-group adds the **second** deterministic, model-free repair category (after
AI-REPAIR-3's variable-reference re-pointing): removing a **dangling edge** — a connection
whose `from` or `to` step no longer exists in the workflow.

- **4A** (`a5fb994d1`) — end-to-end deterministic dangling-edge cleanup. Check already
  detected these (`stale_edge`) and they already block readiness; 4A made them
  **actionable**: an aggregated `STALE_EDGE` finding with safe from/to labels, a "Needs
  attention" card with "Preview fix", a deterministic `removeEdge` preview run through the
  same validate + apply-safety engine, and Apply that removes only the broken edge(s) and
  saves the draft (no run).
- **4B** (`3a146901f`) — **honest count-aware copy** for both single- and multi-edge cases,
  closing 4A's known caveat (multiple broken edges read as a lone broken connection). Adds
  per-endpoint "which side vanished" flags so each connection renders a safe descriptor;
  keeps the safe batch-remove behavior and `removeEdge` as the only operation.

## 2. Completed commit chain

- `a5fb994d1` — deterministic dangling/broken-edge cleanup preview + apply (AI-REPAIR-4A) _(2026-06-16)_
- `3a146901f` — honest count-aware copy for dangling-edge cleanup preview (AI-REPAIR-4B) _(2026-06-16)_

## 3. Current behavior (end to end)

**Check** (`diagnoseWorkflowForAgent`): `stale_edge` graph issues are aggregated into a
single actionable `STALE_EDGE` finding. Each dangling edge carries **safe labels only** —
`fromLabel` / `toLabel` resolve to the endpoint's display name when it exists, else
"a step that no longer exists" — plus 4B's `fromMissing` / `toMissing` flags identifying
**which** endpoint vanished. Raw edge / node ids stay server-side (the deterministic
preview re-derives them). Excluded from the generic no-button structure cards (mirrors
`INVALID_VARIABLE_REFERENCE`).

**Deterministic Preview** (`runDanglingEdgeRepairPreview`; the preview route runs it
**before** the OpenAI-config check / `aiCreditGate` / model client / cost recorders):
- **No LLM, no AI credits, no model-call telemetry.** Builds the narrow `removeEdge` op(s)
  via the existing `buildEdgeRepairOutcome` and runs them through the SAME
  `validateWorkflowPatch` + `assessApplyReadiness` engine. Removes **all** dangling edges
  in one preview so the candidate validates clean; if the result is otherwise-invalid,
  validation blocks → null (fail-closed). Requested with the explicit
  `previewWorkflowRepair(..., true)` flag, which never falls through to the model path.

**Apply** (`/ai/repair/apply`, the existing AI-REPAIR-3D route):
- **No LLM, no AI credits.** Re-authorizes, re-validates against the FRESH definition,
  re-runs safety + executor, and **persists the draft definition only**.
- Does **not** run / activate / deactivate / register-deregister triggers; does **not**
  mutate credentials / integrations / provider accounts. UI shows "Applied fix. Workflow
  not run."

### Exact single-edge UX
- Headline: "This workflow has a connection to a step that no longer exists."
- One descriptor: `From "Send Email" to a step that no longer exists.` — the surviving
  step is quoted, the vanished endpoint is shown plainly.
- Helper: "…which broken **connection** will be removed."
- Preview summary: "Remove **the** broken connection to a missing step".

### Exact multi-edge UX
- Headline: "This workflow has **N** connections to steps that no longer exist."
- One descriptor per broken connection, each quoting only the surviving step (e.g.
  `From "Send Email" to a step that no longer exists.` and
  `From a step that no longer exists to "Send Slack Message".`).
- Helper: "…which broken **connections** will be removed."
- Preview summary: "Remove **all N** broken connections to missing steps"; the change list
  enumerates one removed connection per edge.

## 4. Batch-remove decision (why not per-edge)

Behavior stayed **batch-remove**: one validated preview clears **all** dangling edges and
emits **one `removeEdge` op per dangling edge**. The patch validator rejects a candidate
that still holds a dangling edge, so removing them one at a time would leave the
intermediate workflow invalid and fail validation. Per the product rule — *"it's okay to
remove all dangling edges in one deterministic repair as long as the UI says exactly
that"* — 4B made the copy honestly plural rather than building an overcomplicated
per-edge flow that can't always be safely staged. Per-edge previewing was considered and
**deferred**: only worth it if each single-edge removal independently validates, which is
not generally true.

## 5. Security / no-leak guarantees

- **`removeEdge` is the only operation.** No node deletion, no guessed replacement
  endpoints, no branch-label changes, no trigger changes. Apply eligibility is **not**
  broadened beyond dangling-edge `removeEdge`.
- **No raw identifiers in user-facing copy.** Cards/descriptors/summaries render **labels**
  only; raw edge ids, node ids, DB ids, provider internals, tokens/secrets never reach the
  DOM. The missing endpoint reads "a step that no longer exists". (Verified by no-leak
  tests asserting absence of `e-dangling` / `gmail1` / `ghost*` in rendered copy and in the
  model-visible diagnosis payload.)
- **Apply re-derives trust server-side** — operations are re-validated against the fresh
  definition; a stale/changed graph → no write. Apply lives **only** on the validated
  preview card, never on the Check card.

## 6. Data / RLS / model notes

- **No migration. No new feature flag. No DB/env changes.** Apply persists via the existing
  account-scoped workflow `draftDefinition` update.
- Account model unchanged — repair operates on the account-owned workflow draft only.
- `ENABLE_AI_CREDIT_ENFORCEMENT` unchanged (OFF) and irrelevant — these paths are
  deterministic and 0-credit regardless.

## 7. UI behavior

- The "Needs attention" dangling-edge card renders count-aware copy (singular / plural with
  count), one safe descriptor per broken connection, and a single "Preview fix" that runs
  the deterministic cleanup. Every affordance is wired to a real deterministic path — no
  fake/unsupported controls. Apply appears only on the resulting validated preview.

## 8. Mojibake cleanup note

4B also cleaned cosmetic mojibake (em-dash / arrow / ellipsis) in **comments** of
`features/workflow-builder/panels/_BuilderAiPanelRepairGoTo.tsx`. Two **JSX-string** glyphs
in the same file were also corrected: **line 134** (`"Previewing fix…"`, explicitly
approved by Marcus — it cleared a pre-existing red `BuilderAiPanel.previewFix` test) and
**line 257** (the "Open field" helper `…fill it in — then type…`, same mojibake→glyph
class, no failing test; kept to avoid re-introducing a visible glyph, reported
transparently). No other rendered copy changed.

## 9. Deferred / known limitations

- **Not pushed / not prod-smoked.** Both commits are local on `v2-main`. Needs the same
  manual prod smoke the AI-REPAIR-3 flows got before shipping.
- **Per-edge removal** intentionally not built (see §4) — only revisit if each single-edge
  removal can validate independently.
- **More repair categories** stay gated behind their own safety-contract review; no further
  Apply broadening without it.
- **Automated repair smoke** still absent (inherited from AI-REPAIR-3) — both repair
  categories are validated by unit tests + (for 3) manual prod smoke only.

## 10. Verification baseline

**Run this session** (during the 4B slice + this closeout, on the as-shipped tree):
- `npx tsc --noEmit` → **exit 0**.
- `npm run lint` → **0 errors** (23 pre-existing warnings; none in the slice's files).
- `npm run lint:structure` → **OK** (every leaf folder ≤ 50 files).
- ESLint on the 10 touched files → **0 problems**.
- Jest, all green this session:
  - Focused 4A/4B + preview route — **106 passed** (`attentionFindings`,
    `diagnoseWorkflowForAgent`, `danglingEdgeRepairPreview.integration`,
    `BuilderAiPanel.danglingEdge`, `ai-repair-preview-route`).
  - Patch safety/executor + `setupFindings` — **114 passed**.
  - Broad `tests/unit/features/workflow-builder` + `tests/unit/services/ai` +
    `tests/unit/app/api/workflows` (incl. AI-REPAIR-3 variable-reference, 3D/E apply
    route/UI, CHECK-ACTIONS `attentionFindings`, chat-fill) — **3258 passed**.
  - `BuilderAiPanel.previewFix` — **15 passed** (was pre-existing red from a JSX-string
    mojibake; green after the line-134 fix).
- Full `npm test` (whole tree) **not run this session**.

**Migrations:** none in this slice. **Flags:** none added; `ENABLE_AI_CREDIT_ENFORCEMENT`
unchanged (OFF). **Production:** not smoked yet (local-only).

## 11. Parallel-work caveat

Unrelated parallel work in `scripts/chainreact/*` (e.g. `cli.ts`, `help.ts`, `repo.ts`,
`tests/unit/chainreact/cli.test.ts`, untracked `commands/appScaffold.ts`) was present in
the working tree during this slice and was **left untouched and uncommitted** — it is not
part of AI-REPAIR-4 and was deliberately excluded from both commits.

## 12. Recommended next tracks

1. **Push + prod-smoke AI-REPAIR-4** alongside the next approved batch, then mark it LIVE.
2. **Automated repair smoke** covering both repair categories (variable-reference +
   dangling-edge) so regressions surface without manual checking.
3. **Next safe repair category** (e.g. unreachable-node / no-trigger guidance becoming
   actionable) — each behind its own safety-contract review, `removeEdge`-style narrow ops.

## 13. Closeout confirmation

Docs-only. Nothing pushed. Doc:
`docs/slices/phase-4/ai/ai-repair-4-dangling-edge-closeout.md`.
