# 4.AI-REPAIR-2 — Validated Patch Preview — Production Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this slice. `db:push` NOT run.
**Date:** 2026-06-14
**Branch:** `v2-main`
**Plan:** [ai-repair-2-validated-patch-preview-plan.md](./ai-repair-2-validated-patch-preview-plan.md)

> **STATUS: LIVE IN PRODUCTION.** Shipped range `1c603af8f..78e2d1f01`; final deployed
> commit **`78e2d1f01`**. Vercel Production deploy **Ready**. AI credit enforcement
> remains **OFF**. Hermes / MCP internal path / Apply are **not** introduced.

---

## 1. Summary

AI-REPAIR-2 adds a metered, **preview-only** validated repair: from a repair proposal,
the user clicks **"Preview fix"**, the model proposes a `WorkflowPatch`, and the server
validates it through the existing deterministic preview engine and returns a no-leak,
label-based "what would change" view with the authoritative recomputed risk. Nothing is
applied, saved, or run.

- **2a (plan):** design grounded in the existing `validateWorkflowPatch` / `previewWorkflowPatchForAI` engine.
- **2b (backend/client):** `services/ai/repair/previewWorkflowRepair.ts`, `POST /api/workflows/[id]/ai/repair/preview`, `previewWorkflowRepair(...)` client + `RepairPreview` types.
- **2b draft-preview fix:** the preview validates against the **current visible draft** when supplied (not stale saved state) — the trust-rule correction.
- **2c (UI):** "Preview fix" on the repair-proposal bubble + the `repair_preview` bubble.

Builds on AI-REPAIR-1 (proposal-only "Suggest a fix") and the AI-REPAIR-CLEANUP-1
no-behavior-change file split.

---

## 2. Completed commit chain

```
b015001c9 — docs(ai-repair): AI-REPAIR-1 safe repair-plan proposal closeout (AI-REPAIR-1) _(2026-06-14)_
8a408c64b — refactor(builder-ai): split oversized Builder AI files; no behavior change (AI-REPAIR-CLEANUP-1) _(2026-06-14)_
b3886ff78 — docs(ai-repair): AI-REPAIR-2 validated patch preview plan + group AI-REPAIR docs under ai/ (AI-REPAIR-2) _(2026-06-14)_
5826a0ac1 — feat(builder-ai): validated patch preview backend + client, no UI (AI-REPAIR-2b) _(2026-06-14)_
39a4e6e80 — fix(builder-ai): repair preview validates against the unsaved draft (AI-REPAIR-2b) _(2026-06-14)_
f53e3ab72 — feat(builder-ai): Preview fix — validated patch preview UI (AI-REPAIR-2c) _(2026-06-14)_
```

The **AI-REPAIR slices this closeout covers** are the four bolded in the request:
`b3886ff78` (plan) · `5826a0ac1` (backend/client) · `39a4e6e80` (draft-preview fix) ·
`f53e3ab72` (UI). The pushed range `1c603af8f..78e2d1f01` also carried interleaved
apps/readiness/sweep commits from a parallel chat (APPS-PERM-1/2/3, V2-READY*) — out of
scope for this arc; see §7 process lesson re: the trailing `78e2d1f01`.

---

## 3. Current behavior (end to end)

1. "Check workflow" → if issues, "Suggest a fix" → a `repair_proposal` bubble.
2. **"Preview fix"** appears **only on the latest repair-proposal bubble** (never the
   diagnosis card, never before a proposal exists). Explicit click only.
3. The client calls `previewWorkflowRepair(workflowId, currentDraft, proposalContext)` once,
   sending the **current visible builder draft** (same snapshot Check/Explain/Suggest use)
   + the proposal's summary/actions as non-authoritative steering.
4. The route re-derives the diagnosis server-side, the model emits a `WorkflowPatch`, and
   the server validates it via `previewWorkflowPatchForAI` → `validateWorkflowPatch`
   (deterministic risk recompute, errors/warnings, cost) **against the supplied draft**.
5. The `repair_preview` bubble renders: summary, label-based `changes[]`, the **validated**
   risk + cost, an "After:" candidate summary, warnings; on a blocked patch a friendly
   blocked reason + humanized errors. Immutable UI-owned "preview only — wasn't changed,
   saved, or run" notice. Pending shows "Previewing fix…"; success disables the button
   ("Previewed") to block repeat charge.

**Trust fix (important):** the repair preview validates against the **current visible
draft override when provided**, not stale saved workflow state — so Check / Explain /
Suggest / Preview all operate on the same snapshot the user sees. Absent a draft, it
falls back to the saved definition.

---

## 4. Security / no-leak guarantees

- **Authz from the saved record:** `loadWorkflowForMember` + `getWorkflowGraphForAI`
  resolve the workflow-owning account; non-member / missing / cross-account → no-leak 404
  before any gate/model. The client draft only changes *which graph is analyzed*, never
  *who may analyze it*.
- **Model context is allow-listed:** `buildDiagnosisExplainContext(dto)` + an opaque-id
  node inventory (`id/kind/provider/type` + edges) only. **No config values**, tokens,
  credentials, integration rows, provider account labels, connectedByUserId, run payloads,
  or PII reach the model. The draft used as the validation target is secret-redacted.
- **Response is no-leak + label-based:** node display labels in `changes[]`, never raw node
  ids in user-facing copy; no raw JSON as primary UI; humanized validation errors.
- **No mutation path:** the route + service import no apply / save / run / persistence path
  (import-boundary tests enforce this); the draft is never persisted.

---

## 5. Data / model notes

- **No new DB objects, no migration, `db:push` NOT run** — none needed. Credits reuse the
  existing `workflow_repair` feature (4 credits) + `account_billing` counters + the
  `ai_cost_events` recorder. Cost owner = the workflow-owning account, resolved server-side.
- **Flags:** `ENABLE_AI_CREDIT_ENFORCEMENT` = **OFF** (default). The gate is a no-op (preview
  runs unmetered); the recorder still writes the 4-credit charge, consistent with Explain /
  Suggest. No flag was flipped.

---

## 6. UI behavior

"Preview fix" on the repair-proposal bubble only; the `repair_preview` bubble renders the
validated, human-readable preview with an immutable preview-only notice. **No Apply control
anywhere (not even disabled), no save/run trigger.** No fake/unsupported controls shipped.

---

## 7. Deferred / known limitations + process lesson

- **AI-REPAIR-3 (executable apply) deferred** — emitting/validating a `WorkflowPatch` for an
  actual apply (over the same engine, behind a gated Apply control) is the next arc. This
  slice deliberately stops at preview.
- **Hermes / MCP internal path: not introduced** — single request → structured model call →
  deterministic validation → response.
- **Process lesson (shared `v2-main`):** the shared branch can advance during the
  verification/build window when multiple chats are active. The pre-push audit (15 commits
  ending `f53e3ab72`) was correct at audit time, but the actual push carried **one extra
  test-only commit `78e2d1f01` (V2-READY-0D, `engine.test.ts` +82 lines, the other chat)**
  that landed during the build. **Repeat the final outgoing-commit audit immediately before
  `git push`** (and diff the pushed HEAD against the audited HEAD) when other chats are
  active. The extra commit was test-only with no source/prod-behavior change.

---

## 8. Verification baseline

**Run THIS session (newly measured), pre-push:**
- Targeted AI-REPAIR-2 (service / route / preview-engine / client / UI) + existing
  Check / Explain / Suggest suites — **8 suites / 145 tests pass**.
- `npx tsc --noEmit` — clean.
- `eslint` on touched files — clean.
- `npm run lint:structure` — green.
- `npm run lint` — **0 errors** (19 pre-existing warnings, none in AI-REPAIR files).
- **Full production build (`npm run build`) — succeeded.**
- Deploy — Vercel **Production · Ready** for `78e2d1f01`.

**Not run this session:** full `npm test` tree (the targeted set above + the production
build were the gate); live click-through smoke against the production URL (no authenticated
prod browser session from this environment — the §3 behaviors are covered by the passing
tests and present in the deployed commit).

**Migrations:** none added; `db:push` not run. **Flag:** `ENABLE_AI_CREDIT_ENFORCEMENT` OFF.

---

## 9. Recommended next tracks

1. **AI-REPAIR-3 — gated apply** over the existing `validateWorkflowPatch` /
   `applyPatchToDefinition`, with a real (confirmation-gated) Apply control + optimistic
   `baseRevision` conflict handling.
2. **Deterministic fast-path** — try the strategy engine (`repairStrategies.ts`) before the
   LLM for known finding categories (free, no credit), LLM fallback for the rest.
3. **AI credit enforcement rollout** — flip `ENABLE_AI_CREDIT_ENFORCEMENT` in a controlled
   step once ready; the gate + ledger are already wired for Explain / Suggest / Preview.

---

## 10. Closeout confirmation

**Docs-only. Nothing pushed** from this slice. No source / test / migration / schema / UI
changed; no `db:push`; no env/flag change; no Hermes; no MCP path; no Apply/save/run. Doc at
`docs/slices/phase-4/ai/ai-repair-2-validated-patch-preview-closeout.md`.
