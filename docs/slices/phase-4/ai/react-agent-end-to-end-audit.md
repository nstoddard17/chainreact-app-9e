# Workflow Builder React Agent — End-to-End Logic Audit

**Slice:** 4.AI-AUDIT-1
**Branch:** `builder-ui-v1-audit-1`
**Date:** 2026-05-27
**Audit-only.** No source/test files were modified by this slice. No commit, no push.

> **Status update (2026-05-27, AI-26 shipped on this same branch):** the P0
> finding in §C and §E.P0.1 has been fixed, and §E.P1.1 (visibility notice)
> is implemented. See [`docs/slices/phase-4/ai-architecture-react-agent-plan.md`](../ai-architecture-react-agent-plan.md)
> § "AI-AUDIT-1 + AI-26" for the implementation note. The audit text below
> is preserved verbatim for historical reference; the §I recommended slice
> has been completed.

---

## A. Executive Summary

**Architecture verdict: logically correct overall.** The plan / apply / persistence surfaces are well-isolated, the planner is stateless, sanitization is defense-in-depth (client allowlist + server allowlist + secret-key denylist + secret-value patterns), RLS is correctly scoped to `auth.uid() = user_id`, and the no-substitution rule (AI-24) is comprehensively stated and enforced. The persisted thread is intentionally history-only and never feeds back into planning.

**Persistence currently working: partial.** The server-side write path (route → repo → DB) is sound. The client-side **load** path has a one-line correctness bug that drops persisted messages on every fresh mount in React Strict Mode.

**Most likely reason chat clears on refresh:**
`BuilderAiPanel`'s thread-load `useEffect` uses a "loaded ref" sentinel that is set **before** the async fetch resolves. Combined with the cleanup callback that flips `cancelled = true`, this means: in React Strict Mode dev, the first effect starts the fetch AND sets the ref; the simulated unmount cleanup flips `cancelled = true` on the in-flight fetch's closure; the simulated re-mount effect early-returns because `ref === workflowId`. The fetch resolves, sees `cancelled`, and silently drops the persisted messages. `setMessages` is never called.

Steady-state interactions (Plan / Apply / Clear / typing) work because those are user-event-driven, not effect-driven, so they are not subject to the Strict Mode double-invoke.

`reactStrictMode: true` is set in [`next.config.mjs`](../../../../next.config.mjs). This affects dev only; production builds do not double-invoke, so prod refresh likely DOES rehydrate correctly. Marcus is running `npm run dev` → he hits the dev-only path.

This is the only P0 finding in this audit.

---

## B. End-to-End Flow Diagram

### B.1 Fresh prompt flow (no chain)
```
User types in composer
  → BuilderAiPanel.handleSubmit
    → appendMessage(user prompt)                    [session state]
    → persistMessageBestEffort(role=user kind=prompt)  → POST /thread/messages
    → ai.plan(prompt, undefined, { currentGraph })  [BuilderAiCallOptions]
       → planWorkflow → POST /api/workflows/[id]/ai/plan
         → requireUser → getById → planWorkflowFromPromptForAI
           → buildWorkflowPlanRequest (catalog + connectedIntegrations + currentGraph)
           → callPlannerModel (Anthropic adapter)
           → parseWorkflowPlanResponse → AI-3 validate
           → AI-5 deterministic preview
           → recordAiPlanOutcome (analytics, fail-open)
       → returns AiPlanResult
    → appendMessage(plan_result, result)             [session state]
    → persistMessageBestEffort(role=assistant kind=plan_result, safePayload)  → POST /thread/messages
    → if result.requiredUserInput.length > 0 → followUpMode = true
```

### B.2 Missing-info follow-up flow
```
User fills RequiredInputControls + optional free text → handleSubmit
  → stagedAnswers snapshot taken
  → appendMessage(user, kind=followup) + persist
  → ai.submitFollowUp({ freeText, structuredAnswers }, undefined, { currentGraph })
     → guard: originalPrompt && planResult.requiredUserInput.length > 0
     → composeFollowUpPrompt(original + asked labels + priorAnswers + new)
     → planWorkflow(...)
     → on ok: setPlanResult(result); if more needed → push prior answer summary; else → clear chain
     → on !ok: KEEP prior planResult (AI-25 retryable preservation); return null
     → on throw: same — preserve chain
  → if null: panel restores composer text + staged answers and appends an error bubble
  → if ok: appendMessage(plan_result, result) + persist
```

### B.3 Apply flow
```
User clicks Apply on latest live plan_result
  → handleApply → ai.apply()
     → guards: planResult.ok && proposedPatch && canApplyLater
     → applyWorkflowPatch → POST /api/workflows/[id]/ai/apply
        → requireUser → applyWorkflowPatchForAI
           → getById → re-validate WorkflowPatch
           → updateDraftDefinitionIfRevisionMatches  (optimistic concurrency)
           → returns AiApplyResult
     → on ok: setStatus("applied"); await onApplied() (panel re-hydrates graphSlice)
  → appendMessage(applied | apply_failure) + persist
```

### B.4 Persistence write flow
```
persistMessageBestEffort(workflowId, input)
  → fetch POST /api/workflows/[id]/ai/thread/messages
     → requireUser → getById (workflow ownership)
     → AppendMessageSchema.safeParse (role/kind enum, content + safePayload shape)
     → sanitizeAgentMessageForPersist
        - role/kind allowlist enforcement
        - content secret-pattern redaction + length cap
        - safe_payload TOP_LEVEL_PAYLOAD_KEYS allowlist
        - nested REQUIRED_USER_INPUT_KEYS + PREVIEW_KEYS allowlists
        - SECRET_KEY_SUBSTRINGS + FORBIDDEN_INTERNAL_KEYS denylists
        - SECRET_VALUE_PATTERNS regex denylist
        - size + depth caps
     → appendMessageForWorkflow(repo)
        - getOrCreateThreadForWorkflow (idempotent on UNIQUE (user_id, workflow_id))
        - INSERT builder_agent_messages (RLS gate: auth.uid() = user_id)
        - UPDATE threads.updated_at
     → 201 with sanitized record
  → on throw → console.warn, return null (fail-open)
```

### B.5 Refresh / load flow
```
Browser refresh → Next.js server route /workflows/[id]/page.tsx
  → SSR auth.getUser → 401-redirect if no session
  → workflowsRepo.getById (RLS-gated; returns null for non-owner)
  → renders WorkflowBuilder with workflow detail
  → WorkflowBuilder useEffect: hydrate(graphSlice, workflow.id, draftDefinition)
  → BuilderAiPanel renders; graphSlice.workflowId = "wf-1"
  → BuilderAiPanel useEffect (workflowId dep):
     - if loadedForWorkflowRef.current === workflowId → EARLY RETURN
     - else set ref = workflowId; start async getBuilderAgentThread
     - cleanup: cancelled = true
  → on resolve: if !cancelled and rehydrated.length > 0 → setMessages
```

In React Strict Mode dev, this last block is run TWICE: the first invocation starts the fetch and primes the ref; the cleanup cancels it; the second invocation's `ref === workflowId` early-returns. No new fetch is started, and the in-flight one is suppressed. → empty chat.

### B.6 Clear conversation flow
```
User clicks "Clear conversation"
  → handleClear
     → setRiskAcknowledged(false)
     → setMessages([])
     → setPrompt("")
     → setStagedAnswers(new Map())
     → ai.reset() (clears planResult / applyResult / chain state)
     → clearBuilderAgentThread(workflowId).catch(warn)
        → DELETE /api/workflows/[id]/ai/thread
           → requireUser → getById → clearThreadForWorkflow
              → DELETE FROM builder_agent_messages WHERE user_id = $1 AND workflow_id = $2
              → thread row preserved (UNIQUE constraint keeps (user, workflow) stable)
```

---

## C. Persistence Bug Diagnosis

| Question | Answer |
|---|---|
| Did GET thread fire? | **Yes**, the first effect call kicks off `getBuilderAgentThread`. |
| Did it return messages? | **Yes**, the server returns the persisted rows. |
| Were messages sanitized away? | **No**, sanitizer is write-side only; reads return the stored allowlisted shape. |
| Did the client overwrite loaded messages? | **No**, but it never set them. See below. |
| Did RLS block read? | **No**, repo uses SSR cookie client; `auth.uid()` matches; SELECT policy permits. |
| Did POST never persist messages? | **No**, write path is sound; persisted rows exist in DB. |
| Did refresh use a different workflowId/user? | **No**, page.tsx → graphSlice.hydrate uses the URL workflowId. |
| Was thread clear called accidentally? | **No**, DELETE only fires from `handleClear`. |
| Is there a client hydration race? | **YES — this is the bug.** |

**Root cause — verbatim from `features/workflow-builder/panels/BuilderAiPanel.tsx:120-143`:**

```ts
const loadedForWorkflowRef = useRef<string | null>(null);
useEffect(() => {
  if (!workflowId) return;
  if (loadedForWorkflowRef.current === workflowId) return;
  loadedForWorkflowRef.current = workflowId;     // (1) set BEFORE await
  let cancelled = false;
  (async () => {
    try {
      const res = await getBuilderAgentThread(workflowId);
      if (cancelled) return;                      // (2) suppresses set on cancel
      const rehydrated = res.messages
        .map(persistedMessageToChat)
        .filter((m): m is ChatMessage => m !== null);
      if (rehydrated.length > 0) setMessages(rehydrated);
    } catch (err) {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("Builder Agent thread load failed:", err);
      }
    }
  })();
  return () => {
    cancelled = true;                              // (3) flipped during StrictMode cycle
  };
}, [workflowId]);
```

**React Strict Mode dev re-mount cycle on a single fresh page load:**

1. **Render 1:** `workflowId = null` (graphSlice INITIAL_STATE). Effect runs, early-returns.
2. **Parent `WorkflowBuilder` effect runs:** `hydrate(workflow.id, def)`. graphSlice.workflowId becomes `"wf-1"`.
3. **Render 2:** `workflowId = "wf-1"`. Effect runs: `ref=null !== "wf-1"` → set `ref = "wf-1"`, start fetch A, `cancelled = false`.
4. **Strict Mode simulated unmount (cleanup phase, bottom-up):**
   - BuilderAiPanel cleanup: `cancelled = true` (for fetch A's closure).
   - WorkflowBuilder cleanup: `reset()` → graphSlice.workflowId = null briefly.
5. **Strict Mode simulated re-mount (effect phase, top-down):**
   - WorkflowBuilder effect: `hydrate` again → workflowId = "wf-1".
   - BuilderAiPanel effect runs again: `ref === "wf-1"` → **EARLY RETURN**. No new fetch.
6. **Fetch A resolves** (async, off the main effect): `cancelled === true` → silently returns without calling `setMessages`.

**Result:** persisted messages were fetched but never reach React state. The chat appears empty even though the DB has rows.

The author was aware of Strict Mode (comment at line 119) but the ref dedup races with the cancellation. The fix is to either:

- **(preferred, smallest diff)** move `loadedForWorkflowRef.current = workflowId` **after** the successful set, so a cancelled load leaves the ref unchanged and the re-mount fires the fetch again; OR
- **(alternative)** drop the cancelled flag for GET (the operation is idempotent and the resulting setMessages on a stale workflowId would be guarded by a different check); OR
- **(alternative)** check `loadedForWorkflowRef.current === workflowId` inside the async callback right before `setMessages` instead of as a pre-fetch gate.

The bug is silent in tests because `tests/unit/features/workflow-builder/panels/BuilderAiPanel.persistedThread.test.tsx` does **not** wrap renders in `<StrictMode>` (no `StrictMode` references anywhere under `tests/`).

**Additional contributing risk:** the panel has no user-visible signal when persistence fails. `console.warn` is the only evidence. If Marcus is not watching the console, every silent-load failure looks like "chat got cleared." A minimal toast or status pill (described in §E P1) would have surfaced the bug weeks earlier.

---

## D. Contradiction Audit

The architecture is internally consistent. Items below are **smells / asymmetries** rather than contradictions; one item (D.1) is a genuine logic bug.

### D.1 (BUG) Ref-set-before-fetch races with effect-cleanup-cancels (P0)
Covered in §C. The ref dedup intends to suppress the Strict Mode double-fetch but accidentally suppresses the only fetch's result.

### D.2 No-substitution vs current canvas
The HARD no-substitution rule (`PLANNER_CONSTRAINTS` in `services/ai/planner/buildWorkflowPlanPrompt.ts:38-69`) and the current-canvas awareness section coexist without conflict. The prompt explicitly states canvas context does NOT license substitution. ✓

### D.3 Required fields vs apply-readiness
`canApplyLater` gate (`planWorkflowFromPrompt.ts:219-225`) requires both preview-acceptance AND `requiredUserInput.length === 0`. A plan with non-empty required input still generates a preview (so the user can see structural plan + render controls) but cannot Apply. UI surfaces this via the AI-22 RequiredInputControlsBlock + the "block" copy in `_BuilderAiPanelChat.tsx:414-427`. ✓

### D.4 Persisted history vs active follow-up
The panel correctly never resurrects a persisted needs-input plan into active follow-up state. `useBuilderAi`'s chain state (`originalPrompt`, `priorFollowUpAnswers`) is session-local and starts empty on mount. A persisted plan_result is rehydrated as `persisted: true`; the latest-plan derivation in `_BuilderAiPanelMessageList.tsx:102-109` skips persisted entries. ✓ (See §E P1 for the open product question.)

### D.5 Read-only preview vs Apply
Persisted plan_result rehydration in `persistedMessageToChat` synthesizes an `AiPlanResult` with `canApplyLater: false` and no `proposedPatch`; even if a stale `persisted=true` plan somehow won the latest-plan derivation, `PlanResultBody`'s `showApplyControls` guard requires `canApplyLater && proposedPatch` → no Apply. Double protection. ✓

### D.6 Disconnected provider vs null patch
Planner prompt instructs that a disconnected provider should emit a `select_integration` requiredUserInput entry (per `buildWorkflowPlanPrompt.ts:59-60`). The patch may still be null in that case. The Apply gate is consistent because `canApplyLater` requires no outstanding input. ✓

### D.7 Saved graph vs pending graph
`BuilderAiPanel` correctly uses `useGraphSlice.s.pendingNodes / pendingEdges` for `currentGraph` (lines 76-94), not `savedNodes / savedEdges`. The `BuilderAiPanel.currentGraph.test.tsx` regression guard locks this in. ✓

### D.8 Workflow Detail page authorization (Informational, NOT a contradiction)
`app/workflows/[id]/page.tsx:41` calls `workflowsRepo.getById(id)` with no inline `record.userId === user.id` check. RLS on `public.workflows` (migration `20260506000000_workflows.sql:80-89`) is the de-facto authorization gate — non-owners get null and the page returns `notFound()`. This is correct behavior but the page's defense-in-depth would benefit from an explicit ownership assertion mirroring the API routes. Not part of this slice's scope.

### D.9 No "thread row" public projection includes `id` (asymmetry)
The thread API returns `{ thread: { id, workflowId, createdAt, updatedAt }, messages: [...] }`. The client only reads `messages`; the thread object is unused (the panel never references `thread.id`). The shape is fine — flagging it as a small surface that costs no rendering today but is loadbearing if multi-thread support lands. Not actionable.

---

## E. Recommended Fixes

### P0 — Must fix before continuing

**E.P0.1 — Stop dropping persisted messages on Strict Mode re-mount cycle.**

- **Root cause:** `loadedForWorkflowRef.current = workflowId` is set BEFORE the async fetch resolves; cleanup flips `cancelled = true`; re-mount early-returns on the ref. Result: messages fetched but never set.
- **File:** `features/workflow-builder/panels/BuilderAiPanel.tsx:120-143`.
- **Expected behavior:** on fresh page mount AND on workflowId change, persisted messages reach `setMessages`, exactly once per workflowId.
- **Recommended fix (smallest diff):** move the ref assignment into the `try` block, AFTER `setMessages`. The cleanup-flip then no longer causes the re-mount to early-return. Optionally also drop the redundant `cancelled` flag — GET is idempotent and the eventual setMessages on the now-current workflowId is harmless (the closure captures the same workflowId).
  ```ts
  useEffect(() => {
    if (!workflowId) return;
    if (loadedForWorkflowRef.current === workflowId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getBuilderAgentThread(workflowId);
        if (cancelled) return;
        if (loadedForWorkflowRef.current === workflowId) return; // late dedup
        loadedForWorkflowRef.current = workflowId;
        const rehydrated = res.messages
          .map(persistedMessageToChat)
          .filter((m): m is ChatMessage => m !== null);
        if (rehydrated.length > 0) setMessages(rehydrated);
      } catch (err) { console.warn(...) }
    })();
    return () => { cancelled = true; };
  }, [workflowId]);
  ```
- **Tests needed:** see §F R0.
- **Risk:** very low — the only behavioral change is "ref is set after the fetch resolves." A duplicate concurrent fetch on Strict Mode is harmless (idempotent GET, dedup happens in the final setMessages path).
- **Trivial?** Yes — single-file, ~5 LOC change. Per the audit-slice instructions: NOT applied here pending Marcus's explicit approval.

### P1 — Should fix soon

**E.P1.1 — Surface persistence failures in the UI.**

- **Root cause:** `persistMessageBestEffort` + the load `useEffect` swallow all errors as `console.warn`. A 401 / 404 / network timeout looks identical to "no history." That hid the §C bug from dev observation for weeks.
- **Files:** `features/workflow-builder/panels/_builderAgentPersistence.ts:112-126`, `BuilderAiPanel.tsx:134-138`, `BuilderAiPanel.tsx:372-376`.
- **Expected behavior:** a small non-blocking inline notice (e.g. "Couldn't load chat history" or a yellow info pill) when load or persist fails. Never blocks the plan/apply flow.
- **Tests needed:** add a test that mocks `getBuilderAgentThread` to reject and asserts the notice renders alongside the intro hint.
- **Risk:** very low — additive presentational state.

**E.P1.2 — Decide the resumable-needs-input UX on refresh (product decision).**
The audit scope asked for a recommendation between:
- **Option A:** display-only history after refresh; user must type a fresh prompt or click "Continue from this request."
- **Option B:** rehydrate follow-up mode from the latest persisted needs-input plan; user can immediately answer.

**Recommendation: Option A.** Reasons:
1. Option B requires reconstructing `originalPrompt` + `priorFollowUpAnswers` from persisted user/assistant messages. The persisted user prompt content is the **rendered** display text (which may include staged-answer labels appended for transparency, see `buildUserBubbleDisplay`), not the clean original prompt the model saw. Reconstructing is lossy.
2. Option B implies the persisted plan_result must carry enough metadata to re-instantiate `RequiredInputControls`. Today the persisted `safePayload.requiredUserInput` items are display-only (no `field` / `nodeId` / `optionsSource` / `dependsOn`). Going Option B requires expanding the sanitizer allowlist (a security surface) AND the persistence schema.
3. Option A is the simplest and matches Cursor / Continue.dev / GitHub Copilot Chat behavior — history is read-only after a session ends; new turns start a new chain.
4. Option B is recoverable later if users complain. Option A is forward-compatible.

If Option A is approved, the latest-plan-skip-persisted logic in `_BuilderAiPanelMessageList.tsx:102-109` is exactly right — keep it.

**E.P1.3 — Authorization defense-in-depth on `app/workflows/[id]/page.tsx`.**
Add an explicit `if (record.userId !== user.id) notFound()` mirroring the API routes. RLS today gates this correctly via the SSR cookie client; the inline check is belt-and-suspenders against a future getById refactor that swaps the client. Out of audit scope but flagged for awareness.

### P2 — Polish / future

**E.P2.1 — Test harness: render BuilderAiPanel under `<StrictMode>` in at least one persistence test.**
Add `import { StrictMode } from "react"` and wrap one test in `persistedThread.test.tsx`. This would have caught §C P0 immediately. See §F R0.

**E.P2.2 — Convert `console.warn`s in persistence helpers to a logger / dev-only telemetry.**
The pattern `if (typeof console !== "undefined" && typeof console.warn === "function") { console.warn(...) }` appears 3 times in this codepath. A `logBuilderAgentPersistError(...)` helper centralizes message and makes future log-collector wiring trivial.

**E.P2.3 — Type the `safePayload` parameter to `persistedMessageToChat` more strictly.**
Today it's `BuilderAgentPersistedMessage.safePayload: Readonly<Record<string, unknown>>` and the rehydrator uses repeated `as { foo: unknown }` casts. A tagged union on `kind` would eliminate the casts. Trivial refactor.

---

## F. Tests to Add

### R0 — Pinning the §C P0 fix (mandatory regression guard)

**File:** `tests/unit/features/workflow-builder/panels/BuilderAiPanel.persistedThread.strictMode.test.tsx`

1. `it("rehydrates persisted messages on mount under <StrictMode>")` — wrap the `render(<BuilderAiPanel />)` call in `<StrictMode>`. Assert the persisted user message + plan_result both render after waitFor. Today this test will FAIL on the current code; after E.P0.1 lands it must PASS.
2. `it("does not double-call getBuilderAgentThread under <StrictMode>")` — assert `mockGetThread` is called exactly once across the Strict Mode cycle (it's the dedup-still-works guard).
3. `it("rehydrates after workflowId change (sequential mounts on different workflow ids)")` — render with `workflowId="wf-1"`, await rehydrate, switch to `workflowId="wf-2"`, assert `mockGetThread` called with "wf-2" and new persisted messages render.

### R1 — Persisted needs-input plan after refresh (locks in Option A)

**File:** `tests/unit/features/workflow-builder/panels/BuilderAiPanel.persistedThread.test.tsx` (extend)

4. `it("renders persisted needs-input plan_result as read-only summary, no controls")` — persist a plan_result with `requiredUserInput`. On rehydrate, assert the message renders the `builder-ai-plan-result-previous` summary AND **no `builder-ai-needs-input` controls block** AND **no `builder-ai-apply-button`** AND `followUpMode === false` (composer shows "Plan with AI" not "Send details").

### R2 — Visible-error signal on load failure (E.P1.1)

**File:** same as R1.

5. `it("renders a non-blocking notice when getBuilderAgentThread rejects")` — currently the only signal is `console.warn`. Add a test that mocks reject and asserts the new notice testid is present alongside the intro hint.

### R3 — Empty-history vs failed-load distinguishability

**File:** same.

6. `it("shows the intro hint with no notice when persisted thread is empty")` — `mockGetThread` resolves with `messages: []`. Intro renders, no error notice.

### R4 — POST persistence remount race (defense-in-depth)

**File:** `tests/unit/features/workflow-builder/panels/BuilderAiPanel.persistedThread.test.tsx` (extend)

7. `it("on remount after a successful plan, persisted messages survive")` — pseudo-refresh: render, submit a plan (mockPlan resolves), `unmount()`, re-render, assert `mockGetThread` is called again and returns the prior-session messages (test mocks GET to reflect what would be in DB).

---

## G. What NOT to Change

Locked surfaces — out of scope for this slice and any follow-up implementation slice unless explicitly re-scoped:

- **Provider metadata** (any `services/discovery/_registry`, integration `actions.ts` / `triggers.ts` definitions) — no audit finding implicates them.
- **Workflow execution** (`core/workflows/lifecycle`, `services/execution/**`) — not part of the React Agent surface.
- **Billing / task accounting** (`services/billing/**`, `app/api/billing/**`) — untouched and unrelated.
- **`WorkflowPatchSchema`** (`contracts/ai/workflowPatch.ts` or wherever it lives) and the AI-3 / AI-5 validator + preview pipeline — strict by design; no audit finding implicates them.
- **Anthropic adapter** (`services/ai/adapters/**`) — clean separation from the planner; not part of this audit.
- **General app help assistant** — explicitly out of scope per the AI-23 plan; this audit does not cover it.
- **`composeFollowUpPrompt` algorithm** — well-tested (18 cases) and produces the right shape.
- **Sanitization allowlist / denylist** — already defense-in-depth on client + server; changing it is a security review, not a bug fix.
- **DB migration `20260526000000_builder_agent_threads.sql`** — RLS, grants, indexes, constraints are correct. Do not alter.

---

## H. Audit Process Notes

- Branch: `builder-ui-v1-audit-1` (already exists; no new branch created).
- Files changed by this slice: only this audit doc (`docs/slices/phase-4/react-agent-end-to-end-audit.md`).
- No tests run as part of the audit; targeted test review only.
- Two `Explore` subagents ran in parallel: one for planner / prompt / sanitizer / contracts; one for test coverage. Findings merged into §§ B / D / F.

---

## I. Recommended Next Implementation Slice

**Slice 4.AI-26 — React Agent persisted-thread Strict Mode race fix + visibility.**

Scope:
1. Apply E.P0.1 (5-line fix in `BuilderAiPanel.tsx`).
2. Apply E.P1.1 (inline non-blocking notice on persistence load/append failures).
3. Add R0 + R1 + R2 + R3 + R4 tests.

Out of scope for AI-26:
- Resumable follow-up after refresh (Option B). Defer until users request it.
- Page-level ownership defense-in-depth (E.P1.3). Track in a future security-hygiene slice.
- Test helpers, logger wiring (P2 items).

Risk: low. The change is one effect rewrite + one small status pill. No database, RLS, planner, or apply path changes. No backwards-compatibility concerns (no on-disk shape changes).
