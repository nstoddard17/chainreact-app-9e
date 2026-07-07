# React Agent Readiness Verdict — Closeout (Checklist Item 5)

**Type:** Closeout / handoff. **Docs-only — no source, test, migration, schema, UI, or behavior
change in THIS doc. Nothing pushed.**
**Date:** 2026-06-30
**Branch:** `v2-main` (local-only; unpushed)
**Marker:** REACT-AGENT-READINESS-CLOSEOUT-1
**Foundation commit:** `cca248e5d` (local, not pushed)

Closes out the foundation for "what is left before this can run?" — a typed readiness verdict
attached to every React Agent preview / applied change. Builds on the preview / review-rail /
checkpoints arc ([`react-agent-preview-review-checkpoints-closeout.md`](./react-agent-preview-review-checkpoints-closeout.md))
and the apply-modes work (`REACT-AGENT-APPLY-MODES-1`).

---

## 0. Status at a glance (read this first)

1. **Commit `cca248e5d` contains the self-contained readiness foundation** — the verdict engine,
   the connection-readiness route, the typed client + hooks, the render panel, and the tests. It is
   complete and green on its own.
2. **The builder render wiring was intentionally left out of `cca248e5d`** because at commit time it
   overlapped a parallel, unfinished **CHECKLIST-ITEM-10** session mid-edit in the same files
   (`WorkflowBuilder.tsx`, `BuilderApplyNotice.tsx`, and the `useBuilderPreview.ts` `agentSetupIssues`
   change my wiring depends on). Committing those files from this slice would have captured another
   arc's unfinished work, so they were left in the shared working tree (present + verified green).
3. **The parallel session has since committed that wiring in `7537f32c2`**
   (`feat(builder): render setup-needed card + readiness in post-apply notice — REACT-AGENT-SETUP-ISSUES,
   REACT-AGENT-READINESS-1`). HEAD's `WorkflowBuilder.tsx` now calls `useBuilderReadiness` and passes
   `readiness` to both the review rail (`PreviewReviewPanel`) and the post-apply notice
   (`BuilderApplyNotice`). **The item is therefore now fully wired and user-visible from committed
   code** (`cca248e5d` foundation + `7537f32c2` builder wiring).
4. **Nothing pushed.** No `git push`, no PR, no deploy. No migration, no feature flag.

---

## 1. What shipped in `cca248e5d` (committed, self-contained)

| File | Role |
|------|------|
| `core/workflows/agentReadiness.ts` | Pure `computeAgentReadiness` + the verdict/blocker/connection-signal types. The single decision point. |
| `app/api/workflows/[id]/connection-readiness/route.ts` | Cookie-session route → delegates to the existing `diagnoseWorkflowConnections` brain with the reviewed graph as `draftOverride`. |
| `contracts/workflowConnectionReadiness.ts` | Client-side wire shape mirroring the brain's already-sanitized DTO (lib/api may not import `@/services`). |
| `lib/api/workflowConnectionReadiness.ts` | Typed client (`getWorkflowConnectionReadiness`). |
| `features/workflow-builder/hooks/useConnectionReadiness.ts` | Fetches the brain for the reviewed graph; maps DTO → core `AgentConnectionSignal`. |
| `features/workflow-builder/hooks/useAgentReadiness.ts` | Gathers validation (end-state) + lifecycle + test + connection → verdict. |
| `features/workflow-builder/hooks/useBuilderReadiness.ts` | Builder wiring wrapper (target selection + the two hooks above). |
| `features/workflow-builder/panels/AgentReadinessSummary.tsx` | Presentational verdict (status pill, summary, blockers grouped by type, "Ready after"). |
| `features/workflow-builder/panels/PreviewReviewPanel.tsx` | Renders the summary at the rail top (additive optional `readiness` prop). |
| Tests | `agentReadiness.test.ts` (14), `connection-readiness-route.test.ts` (6), `AgentReadinessSummary.test.tsx` (5). |

## 2. Behavior (foundation)

- Verdict states: `not_ready` (setup-only blockers) / `ready_to_test` / `ready_to_activate` /
  `blocked` (connection / variable / lifecycle / test-failure blockers) / `unknown` (no change).
- Every input is a real deterministic signal — **never model output**:
  - Validation against the proposed **end-state** via the shared `collectBuilderValidationIssues`
    (graph integrity + required fields + broken `{{...}}` references). No second ruleset.
  - **Connection** via the authoritative `diagnoseWorkflowConnections` brain (integration rows /
    health / scopes / personal-vs-account credential provenance). "Connected" is asserted only when
    the resolver proves it; `loading` / `error` never claim connected, and the verdict cannot reach
    `ready_to_activate` while connections are unverified.
  - **Lifecycle**: a trigger change on an `active` workflow blocks (needs Reactivate → Resume).
  - **Test**: `ready_to_activate` requires a passed run for the applied change, except for
    non-testable triggers (e.g. webhook) where in-builder test is not a gate.
- Blockers grouped by type, each with a plain-English next step; a "Ready after" checklist lists the
  concrete next steps.

## 3. Security / no-leak

- The verdict carries only issue codes, author-facing messages (already produced by the validator),
  node ids, field key/label NAMES, provider ids/display names, and enum states. Never config values,
  tokens, secrets, raw provider payloads, credential-owner identities, or resolved `{{...}}` values.
  A no-leak unit test asserts the forbidden secret-shaped substrings never appear in the verdict.
- The connection route is a thin pass-through of the brain's **already-sanitized** DTO. It is
  `requireUser` + `loadWorkflowForMember` gated (standard 404 no-leak for non-members / missing
  workflows), and the brain independently re-authorizes by account membership. The gated
  machine-bearer `/api/internal/diagnostics/workflow-connections` route is unchanged.
- No credential / RLS / lifecycle / resolver logic was duplicated — all reused via the existing
  authoritative seams.

## 4. Verification baseline (run this session, newly measured)

- `npm run typecheck` → exit 0.
- `npm run lint` → exit 0 (0 errors; 12 pre-existing `max-lines` warnings; `PreviewReviewPanel.tsx`
  is 1 line over the 400 soft cap).
- `npm run lint:structure` → OK.
- Focused Jest: `agentReadiness` 14/14, `connection-readiness-route` 6/6, `AgentReadinessSummary`
  5/5, `PreviewReviewPanel` 12/12 — all green.
- No migration (none added). No feature flag (route is read-only + sanitized).

## 5. Builder wiring — landed via the parallel session (`7537f32c2`)

The render wiring is committed (by the CHECKLIST-ITEM-10 session, not this slice), so the verdict is
live end-to-end:

- `features/workflow-builder/WorkflowBuilder.tsx` — the `useBuilderReadiness(...)` call + the two
  `readiness={agentReadiness}` props (on `PreviewReviewPanel` and `BuilderApplyNotice`).
- `features/workflow-builder/canvas/BuilderApplyNotice.tsx` — the optional `readiness` prop + the
  compact post-apply `AgentReadinessSummary`.
- `features/workflow-builder/hooks/useBuilderPreview.ts` — CHECKLIST-ITEM-10's `agentSetupIssues`
  change (not mine), which my WorkflowBuilder wiring consumes.

These files were correctly NOT staged/committed by this slice (they carried concurrent unfinished
work at the time); they landed under `7537f32c2`. No further wiring action is needed.

## 6. Deferred / non-goals

- No node/header readiness badges (kept as a later/stretch per the task).
- No workflow health dashboard / monitoring; readiness is a per-preview verdict only.
- No agent-confidence layer (readiness is its foundation).
- Connection is fetched for the reviewed graph on preview/apply; a debounced/cached cross-preview
  cache is a future optimization (the hook already skips refetch when provider+node set is unchanged).
